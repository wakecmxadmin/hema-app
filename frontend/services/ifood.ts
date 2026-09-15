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
  catalogs: { catalogId: string; status: string; context: string[] }[];
  sellableCount: number;
  unsellableCount: number;
  amostraSellable: IfoodSellableItem[];
  unsellable: { produtoId: string; motivo: string[] }[];
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
   */
  sync(options: { dryRun?: boolean } = {}): Promise<ApiResponse<IfoodSyncResult>> {
    const query = options.dryRun ? "?dryRun=true" : "";
    return apiFetch<IfoodSyncResult>(`/ifood/sync${query}`, { method: "POST" });
  },

  /** Confere o que o iFood realmente gravou — o Item API não tem rota de status própria. */
  verifyCatalog(): Promise<ApiResponse<IfoodCatalogVerification>> {
    return apiFetch<IfoodCatalogVerification>("/ifood/catalog/verify");
  },
};
