import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { supabase } from '../lib/supabase';
import { ExpoPushService } from '../notifications/expo-push.service';

/**
 * Cancela pedidos que ficaram em `awaiting_customer_payment` além da janela
 * de 1h e libera as reservas. Roda a cada 5min.
 */
@Injectable()
export class PaymentTimeoutCron {
  private readonly logger = new Logger(PaymentTimeoutCron.name);

  constructor(private readonly expoPushService: ExpoPushService) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async cancelExpiredPayments(): Promise<void> {
    const nowIso = new Date().toISOString();

    const { data: expired, error } = await supabase
      .from('orders')
      .select(
        `id, user_id,
         order_items ( product_id, quantity, weight )`,
      )
      .eq('status', 'awaiting_customer_payment')
      .lt('payment_window_expires_at', nowIso);

    if (error) {
      this.logger.error(`Falha ao buscar pedidos expirados: ${error.message}`);
      return;
    }

    if (!expired || expired.length === 0) return;

    this.logger.log(`Cancelando ${expired.length} pedido(s) expirado(s).`);

    for (const order of expired) {
      // Update guardado em status — evita corrida com cliente que está
      // pagando agora mesmo.
      const { error: updateError, count } = await supabase
        .from('orders')
        .update(
          {
            status: 'cancelled',
            rejection_reason: 'Janela de pagamento expirada (1h).',
          },
          { count: 'exact' },
        )
        .eq('id', order.id)
        .eq('status', 'awaiting_customer_payment');

      if (updateError) {
        this.logger.error(
          `Falha ao expirar pedido ${order.id}: ${updateError.message}`,
        );
        continue;
      }
      if (!count) continue; // outro processo já cuidou

      const items = (order.order_items as any[]) ?? [];
      if (items.length > 0) {
        const releaseItems = items.map((it: any) => ({
          product_id: it.product_id,
          quantity: it.quantity ? it.quantity : (it.weight || 0) / 1000,
        }));

        const { error: releaseError } = await supabase.rpc('release_stock', {
          items: releaseItems,
        });
        if (releaseError) {
          this.logger.error(
            `Falha ao liberar reserva do pedido ${order.id}: ${releaseError.message}`,
          );
        }
      }

      void this.expoPushService.notifyUser(order.user_id, {
        title: 'Pedido expirou ⏰',
        body: 'Você não pagou no tempo. Crie um novo pedido se ainda quiser.',
        data: { type: 'order_payment_expired', orderId: order.id },
      });
    }
  }
}
