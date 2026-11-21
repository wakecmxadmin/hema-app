import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { supabase } from '../lib/supabase';
import { Volume } from './melhor-envio.packaging';

/**
 * Cliente da API do Melhor Envio. Referência completa em `MELHOR_ENVIO.md`.
 *
 * Dois modos de autenticação:
 * - `MELHOR_ENVIO_ACCESS_TOKEN` no .env: token gerado no painel. Prático para
 *   testar no sandbox, mas webhooks não disparam para etiquetas criadas assim
 *   (só para as criadas pelo app onde o webhook está cadastrado).
 * - OAuth do app (`MELHOR_ENVIO_CLIENT_ID/SECRET`): autorizado uma vez pelo
 *   admin em `/melhor-envio/oauth/start`; os tokens ficam em
 *   `melhor_envio_auth` e são renovados sozinhos. É o modo de produção.
 */

const SCOPES = [
  'shipping-calculate',
  'cart-read',
  'cart-write',
  'shipping-checkout',
  'shipping-generate',
  'shipping-print',
  'shipping-tracking',
  'shipping-cancel',
  'shipping-companies',
  'orders-read',
].join(' ');

/** Renova quando faltar menos que isso para o access_token expirar. */
const REFRESH_MARGIN_MS = 10 * 24 * 60 * 60 * 1000;

export interface MeResult<T = any> {
  ok: boolean;
  status: number;
  body: T;
}

export interface MeQuoteOption {
  service_id: number;
  name: string;
  company: string;
  company_picture: string | null;
  price: number;
  delivery_days: number;
  delivery_range: { min: number; max: number } | null;
}

export interface MeTrackingInfo {
  id: string;
  status: string;
  tracking: string | null;
  melhorenvio_tracking: string | null;
}

/** Mensagem legível a partir dos formatos de erro (diferentes) da API. */
export function meErrorMessage(body: any): string {
  if (!body) return 'sem resposta';
  if (typeof body === 'string') return body.substring(0, 300);
  const errors = body.errors ?? body.error;
  if (errors && typeof errors === 'object') {
    const flat = Object.values(errors)
      .flat(3)
      .filter((v) => typeof v === 'string');
    if (flat.length > 0) return flat.join(' ').substring(0, 300);
  }
  if (typeof body.error === 'string') return body.error;
  if (typeof body.message === 'string') return body.message;
  return JSON.stringify(body).substring(0, 300);
}

@Injectable()
export class MelhorEnvioService {
  private readonly logger = new Logger(MelhorEnvioService.name);
  private refreshing: Promise<string | null> | null = null;

  // ───────────────────────── config ─────────────────────────

  get baseUrl(): string {
    return (
      process.env.MELHOR_ENVIO_BASE_URL ?? 'https://sandbox.melhorenvio.com.br'
    ).replace(/\/+$/, '');
  }

  private get userAgent(): string {
    return process.env.MELHOR_ENVIO_USER_AGENT ?? 'Hema App';
  }

  private get staticToken(): string | undefined {
    return process.env.MELHOR_ENVIO_ACCESS_TOKEN || undefined;
  }

  private get usesOAuth(): boolean {
    return (
      !this.staticToken &&
      !!process.env.MELHOR_ENVIO_CLIENT_ID &&
      !!process.env.MELHOR_ENVIO_CLIENT_SECRET
    );
  }

  /** Há credencial e CEP de origem para cotar. */
  isConfigured(): boolean {
    return (
      (!!this.staticToken || this.usesOAuth) &&
      !!process.env.MELHOR_ENVIO_FROM_POSTAL_CODE
    );
  }

  // ───────────────────────── OAuth ─────────────────────────

  /** URL de autorização. Grava o `state` para conferir no callback. */
  async buildAuthorizeUrl(): Promise<string> {
    const state = randomBytes(24).toString('hex');
    const row = {
      id: 1,
      oauth_state: state,
      updated_at: new Date().toISOString(),
    };
    await supabase.from('melhor_envio_auth').upsert(row);

    const params = new URLSearchParams({
      client_id: process.env.MELHOR_ENVIO_CLIENT_ID ?? '',
      redirect_uri: process.env.MELHOR_ENVIO_REDIRECT_URI ?? '',
      response_type: 'code',
      state,
      scope: SCOPES,
    });
    return `${this.baseUrl}/oauth/authorize?${params.toString()}`;
  }

  async handleOAuthCallback(
    code: string,
    state: string,
  ): Promise<{ ok: boolean; message: string }> {
    const { data: row } = await supabase
      .from('melhor_envio_auth')
      .select('oauth_state')
      .eq('id', 1)
      .maybeSingle();

    const expected = row?.oauth_state ?? '';
    if (
      !expected ||
      expected.length !== state.length ||
      !timingSafeEqual(Buffer.from(expected), Buffer.from(state))
    ) {
      return { ok: false, message: 'state inválido — gere o link de novo.' };
    }

    const result = await this.tokenRequest({
      grant_type: 'authorization_code',
      client_id: Number(process.env.MELHOR_ENVIO_CLIENT_ID),
      client_secret: process.env.MELHOR_ENVIO_CLIENT_SECRET,
      redirect_uri: process.env.MELHOR_ENVIO_REDIRECT_URI,
      code,
    });

    if (!result) {
      return { ok: false, message: 'Falha ao trocar o code por token.' };
    }
    return { ok: true, message: 'Melhor Envio autorizado.' };
  }

  private async tokenRequest(
    payload: Record<string, any>,
  ): Promise<string | null> {
    try {
      const response = await fetch(`${this.baseUrl}/oauth/token`, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'User-Agent': this.userAgent,
        },
        body: JSON.stringify(payload),
      });
      const body: any = await response.json().catch(() => ({}));

      if (!response.ok || !body.access_token) {
        this.logger.error(
          `Melhor Envio token (${payload.grant_type}) falhou (${response.status}): ${meErrorMessage(body)}`,
        );
        return null;
      }

      const expiresAt = new Date(
        Date.now() + Number(body.expires_in ?? 2592000) * 1000,
      ).toISOString();

      const { error } = await supabase.from('melhor_envio_auth').upsert({
        id: 1,
        access_token: body.access_token,
        refresh_token: body.refresh_token,
        expires_at: expiresAt,
        oauth_state: null,
        updated_at: new Date().toISOString(),
      });
      if (error) {
        this.logger.error(
          `Falha ao salvar tokens do Melhor Envio: ${error.message}`,
        );
      }

      this.logger.log(`Melhor Envio: token salvo, expira em ${expiresAt}.`);
      return body.access_token;
    } catch (err: any) {
      this.logger.error(
        `Falha de rede no token do Melhor Envio: ${err?.message ?? err}`,
      );
      return null;
    }
  }

  /** Renova com o refresh_token salvo. Chamadas simultâneas compartilham a mesma renovação. */
  private refreshToken(): Promise<string | null> {
    if (this.refreshing) return this.refreshing;

    this.refreshing = (async () => {
      const { data: row } = await supabase
        .from('melhor_envio_auth')
        .select('refresh_token')
        .eq('id', 1)
        .maybeSingle();

      if (!row?.refresh_token) {
        this.logger.error(
          'Melhor Envio sem refresh_token — autorize o app em /melhor-envio/oauth/start.',
        );
        return null;
      }

      return this.tokenRequest({
        grant_type: 'refresh_token',
        client_id: Number(process.env.MELHOR_ENVIO_CLIENT_ID),
        client_secret: process.env.MELHOR_ENVIO_CLIENT_SECRET,
        refresh_token: row.refresh_token,
      });
    })().finally(() => {
      this.refreshing = null;
    });

    return this.refreshing;
  }

  private async accessToken(): Promise<string | null> {
    if (this.staticToken) return this.staticToken;
    if (!this.usesOAuth) return null;

    const { data: row } = await supabase
      .from('melhor_envio_auth')
      .select('access_token, expires_at')
      .eq('id', 1)
      .maybeSingle();

    if (!row?.access_token) return null;

    const expiresAt = row.expires_at ? new Date(row.expires_at).getTime() : 0;
    if (expiresAt - Date.now() < REFRESH_MARGIN_MS) {
      return (await this.refreshToken()) ?? row.access_token;
    }
    return row.access_token;
  }

  /** Renova com folga. O refresh_token vale 45 dias; rodando todo dia nunca expira. */
  @Cron(CronExpression.EVERY_DAY_AT_4AM)
  async refreshIfNeeded(): Promise<void> {
    if (!this.usesOAuth) return;
    await this.accessToken();
  }

  // ───────────────────────── HTTP ─────────────────────────

  private async request<T = any>(
    method: 'GET' | 'POST' | 'DELETE',
    path: string,
    body?: any,
    retried = false,
  ): Promise<MeResult<T>> {
    const token = await this.accessToken();
    if (!token) {
      return {
        ok: false,
        status: 0,
        body: { message: 'Melhor Envio não autorizado.' } as any,
      };
    }

    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'User-Agent': this.userAgent,
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });

      const text = await response.text();
      let parsed: any = {};
      try {
        parsed = text ? JSON.parse(text) : {};
      } catch {
        parsed = { message: text.substring(0, 500) };
      }

      // Recomendação da doc: em Unauthenticated, renova e repete uma vez.
      if (response.status === 401 && this.usesOAuth && !retried) {
        const renewed = await this.refreshToken();
        if (renewed) return this.request(method, path, body, true);
      }

      if (!response.ok) {
        this.logger.error(
          `Melhor Envio ${method} ${path} falhou (${response.status}): ${meErrorMessage(parsed)}`,
        );
      }

      return { ok: response.ok, status: response.status, body: parsed };
    } catch (err: any) {
      this.logger.error(
        `Falha de rede no Melhor Envio ${method} ${path}: ${err?.message ?? err}`,
      );
      return {
        ok: false,
        status: 0,
        body: { message: err?.message ?? 'network error' } as any,
      };
    }
  }

  // ───────────────────────── API ─────────────────────────

  /**
   * Cotação para uma caixa. Devolve só os serviços que atendem o trecho,
   * do mais barato para o mais caro, já com `custom_price` (que inclui as
   * taxas/prazos extras configurados no painel).
   */
  async quote(
    toPostalCode: string,
    volume: Volume,
    insuranceValue: number,
  ): Promise<{ ok: boolean; options: MeQuoteOption[]; message?: string }> {
    const payload: any = {
      from: { postal_code: process.env.MELHOR_ENVIO_FROM_POSTAL_CODE },
      to: { postal_code: toPostalCode },
      volumes: [
        {
          width: volume.width,
          height: volume.height,
          length: volume.length,
          weight: volume.weight,
          insurance: Number(insuranceValue.toFixed(2)),
        },
      ],
      options: { receipt: false, own_hand: false },
    };
    if (process.env.MELHOR_ENVIO_SERVICES) {
      payload.services = process.env.MELHOR_ENVIO_SERVICES;
    }

    const result = await this.request<any[]>(
      'POST',
      '/api/v2/me/shipment/calculate',
      payload,
    );

    if (!result.ok || !Array.isArray(result.body)) {
      return { ok: false, options: [], message: meErrorMessage(result.body) };
    }

    const options: MeQuoteOption[] = result.body
      .filter((s: any) => !s.error && (s.custom_price ?? s.price))
      .map((s: any) => ({
        service_id: Number(s.id),
        name: String(s.name),
        company: String(s.company?.name ?? ''),
        company_picture: s.company?.picture ?? null,
        price: Number(s.custom_price ?? s.price),
        delivery_days: Number(s.custom_delivery_time ?? s.delivery_time ?? 0),
        delivery_range: s.custom_delivery_range ?? s.delivery_range ?? null,
      }))
      .filter((o) => Number.isFinite(o.price) && o.price > 0)
      .sort((a, b) => a.price - b.price);

    return { ok: true, options };
  }

  addToCart(payload: any): Promise<MeResult> {
    return this.request('POST', '/api/v2/me/cart', payload);
  }

  removeFromCart(meOrderId: string): Promise<MeResult> {
    return this.request('DELETE', `/api/v2/me/cart/${meOrderId}`);
  }

  checkout(meOrderId: string): Promise<MeResult> {
    return this.request('POST', '/api/v2/me/shipment/checkout', {
      orders: [meOrderId],
    });
  }

  generate(meOrderId: string): Promise<MeResult> {
    return this.request('POST', '/api/v2/me/shipment/generate', {
      orders: [meOrderId],
    });
  }

  /** Link de impressão público (abre sem login no Melhor Envio). */
  print(meOrderId: string): Promise<MeResult<{ url?: string }>> {
    return this.request('POST', '/api/v2/me/shipment/print', {
      mode: 'public',
      orders: [meOrderId],
    });
  }

  async tracking(
    meOrderIds: string[],
  ): Promise<Record<string, MeTrackingInfo> | null> {
    if (meOrderIds.length === 0) return {};
    const result = await this.request('POST', '/api/v2/me/shipment/tracking', {
      orders: meOrderIds,
    });
    return result.ok && result.body && typeof result.body === 'object'
      ? result.body
      : null;
  }

  async cancel(meOrderId: string, description: string): Promise<MeResult> {
    const check = await this.request(
      'POST',
      '/api/v2/me/shipment/cancellable',
      { orders: [meOrderId] },
    );
    if (check.ok && check.body?.[meOrderId]?.cancellable === false) {
      return {
        ok: false,
        status: 409,
        body: {
          message: 'Etiqueta não pode mais ser cancelada no Melhor Envio.',
        },
      };
    }
    return this.request('POST', '/api/v2/me/shipment/cancel', {
      order: {
        id: meOrderId,
        reason_id: '2', // sempre 2 para integrações
        description: description.substring(0, 255),
      },
    });
  }

  // ───────────────────────── webhook ─────────────────────────

  /** `x-me-signature` = base64(HMAC-SHA256(corpo bruto, client_secret)). */
  isValidSignature(rawBody: Buffer | undefined, signature?: string): boolean {
    const secret = process.env.MELHOR_ENVIO_CLIENT_SECRET;
    if (!secret || !rawBody || !signature) return false;
    const expected = Buffer.from(
      createHmac('sha256', secret).update(rawBody).digest('base64'),
    );
    const received = Buffer.from(signature);
    return (
      expected.length === received.length && timingSafeEqual(expected, received)
    );
  }
}
