import { Injectable, Logger } from '@nestjs/common';
import { supabase } from '../lib/supabase';
import {
  LogManagerItem,
  LogManagerService,
  LogManagerShipmentPayload,
} from './logmanager.service';

// Status do LogManager mapeados para os nossos. Mantemos o status do pedido (`status`)
// apenas para transições significativas e usamos `shipping_status` para o estado bruto.
const STATUS_MAP: Record<string, string | null> = {
  collected: 'shipped',
  coletado: 'shipped',
  shipped: 'shipped',
  em_rota: 'in_delivery',
  in_delivery: 'in_delivery',
  delivered: 'delivered',
  entregue: 'delivered',
  cancelled: null, // não rebaixa o pedido — só registra
  cancelado: null,
};

function centavos(reais: number | string): number {
  return Math.round(Number(reais) * 100);
}

function defaultDimensions(itemCount: number): {
  largura: number;
  altura: number;
  comprimento: number;
  peso: number;
} {
  const boxCm = Number(process.env.SHIPPING_DEFAULT_BOX_CM ?? 30);
  const baseWeightG = Number(process.env.SHIPPING_BASE_WEIGHT_G ?? 500);
  const unitWeightG = Number(process.env.SHIPPING_UNIT_WEIGHT_G ?? 300);
  return {
    largura: boxCm,
    altura: boxCm,
    comprimento: boxCm,
    peso: baseWeightG + unitWeightG * Math.max(itemCount, 1),
  };
}

@Injectable()
export class ShippingService {
  private readonly logger = new Logger(ShippingService.name);

  constructor(private readonly logManager: LogManagerService) {}

  /**
   * Idempotente: se o pedido já tem `logmanager_envio_id`, não dispara de novo.
   * Pickup orders (sem address_id) são ignorados.
   */
  async createForOrder(orderId: string): Promise<void> {
    if (!this.logManager.isConfigured()) {
      this.logger.warn(
        `Pulando envio para pedido ${orderId}: LogManager não configurado.`,
      );
      return;
    }

    try {
      const { data: order, error } = await supabase
        .from('orders')
        .select(
          `id, user_id, status, total_price, delivery_fee, payment_method,
           logmanager_envio_id,
           order_items ( id, product_name, product_price, quantity, weight, subtotal ),
           addresses ( street, number, complement, neighborhood, city, state, zip_code )`,
        )
        .eq('id', orderId)
        .single();

      if (error || !order) {
        this.logger.error(
          `Pedido ${orderId} não encontrado para envio: ${error?.message}`,
        );
        return;
      }

      if (order.logmanager_envio_id) {
        this.logger.log(
          `Pedido ${orderId} já possui idEnvio ${order.logmanager_envio_id}, pulando.`,
        );
        return;
      }

      if (!order.addresses) {
        this.logger.log(
          `Pedido ${orderId} é retirada na loja — sem envio.`,
        );
        return;
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('name, phone')
        .eq('id', order.user_id)
        .single();

      const address: any = order.addresses;
      const items: any[] = order.order_items ?? [];
      const dimensions = defaultDimensions(items.length);

      const itens: LogManagerItem[] = items.map((it) => ({
        quantidade: it.quantity ?? 1,
        descricao: it.product_name,
        dimensoes: [dimensions],
      }));

      const idEnvio = `HEMA-${order.id.substring(0, 8).toUpperCase()}`;
      const phone = profile?.phone ?? '';

      const payload: LogManagerShipmentPayload = {
        idEnvio,
        dtCriacao: new Date().toISOString().substring(0, 10),
        vlFrete: centavos(order.delivery_fee ?? 0),
        vlPago: centavos(order.total_price ?? 0),
        nomeComprador: profile?.name ?? 'Cliente',
        telefoneComprador: phone,
        telefoneComprador_1: phone,
        idVenda: order.id,
        comentarios: `Pagamento: ${order.payment_method}`,
        // NFe — não emitimos. Mandamos valores dummy. Se LogManager rejeitar,
        // teremos que ajustar (ver staff-identification do trade-off).
        chaveNFE: '',
        numeroNFE: '',
        serieNFE: '',
        enderecoEntrega: address.street ?? '',
        enderecoEntregaNumero: address.number ?? '',
        enderecoEntregaComplemento: address.complement ?? '',
        cepEntrega: (address.zip_code ?? '').replace(/\D/g, ''),
        cidadeEntrega: address.city ?? '',
        estadoEntrega: address.state ?? '',
        bairroEntrega: address.neighborhood ?? '',
        itens,
      };

      const result = await this.logManager.createShipment(payload);

      if (result.ok) {
        await supabase
          .from('orders')
          .update({
            logmanager_envio_id: idEnvio,
            shipping_status: 'created',
            shipping_dispatched_at: new Date().toISOString(),
            shipping_last_error: null,
          })
          .eq('id', orderId);
      } else {
        await supabase
          .from('orders')
          .update({
            shipping_last_error: `HTTP ${result.status}: ${JSON.stringify(result.body).substring(0, 500)}`,
          })
          .eq('id', orderId);
      }
    } catch (err: any) {
      this.logger.error(
        `Erro ao criar envio para pedido ${orderId}: ${err?.message ?? err}`,
      );
      await supabase
        .from('orders')
        .update({ shipping_last_error: err?.message ?? 'unknown error' })
        .eq('id', orderId)
        .then(() => {});
    }
  }

  /**
   * Webhook handler — atualiza o shipping_status sempre e, quando o status
   * tem mapeamento significativo, também atualiza o `status` do pedido (e
   * dispara o Realtime que o cliente já escuta para notificações in-app).
   */
  async handleStatusWebhook(payload: any): Promise<void> {
    const orderShortId: string | undefined = payload?.orderId;
    const carrierStatus: string | undefined = payload?.status;

    if (!orderShortId || !carrierStatus) {
      this.logger.warn(
        `Webhook LogManager ignorado — payload incompleto: ${JSON.stringify(payload)}`,
      );
      return;
    }

    const { data: order, error } = await supabase
      .from('orders')
      .select('id, status, logmanager_envio_id')
      .eq('logmanager_envio_id', orderShortId)
      .single();

    if (error || !order) {
      this.logger.warn(
        `Webhook LogManager: pedido com idEnvio=${orderShortId} não encontrado.`,
      );
      return;
    }

    const normalized = carrierStatus.toLowerCase();
    const mappedOrderStatus = STATUS_MAP[normalized];

    const update: Record<string, any> = { shipping_status: normalized };
    if (mappedOrderStatus && order.status !== mappedOrderStatus) {
      update.status = mappedOrderStatus;
    }

    const { error: updateError } = await supabase
      .from('orders')
      .update(update)
      .eq('id', order.id);

    if (updateError) {
      this.logger.error(
        `Erro ao atualizar pedido ${order.id} via webhook: ${updateError.message}`,
      );
      return;
    }

    this.logger.log(
      `Webhook LogManager: pedido ${order.id} shipping_status=${normalized}${update.status ? ` status=${update.status}` : ''}`,
    );
  }
}
