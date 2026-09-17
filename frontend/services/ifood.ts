import { apiFetch, ApiResponse } from "./api";

export interface IfoodStatus {
  configurado: boolean;
  modo: "centralized" | "distributed";
  autenticado: boolean;
  merchantId: string | null;
  syncAutomatico: boolean;
}

export interface IfoodTokenResult {
  autenticado: boolean;
  modo: "centralized" | "distributed";
}

export interface IfoodSyncResult {
  ok: boolean;
  total: number;
  enviados: number;
  ignorados: number;
  /** Motivo do descarte -> quantidade. Ex.: { "sem codigo": 313 } */
  motivoIgnorados: Record<string, number>;
  lotes: number;
  modo: "patch" | "post";
  falhas: { lote: number; status: number; body: any }[];
  dryRun: boolean;
  /** Até 3 itens do payload real — pra pré-visualizar o body antes de enviar. */
  amostraPayload: any[];
}

export interface IfoodMerchant {
  id: string;
  name?: string;
  corporateName?: string;
}

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

export interface IfoodCatalogVerification {
  ok: boolean;
  catalogs: { catalogId: string; status: string; context: string[]; modifiedAt?: string }[];
  sellableCount: number;
  unsellableCount: number;
  /** Até 30 itens — o total real está em `sellableCount`. */
  amostraSellable: IfoodSellableItem[];
  /** Até 30 itens — o total real está em `unsellableCount`. */
  unsellable: { produtoId: string; motivo: string[] }[];
}

export type IfoodCallFlow =
  | "auth"
  | "ingestion-full"
  | "ingestion-partial"
  | "other";

export interface IfoodCallLogEntry {
  id: number;
  timestamp: string;
  flow: IfoodCallFlow;
  method: string;
  path: string;
  status: number;
  ok: boolean;
  durationMs: number;
  headers?: any;
  request?: any;
  response?: any;
}

export const IfoodService = {
  status(): Promise<ApiResponse<IfoodStatus>> {
    return apiFetch<IfoodStatus>("/ifood/status");
  },

  merchants(): Promise<ApiResponse<IfoodMerchant[]>> {
    return apiFetch<IfoodMerchant[]>("/ifood/merchants");
  },

  /** Endpoint 1/3 da homologação: força a renovação do token OAuth. */
  authToken(): Promise<ApiResponse<IfoodTokenResult>> {
    return apiFetch<IfoodTokenResult>("/ifood/auth/token", { method: "POST" });
  },

  /**
   * `dryRun` monta o payload e conta tudo sem enviar nada ao iFood — é o modo
   * seguro para conferir o catálogo antes de publicar.
   *
   * `mode: "post"` + `reset` são o endpoint 2/3 (carga completa, criação/
   * reativação). `fields: "price-stock"` é sempre PATCH e é o endpoint 3/3
   * (atualização parcial).
   */
  sync(
    options: {
      dryRun?: boolean;
      mode?: "patch" | "post";
      reset?: boolean;
      fields?: "full" | "price-stock";
    } = {},
  ): Promise<ApiResponse<IfoodSyncResult>> {
    const params = new URLSearchParams();
    if (options.dryRun) params.set("dryRun", "true");
    if (options.mode) params.set("mode", options.mode);
    if (options.reset) params.set("reset", "true");
    if (options.fields) params.set("fields", options.fields);
    const query = params.toString();
    return apiFetch<IfoodSyncResult>(`/ifood/sync${query ? `?${query}` : ""}`, {
      method: "POST",
    });
  },

  /** Confere o que o iFood realmente gravou — o Item API não tem rota de status própria. */
  verifyCatalog(): Promise<ApiResponse<IfoodCatalogVerification>> {
    return apiFetch<IfoodCatalogVerification>("/ifood/catalog/verify");
  },

  /** Últimas chamadas feitas à Merchant-API — painel de monitoramento. */
  callLog(): Promise<ApiResponse<IfoodCallLogEntry[]>> {
    return apiFetch<IfoodCallLogEntry[]>("/ifood/call-log");
  },
};
