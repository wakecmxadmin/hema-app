import { Injectable, Logger } from '@nestjs/common';
import { IfoodAuthService } from './ifood-auth.service';

export interface IfoodApiResult<T = any> {
  ok: boolean;
  status: number;
  body: T;
}

export interface IfoodMerchant {
  id: string;
  name: string;
  corporateName?: string;
}

export interface IfoodCatalog {
  catalogId: string;
  status: string;
  context: string[];
  modifiedAt: string;
  groupId: string;
}

/** Item como o iFood realmente exibe no catálogo — usado para conferir o sync. */
export interface IfoodSellableItem {
  itemId: string;
  categoryId: string;
  itemEan?: string;
  itemExternalCode?: string;
  categoryName: string;
  itemName: string;
  itemDescription?: string;
  logosUrls?: string[];
  itemPrice?: { value: number; originalValue?: number };
  itemUnit?: string;
}

export interface IfoodUnsellableCategory {
  id: string;
  status: string;
  restrictions: string[];
  unsellableItems: { id: string; productId: string; restrictions: string[] }[];
}

/**
 * Cliente HTTP autenticado da Merchant-API do iFood.
 * Concentra token, headers e tratamento de erro num lugar só.
 */
@Injectable()
export class IfoodApiService {
  private readonly logger = new Logger(IfoodApiService.name);

  constructor(private readonly auth: IfoodAuthService) {}

  private get apiUrl(): string {
    return (
      process.env.IFOOD_API_URL ?? 'https://merchant-api.ifood.com.br'
    ).replace(/\/+$/, '');
  }

  get merchantId(): string | undefined {
    return process.env.IFOOD_MERCHANT_ID || undefined;
  }

  isConfigured(): boolean {
    return this.auth.isConfigured();
  }

  /** Tentativas totais em erro transitório (429 / 5xx / falha de rede). */
  private readonly maxAttempts = 4;

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Backoff exponencial com jitter: 1s, 2s, 4s (+ até 250ms).
   * Se a resposta trouxer Retry-After, ele manda.
   */
  private backoffMs(attempt: number, retryAfter?: string | null): number {
    const headerSec = Number(retryAfter);
    if (Number.isFinite(headerSec) && headerSec > 0) {
      return Math.min(headerSec * 1000, 30_000);
    }
    return 2 ** (attempt - 1) * 1000 + Math.floor(Math.random() * 250);
  }

  private isTransient(status: number): boolean {
    return status === 429 || status === 408 || status >= 500;
  }

  async request<T = any>(
    path: string,
    init: RequestInit = {},
    isRetry = false,
    attempt = 1,
  ): Promise<IfoodApiResult<T>> {
    const token = await this.auth.getAccessToken();
    if (!token) {
      return {
        ok: false,
        status: 0,
        body: { message: 'sem token de acesso' } as any,
      };
    }

    const url = `${this.apiUrl}${path.startsWith('/') ? path : `/${path}`}`;

    try {
      const response = await fetch(url, {
        ...init,
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
          ...(init.headers ?? {}),
        },
      });

      // Token revogado no meio do caminho: renova uma vez e repete.
      if (response.status === 401 && !isRetry) {
        this.auth.invalidate();
        return this.request<T>(path, init, true, attempt);
      }

      // Throttle ou instabilidade do lado deles: espera e tenta de novo.
      if (this.isTransient(response.status) && attempt < this.maxAttempts) {
        const wait = this.backoffMs(
          attempt,
          response.headers?.get?.('Retry-After'),
        );
        this.logger.warn(
          `iFood ${init.method ?? 'GET'} ${path} respondeu ${response.status} — ` +
            `tentativa ${attempt}/${this.maxAttempts}, repetindo em ${wait}ms.`,
        );
        await this.sleep(wait);
        return this.request<T>(path, init, isRetry, attempt + 1);
      }

      const body: any = await response.json().catch(() => ({}));

      if (!response.ok) {
        this.logger.error(
          `iFood ${init.method ?? 'GET'} ${path} falhou (${response.status}): ${JSON.stringify(body)}`,
        );
      }

      return { ok: response.ok, status: response.status, body };
    } catch (err: any) {
      // Rede caiu: mesma política de backoff dos erros transitórios.
      if (attempt < this.maxAttempts) {
        const wait = this.backoffMs(attempt);
        this.logger.warn(
          `Falha de rede em ${path} (${err?.message ?? err}) — ` +
            `tentativa ${attempt}/${this.maxAttempts}, repetindo em ${wait}ms.`,
        );
        await this.sleep(wait);
        return this.request<T>(path, init, isRetry, attempt + 1);
      }

      this.logger.error(
        `Falha de rede em ${init.method ?? 'GET'} ${path}: ${err?.message ?? err}`,
      );
      return {
        ok: false,
        status: 0,
        body: { message: err?.message ?? 'network error' } as any,
      };
    }
  }

  /** Lojas às quais o aplicativo tem acesso — usado para descobrir o merchantId. */
  async listMerchants(): Promise<IfoodApiResult<IfoodMerchant[]>> {
    return this.request<IfoodMerchant[]>('/merchant/v1.0/merchants');
  }

  /** Detalhes da loja. Confirmado contra a loja de teste. */
  async getMerchant(
    merchantId = this.merchantId,
  ): Promise<IfoodApiResult<IfoodMerchant>> {
    return this.request<IfoodMerchant>(
      `/merchant/v1.0/merchants/${merchantId}`,
    );
  }

  /**
   * Situação operacional da loja (aberta/fechada e validações pendentes).
   * Útil no diagnóstico: a loja de teste começa com is-connected em ERROR.
   */
  async getMerchantStatus(
    merchantId = this.merchantId,
  ): Promise<IfoodApiResult<any[]>> {
    return this.request<any[]>(`/merchant/v1.0/merchants/${merchantId}/status`);
  }

  /** Catálogos da loja — catalogId e groupId saem daqui. Confirmado contra a loja de teste. */
  async listCatalogs(
    merchantId = this.merchantId,
  ): Promise<IfoodApiResult<IfoodCatalog[]>> {
    return this.request(`/catalog/v2.0/merchants/${merchantId}/catalogs`);
  }

  /**
   * O que o iFood realmente tem à venda — nome, descrição, preço e imagem
   * por item. É a única forma de conferir um sync do Item API, que não tem
   * rota de status própria.
   */
  async listSellableItems(
    groupId: string,
    merchantId = this.merchantId,
  ): Promise<IfoodApiResult<IfoodSellableItem[]>> {
    return this.request(
      `/catalog/v2.0/merchants/${merchantId}/catalogs/${groupId}/sellableItems`,
    );
  }

  /** Itens/categorias fora de venda e o motivo (pausado, violação de conteúdo). */
  async listUnsellableItems(
    catalogId: string,
    merchantId = this.merchantId,
  ): Promise<IfoodApiResult<{ categories: IfoodUnsellableCategory[] }>> {
    return this.request(
      `/catalog/v2.0/merchants/${merchantId}/catalogs/${catalogId}/unsellableItems`,
    );
  }
}
