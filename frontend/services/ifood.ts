import { apiFetch, ApiResponse } from "./api";

export interface IfoodStatus {
  configurado: boolean;
  modo: "centralized" | "distributed";
  autenticado: boolean;
  merchantId: string | null;
  syncAutomatico: boolean;
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

export type IfoodCodigoClasse =
  | "ean"
  | "ean-sem-zero"
  | "ean-invalido"
  | "balanca"
  | "interno";

export interface IfoodCodeQuality {
  /** Produtos ativos com código. */
  total: number;
  grupos: Record<IfoodCodigoClasse, number>;
  invalidos: { id: string; name: string; codigo: string }[];
}

export type IfoodLote = "novos" | "alterados" | "removidos";

export interface IfoodChangesResult {
  ok: boolean;
  dryRun: boolean;
  force: boolean;
  runId: string | null;
  total: number;
  novos: number;
  alterados: number;
  /** Desativados no iFood: produto sumiu, perdeu requisito ou trocou de código. */
  removidos: number;
  inalterados: number;
  ignorados: number;
  motivoIgnorados: Record<string, number>;
  enviados: number;
  lotes: number;
  falhas: { lote: number; tipo: IfoodLote; status: number; body: any }[];
  erro?: string;
  amostra: Partial<Record<IfoodLote, any[]>>;
}

export interface IfoodSyncRun {
  id: string;
  trigger: "cron" | "manual";
  force: boolean;
  status: "running" | "success" | "partial" | "error" | "empty";
  started_at: string;
  finished_at: string | null;
  total: number;
  novos: number;
  alterados: number;
  removidos: number;
  inalterados: number;
  ignorados: number;
  enviados: number;
  lotes: number;
  motivo_ignorados: Record<string, number>;
  falhas: IfoodChangesResult["falhas"];
  error: string | null;
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

  /**
   * `dryRun` monta o payload e conta tudo sem enviar nada ao iFood — é o modo
   * seguro para conferir o catálogo antes de publicar.
   *
   * `mode: "post"` é a carga completa (criação/reativação);
   * `fields: "price-stock"` é sempre PATCH (atualização parcial).
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

  /**
   * Envio incremental — só novos, alterados e removidos desde o último envio
   * aceito. `dryRun` calcula a diferença sem chamar o iFood.
   */
  syncChanges(options: { dryRun?: boolean } = {}): Promise<ApiResponse<IfoodChangesResult>> {
    const query = options.dryRun ? "?dryRun=true" : "";
    return apiFetch<IfoodChangesResult>(`/ifood/sync/changes${query}`, { method: "POST" });
  },

  /** Histórico das rodadas de sincronização (cron e manuais), guardado no banco. */
  syncRuns(): Promise<ApiResponse<IfoodSyncRun[]>> {
    return apiFetch<IfoodSyncRun[]>("/ifood/sync/runs");
  },

  /** Raio-x dos códigos de barras dos produtos ativos — não chama o iFood. */
  codeQuality(): Promise<ApiResponse<IfoodCodeQuality>> {
    return apiFetch<IfoodCodeQuality>("/ifood/catalog/codes");
  },

  /** Últimas chamadas feitas à Merchant-API — painel de monitoramento. */
  callLog(): Promise<ApiResponse<IfoodCallLogEntry[]>> {
    return apiFetch<IfoodCallLogEntry[]>("/ifood/call-log");
  },
};
