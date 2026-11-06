import { apiFetch, ApiResponse } from "./api";

export type AdminOrderStatus =
  | "pending"
  | "awaiting_store_confirmation"
  | "awaiting_customer_payment"
  | "waiting_payment"
  | "confirmed"
  | "preparing"
  | "awaiting_dispatch"
  | "shipped"
  | "in_delivery"
  | "delivered"
  | "completed"
  | "cancelled";

/** null = nunca houve tentativa de estorno. */
export type RefundStatus =
  | null
  | "pending"
  | "refunded"
  | "partial"
  | "failed"
  | "charged_back";

export interface OrderItemEdit {
  order_item_id: string;
  new_quantity?: number;
  new_weight?: number;
}

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
  mp_payment_id: string | null;
  refund_status: RefundStatus;
  refund_amount: number | null;
  refunded_at: string | null;
  refund_error: string | null;
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

  /**
   * Cancela o pedido. Se ele estiver pago via Mercado Pago, o estorno é
   * automático — `skipRefund` cancela retendo o valor, e `refundAmount`
   * devolve só uma parte.
   */
  async cancel(
    orderId: string,
    opts: { skipRefund?: boolean; refundAmount?: number } = {},
  ): Promise<ApiResponse<any>> {
    const body: Record<string, unknown> = {};
    if (opts.skipRefund) body.skip_refund = true;
    if (opts.refundAmount != null) body.refund_amount = opts.refundAmount;

    return apiFetch(`/admin/orders/${orderId}/cancel`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
  },

  /** Estorno sem cancelar — para pedidos já cancelados ou devolução parcial. */
  async refund(
    orderId: string,
    amount?: number,
  ): Promise<ApiResponse<any>> {
    return apiFetch(`/admin/orders/${orderId}/refund`, {
      method: "POST",
      body: JSON.stringify(amount != null ? { amount } : {}),
    });
  },

  async confirm(
    orderId: string,
    edits?: OrderItemEdit[],
  ): Promise<ApiResponse<any>> {
    return apiFetch(`/admin/orders/${orderId}/confirm`, {
      method: "POST",
      body: JSON.stringify(edits && edits.length > 0 ? { edits } : {}),
    });
  },

  async reject(orderId: string, reason: string): Promise<ApiResponse<any>> {
    return apiFetch(`/admin/orders/${orderId}/reject`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    });
  },
};
