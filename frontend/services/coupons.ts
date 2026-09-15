import { apiFetch, ApiResponse } from "./api";

export interface CouponValidation {
  code: string;
  discount_percent: number;
  discount_amount: number;
}

export interface Coupon {
  id: string;
  code: string;
  description: string | null;
  discount_percent: number;
  max_uses: number | null;
  used_count: number;
  min_order_total: number | null;
  expires_at: string | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
}

export interface CreateCouponInput {
  code: string;
  description?: string | null;
  discount_percent: number;
  is_single_use: boolean;
  max_uses?: number;
  min_order_total?: number | null;
  expires_at?: string | null;
}

// PATCH: `undefined` = não mexe no campo; `null` = limpa o campo. O form de
// edição sempre reflete o valor atual, então um campo deixado vazio significa
// "limpar", nunca "não mexer" — por isso min_order_total/expires_at/description
// aceitam null aqui, diferente da criação.
export type UpdateCouponInput = Omit<Partial<CreateCouponInput>, "code">;

export const CouponsService = {
  validate(code: string): Promise<ApiResponse<CouponValidation>> {
    return apiFetch<CouponValidation>("/coupons/validate", {
      method: "POST",
      body: JSON.stringify({ code }),
    });
  },

  adminList(): Promise<ApiResponse<Coupon[]>> {
    return apiFetch<Coupon[]>("/admin/coupons");
  },

  adminCreate(input: CreateCouponInput): Promise<ApiResponse<Coupon>> {
    return apiFetch<Coupon>("/admin/coupons", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  adminUpdate(
    id: string,
    input: UpdateCouponInput,
  ): Promise<ApiResponse<Coupon>> {
    return apiFetch<Coupon>(`/admin/coupons/${id}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    });
  },

  adminToggle(id: string, isActive: boolean): Promise<ApiResponse<Coupon>> {
    return apiFetch<Coupon>(`/admin/coupons/${id}/toggle`, {
      method: "PATCH",
      body: JSON.stringify({ is_active: isActive }),
    });
  },
};
