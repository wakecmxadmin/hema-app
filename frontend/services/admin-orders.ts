import { apiFetch, ApiResponse } from "./api";

export type AdminOrderStatus =
  | "pending"
  | "waiting_payment"
  | "confirmed"
  | "preparing"
  | "shipped"
  | "in_delivery"
  | "delivered"
  | "completed"
  | "cancelled";

export interface AdminOrderListItem {
  id: string;
  status: AdminOrderStatus;
  payment_status: string;
  payment_method: string;
  total_price: number;
  delivery_fee: number;
  created_at: string;
  user_id: string;
  address_id: string | null;
  shipping_status: string | null;
  shipping_last_error: string | null;
  logmanager_envio_id: string | null;
  order_items: Array<{
    id: string;
    product_name: string;
    quantity: number | null;
    weight: number | null;
    subtotal: number;
  }>;
  addresses: { city: string | null; state: string | null } | null;
  customer: { id: string; name: string | null; phone: string | null } | null;
}

export interface AdminOrderListParams {
  status?: AdminOrderStatus[] | "all";
  search?: string;
  limit?: number;
  offset?: number;
}

export const AdminOrdersService = {
  async list(params: AdminOrderListParams = {}): Promise<ApiResponse<AdminOrderListItem[]>> {
    const query = new URLSearchParams();
    if (params.status && params.status !== "all") {
      query.set("status", params.status.join(","));
    }
    if (params.search) query.set("search", params.search);
    if (params.limit != null) query.set("limit", String(params.limit));
    if (params.offset != null) query.set("offset", String(params.offset));

    const qs = query.toString();
    return apiFetch(`/admin/orders${qs ? `?${qs}` : ""}`, { method: "GET" });
  },

  async detail(orderId: string): Promise<ApiResponse<any>> {
    return apiFetch(`/admin/orders/${orderId}`, { method: "GET" });
  },

  async updateStatus(
    orderId: string,
    status: AdminOrderStatus,
  ): Promise<ApiResponse<any>> {
    return apiFetch(`/admin/orders/${orderId}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    });
  },

  async cancel(orderId: string): Promise<ApiResponse<any>> {
    return apiFetch(`/admin/orders/${orderId}/cancel`, { method: "PATCH" });
  },
};
