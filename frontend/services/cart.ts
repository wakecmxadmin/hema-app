import { apiFetch, ApiResponse } from "./api";

export interface AddCartItemData {
  product_id: string;
  quantity?: number;
  weight?: number;
}

export async function addCartItemService(
  data: AddCartItemData,
): Promise<ApiResponse<{ cart_id: string }>> {
  return apiFetch("/cart/items", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function getCartService(): Promise<ApiResponse<any>> {
  return apiFetch("/cart", { method: "GET" });
}

export async function updateCartItemService(
  id: string,
  data: Partial<AddCartItemData>,
): Promise<ApiResponse<void>> {
  return apiFetch(`/cart/items/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export async function removeCartItemService(
  id: string,
): Promise<ApiResponse<void>> {
  return apiFetch(`/cart/items/${id}`, { method: "DELETE" });
}

export async function validateCartStockService(): Promise<
  ApiResponse<{
    valid: boolean;
    adjustments: {
      item_id: string;
      product_name: string;
      type: "removed" | "reduced";
      reason: string;
      new_quantity?: number;
      new_weight?: number;
    }[];
  }>
> {
  return apiFetch("/cart/validate-stock", { method: "GET" });
}
