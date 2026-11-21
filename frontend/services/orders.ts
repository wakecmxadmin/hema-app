import { apiFetch, ApiResponse } from "./api";

export type PaymentMethod = "pix" | "credit_card" | "cash";

export type OrderStatus =
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

/** Uma opção de frete do Melhor Envio (PAC, SEDEX, Jadlog…). */
export interface ShippingOption {
  service_id: number;
  name: string;
  company: string;
  company_picture: string | null;
  price: number;
  delivery_days: number;
  delivery_range: { min: number; max: number } | null;
}

/**
 * `local`: motoboy (taxa fixa). `melhor_envio`: o cliente escolhe uma das
 * `options`. `unavailable`: não há como entregar no endereço.
 */
export interface ShippingQuote {
  mode: "local" | "melhor_envio" | "unavailable";
  fee: number | null;
  options: ShippingOption[];
}

export const OrdersService = {
  async createOrder({
    address_id,
    payment_method,
    coupon_code,
    shipping_service_id,
  }: {
    address_id?: string | null;
    payment_method: PaymentMethod;
    coupon_code?: string | null;
    shipping_service_id?: number | null;
  }): Promise<ApiResponse<any>> {
    return apiFetch("/orders/checkout", {
      method: "POST",
      body: JSON.stringify({
        address_id: address_id || null,
        payment_method,
        coupon_code: coupon_code || undefined,
        shipping_service_id: shipping_service_id || undefined,
      }),
    });
  },

  /** Frete para o endereço com o carrinho atual. */
  async quoteShipping(addressId: string): Promise<ApiResponse<ShippingQuote>> {
    return apiFetch("/orders/shipping-quote", {
      method: "POST",
      body: JSON.stringify({ address_id: addressId }),
    });
  },

  // 2. Listar Histórico de Pedidos
  async getUserOrders(): Promise<ApiResponse<any>> {
    return apiFetch("/orders/my-orders", { method: "GET" });
  },

  // 3. Ver Detalhes de um Pedido Específico
  async getOrderDetails(orderId: string): Promise<ApiResponse<any>> {
    return apiFetch(`/orders/${orderId}`, { method: "GET" });
  },

  // 4. Cancelar Pedido
  async cancelOrder(orderId: string): Promise<ApiResponse<any>> {
    return apiFetch(`/orders/${orderId}/cancel`, { method: "PATCH" });
  },

  // 4.b. Pagar pedido confirmado pela loja. Para PIX/cartão devolve init_point
  // do MP. Para dinheiro, marca como confirmado direto (pagamento na entrega).
  async proceedToPayment(orderId: string): Promise<
    ApiResponse<{
      init_point?: string;
      sandbox_init_point?: string;
      status?: string;
    }>
  > {
    return apiFetch(`/orders/${orderId}/proceed-to-payment`, { method: "POST" });
  },

  // 5. Repetir Pedido — re-adiciona itens disponíveis ao carrinho
  async reorder(orderId: string): Promise<
    ApiResponse<{
      added: { product_name: string }[];
      skipped: { product_name: string; reason: string }[];
      added_count: number;
      skipped_count: number;
    }>
  > {
    return apiFetch(`/orders/${orderId}/reorder`, { method: "POST" });
  },
};
