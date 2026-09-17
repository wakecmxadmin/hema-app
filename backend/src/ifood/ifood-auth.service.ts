import { Injectable, Logger, Optional } from '@nestjs/common';
import { supabase } from '../lib/supabase';
import { IfoodCallLogService } from './ifood-call-log.service';

interface CachedToken {
  accessToken: string;
  expiresAt: number; // epoch ms
}

export interface UserCodeResponse {
  userCode: string;
  authorizationCodeVerifier: string;
  verificationUrl?: string;
  verificationUrlComplete?: string;
  expiresIn?: number;
}

/**
 * Autenticação OAuth2 do iFood.
 *
 * Dois modos, definidos pelo tipo do aplicativo no Developer Portal:
 *
 * - `centralized` (app privado): `client_credentials` direto. É o modo do
 *   aplicativo de teste.
 * - `distributed` (app público): o lojista autoriza uma vez informando um
 *   `userCode` no Portal do Parceiro; a partir daí vale o `refresh_token`.
 *   Necessário quando as lojas são de outro CNPJ — o caso da Hema.
 *
 * O grant type é liberado por aplicativo: pedir `userCode` num app
 * centralizado devolve `400 Grant type not authorized for client`.
 */
@Injectable()
export class IfoodAuthService {
  private readonly logger = new Logger(IfoodAuthService.name);
  private cached: CachedToken | null = null;
  private inFlight: Promise<string | null> | null = null;

  constructor(@Optional() private readonly callLog?: IfoodCallLogService) {}

  /** Renova este tanto de tempo antes de expirar. */
  private readonly renewMarginMs = 5 * 60 * 1000;

  private get apiUrl(): string {
    return (
      process.env.IFOOD_API_URL ?? 'https://merchant-api.ifood.com.br'
    ).replace(/\/+$/, '');
  }

  private get clientId(): string | undefined {
    return process.env.IFOOD_CLIENT_ID;
  }

  private get clientSecret(): string | undefined {
    return process.env.IFOOD_CLIENT_SECRET;
  }

  get mode(): 'centralized' | 'distributed' {
    return process.env.IFOOD_AUTH_MODE === 'distributed'
      ? 'distributed'
      : 'centralized';
  }

  isConfigured(): boolean {
    return !!this.clientId && !!this.clientSecret;
  }

  invalidate(): void {
    this.cached = null;
  }

  async getAccessToken(): Promise<string | null> {
    if (
      this.cached &&
      Date.now() < this.cached.expiresAt - this.renewMarginMs
    ) {
      return this.cached.accessToken;
    }

    if (this.inFlight) return this.inFlight;

    this.inFlight = this.renew().finally(() => {
      this.inFlight = null;
    });

    return this.inFlight;
  }

  // ---------------------------------------------------------------------
  // Fluxo distribuído
  // ---------------------------------------------------------------------

  /**
   * Passo 1: gera o código que o lojista informa no Portal do Parceiro
   * (Integrações). O `authorizationCodeVerifier` é guardado para o passo 2.
   */
  async requestUserCode(): Promise<UserCodeResponse | null> {
    if (!this.clientId) {
      this.logger.warn('IFOOD_CLIENT_ID ausente.');
      return null;
    }

    const payload = await this.post('/oauth/userCode', {
      clientId: this.clientId,
    });
    if (!payload?.userCode || !payload?.authorizationCodeVerifier) return null;

    await this.persist({
      authorization_code_verifier: payload.authorizationCodeVerifier,
      user_code: payload.userCode,
      user_code_expires_at: payload.expiresIn
        ? new Date(Date.now() + payload.expiresIn * 1000).toISOString()
        : null,
    });

    this.logger.log(`userCode gerado: ${payload.userCode}`);
    return payload as UserCodeResponse;
  }

  /**
   * Passo 2: depois que o lojista autorizou, troca o `authorizationCode`
   * pelo par de tokens. O refresh token é persistido.
   */
  async completeAuthorization(authorizationCode: string): Promise<boolean> {
    const stored = await this.load();
    const verifier = stored?.authorization_code_verifier;

    if (!verifier) {
      this.logger.error(
        'Sem authorizationCodeVerifier — gere um userCode antes.',
      );
      return false;
    }

    const payload = await this.post('/oauth/token', {
      grantType: 'authorization_code',
      clientId: this.clientId!,
      clientSecret: this.clientSecret!,
      authorizationCode,
      authorizationCodeVerifier: verifier,
    });

    if (!payload?.accessToken) return false;

    await this.storeTokens(payload);
    this.logger.log('Autorização concluída: refresh token armazenado.');
    return true;
  }

  // ---------------------------------------------------------------------
  // Renovação
  // ---------------------------------------------------------------------

  private async renew(): Promise<string | null> {
    if (!this.clientId || !this.clientSecret) {
      this.logger.warn(
        'IFOOD_CLIENT_ID/IFOOD_CLIENT_SECRET ausentes — integração desativada.',
      );
      return null;
    }

    const payload =
      this.mode === 'distributed'
        ? await this.renewDistributed()
        : await this.post('/oauth/token', {
            grantType: 'client_credentials',
            clientId: this.clientId,
            clientSecret: this.clientSecret,
          });

    if (!payload?.accessToken) return null;

    await this.storeTokens(payload);
    return payload.accessToken;
  }

  private async renewDistributed(): Promise<any | null> {
    const stored = await this.load();

    if (!stored?.refresh_token) {
      this.logger.error(
        'Sem refresh token: a loja ainda não autorizou o aplicativo. ' +
          'Gere um userCode e peça ao lojista para informá-lo no Portal do Parceiro.',
      );
      return null;
    }

    return this.post('/oauth/token', {
      grantType: 'refresh_token',
      clientId: this.clientId!,
      clientSecret: this.clientSecret!,
      refreshToken: stored.refresh_token,
    });
  }

  private async storeTokens(payload: any): Promise<void> {
    const expiresInSec: number = Number(payload?.expiresIn) || 6 * 60 * 60;
    const expiresAt = Date.now() + expiresInSec * 1000;

    this.cached = { accessToken: payload.accessToken, expiresAt };

    if (this.mode === 'distributed') {
      await this.persist({
        access_token: payload.accessToken,
        access_token_expires_at: new Date(expiresAt).toISOString(),
        ...(payload.refreshToken
          ? { refresh_token: payload.refreshToken }
          : {}),
      });
    }

    this.logger.log(`Token do iFood renovado (expira em ${expiresInSec}s).`);
  }

  // ---------------------------------------------------------------------
  // Infra
  // ---------------------------------------------------------------------

  private async post(path: string, body: Record<string, string>): Promise<any> {
    const fullPath = `/authentication/v1.0${path}`;
    const url = `${this.apiUrl}${fullPath}`;
    const startedAt = Date.now();
    const headersSent = {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    };

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: headersSent,
        body: new URLSearchParams(body),
      });

      const payload: any = await response.json().catch(() => ({}));

      this.callLog?.record({
        flow: 'auth',
        method: 'POST',
        path: fullPath,
        status: response.status,
        ok: response.ok,
        durationMs: Date.now() - startedAt,
        headers: headersSent,
        request: body,
        response: payload,
      });

      if (!response.ok) {
        this.logger.error(
          `iFood ${path} falhou (${response.status}): ${JSON.stringify(payload)}`,
        );
        return null;
      }

      return payload;
    } catch (err: any) {
      this.callLog?.record({
        flow: 'auth',
        method: 'POST',
        path: fullPath,
        status: 0,
        ok: false,
        durationMs: Date.now() - startedAt,
        headers: headersSent,
        request: body,
        response: { message: err?.message ?? 'network error' },
      });
      this.logger.error(`Falha de rede em ${path}: ${err?.message ?? err}`);
      return null;
    }
  }

  private async load(): Promise<any | null> {
    const { data, error } = await supabase
      .from('ifood_auth')
      .select('*')
      .eq('client_id', this.clientId!)
      .maybeSingle();

    if (error) {
      this.logger.error(`Falha ao ler ifood_auth: ${error.message}`);
      return null;
    }
    return data;
  }

  private async persist(fields: Record<string, any>): Promise<void> {
    const { error } = await supabase.from('ifood_auth').upsert(
      {
        client_id: this.clientId!,
        ...fields,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'client_id' },
    );

    if (error) {
      this.logger.error(`Falha ao gravar ifood_auth: ${error.message}`);
    }
  }
}
