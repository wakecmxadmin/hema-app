import { Injectable, Logger } from '@nestjs/common';
import { supabase } from '../lib/supabase';

const EXPO_PUSH_ENDPOINT = 'https://exp.host/--/api/v2/push/send';
const MAX_BATCH_SIZE = 100; // Expo limit per request

export interface ExpoPushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, any>;
  sound?: 'default' | null;
  channelId?: string;
  priority?: 'default' | 'normal' | 'high';
}

interface ExpoPushTicket {
  status: 'ok' | 'error';
  id?: string;
  message?: string;
  details?: { error?: string };
}

@Injectable()
export class ExpoPushService {
  private readonly logger = new Logger(ExpoPushService.name);

  /**
   * Best-effort: erros são logados mas nunca propagados, pra não bloquear
   * o caller (criação/cancelamento de pedido).
   */
  async notifyStaffNewOrder(order: {
    id: string;
    total_price: number | string;
    payment_method?: string | null;
    customer_name?: string | null;
  }): Promise<void> {
    const total = Number(order.total_price);
    const totalFormatted = total.toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    });
    const shortId = order.id.substring(0, 8).toUpperCase();
    const customer = order.customer_name ? ` de ${order.customer_name}` : '';

    await this.broadcastToStaff({
      title: 'Novo pedido recebido 📦',
      body: `Pedido #${shortId}${customer} — ${totalFormatted}`,
      data: { type: 'new_order', orderId: order.id },
    });
  }

  async notifyStaffOrderCancelled(order: {
    id: string;
    customer_name?: string | null;
    reason?: string | null;
  }): Promise<void> {
    const shortId = order.id.substring(0, 8).toUpperCase();
    const customer = order.customer_name ?? 'Cliente';
    const tail = order.reason ? ` — ${order.reason}` : '';

    await this.broadcastToStaff({
      title: 'Pedido cancelado ❌',
      body: `${customer} cancelou o pedido #${shortId}${tail}`,
      data: { type: 'order_cancelled', orderId: order.id },
    });
  }

  /**
   * Faz fan-out para todos os tokens marcados como is_staff. Encapsula
   * fetch + monta payload + send + cleanup de tokens inválidos.
   */
  private async broadcastToStaff(payload: {
    title: string;
    body: string;
    data: Record<string, any>;
  }): Promise<void> {
    try {
      const { data: tokens, error } = await supabase
        .from('device_tokens')
        .select('expo_push_token')
        .eq('is_staff', true);

      if (error) {
        this.logger.error(`Erro ao buscar tokens de staff: ${error.message}`);
        return;
      }

      if (!tokens || tokens.length === 0) {
        this.logger.log('Nenhum token de staff registrado — push ignorado.');
        return;
      }

      const messages: ExpoPushMessage[] = tokens.map((t) => ({
        to: t.expo_push_token,
        title: payload.title,
        body: payload.body,
        sound: 'default',
        priority: 'high',
        channelId: 'orders',
        data: payload.data,
      }));

      await this.sendBatched(messages);
    } catch (err: any) {
      this.logger.error(`Falha ao notificar staff: ${err?.message ?? err}`);
    }
  }

  private async sendBatched(messages: ExpoPushMessage[]): Promise<void> {
    for (let i = 0; i < messages.length; i += MAX_BATCH_SIZE) {
      const batch = messages.slice(i, i + MAX_BATCH_SIZE);
      try {
        const response = await fetch(EXPO_PUSH_ENDPOINT, {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Accept-encoding': 'gzip, deflate',
            'Content-Type': 'application/json',
            ...(process.env.EXPO_ACCESS_TOKEN
              ? { Authorization: `Bearer ${process.env.EXPO_ACCESS_TOKEN}` }
              : {}),
          },
          body: JSON.stringify(batch),
        });

        const json: any = await response.json().catch(() => ({}));
        const tickets: ExpoPushTicket[] = json?.data ?? [];

        await this.handleInvalidTokens(batch, tickets);
      } catch (err: any) {
        this.logger.error(
          `Erro ao enviar batch de push: ${err?.message ?? err}`,
        );
      }
    }
  }

  /**
   * Deletes tokens that Expo flagged as DeviceNotRegistered — they will never
   * deliver again, so we keep the table tidy.
   */
  private async handleInvalidTokens(
    batch: ExpoPushMessage[],
    tickets: ExpoPushTicket[],
  ): Promise<void> {
    const invalid: string[] = [];
    tickets.forEach((ticket, idx) => {
      if (
        ticket?.status === 'error' &&
        ticket.details?.error === 'DeviceNotRegistered'
      ) {
        invalid.push(batch[idx].to);
      }
    });

    if (invalid.length > 0) {
      this.logger.warn(`Removendo ${invalid.length} token(s) inválido(s).`);
      await supabase.from('device_tokens').delete().in('expo_push_token', invalid);
    }
  }
}
