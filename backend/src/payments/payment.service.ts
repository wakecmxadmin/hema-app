import {
  Injectable,
  BadRequestException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { OrdersService } from '../orders/orders.service';

export interface ProcessPaymentInput {
  payment_method: string;
  total_price: number;
  delivery_fee: number;
  order_id: string;
}

export interface ProcessPaymentResult {
  orderStatus: string;
  paymentStatus: string;
}

@Injectable()
export class PaymentsService {
  constructor(
    @Inject(forwardRef(() => OrdersService))
    private readonly ordersService: OrdersService,
  ) {}

  async processPayment(
    input: ProcessPaymentInput,
  ): Promise<ProcessPaymentResult> {
    const { payment_method, total_price, order_id } = input;

    switch (payment_method) {
      case 'cash':
        console.log(`[PAYMENT] Order ${order_id} → Dinheiro → fluxo offline`);
        return {
          orderStatus: 'pending',
          paymentStatus: 'waiting_cash',
        };

      case 'pix':
        console.log(
          `[PAYMENT] Order ${order_id} → PIX no valor de R$ ${total_price} → gerar QR Code no MP`,
        );
        return {
          orderStatus: 'waiting_payment',
          paymentStatus: 'pending',
        };

      case 'credit_card':
        console.log(
          `[PAYMENT] Order ${order_id} → Cartão → processar Token via MP`,
        );
        return {
          orderStatus: 'waiting_payment',
          paymentStatus: 'pending',
        };

      default:
        throw new BadRequestException(
          `Método de pagamento inválido: ${payment_method}`,
        );
    }
  }

  async handleMercadoPagoWebhook(payload: any): Promise<void> {
    console.log('[WEBHOOK] Payload recebido:', JSON.stringify(payload));

    const { type, data } = payload;

    if (type !== 'payment') {
      console.log(`[WEBHOOK] Evento ignorado: type="${type}"`);
      return;
    }

    const paymentId = data?.id;
    if (!paymentId) {
      console.warn('[WEBHOOK] payment_id ausente no payload');
      return;
    }

    console.log(
      `[WEBHOOK] Buscando pagamento ${paymentId} na API do Mercado Pago`,
    );

    const mpPayment = await this.fetchMercadoPagoPayment(paymentId);
    if (!mpPayment) return;

    const { status: mpStatus, external_reference: orderId } = mpPayment;

    if (!orderId) {
      console.warn(
        `[WEBHOOK] external_reference ausente para payment ${paymentId}`,
      );
      return;
    }

    console.log(
      `[WEBHOOK] payment_id=${paymentId} | order_id=${orderId} | mp_status=${mpStatus}`,
    );

    await this.ordersService.updateStatus(orderId, mpStatus);
  }

  private async fetchMercadoPagoPayment(paymentId: string): Promise<any> {
    const accessToken = process.env.MP_ACCESS_TOKEN;
    if (!accessToken) {
      console.error('[WEBHOOK] MP_ACCESS_TOKEN não configurado');
      return null;
    }

    try {
      const response = await fetch(
        `https://api.mercadopago.com/v1/payments/${paymentId}`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        },
      );

      if (!response.ok) {
        console.error(
          `[WEBHOOK] Erro ao buscar pagamento ${paymentId}: HTTP ${response.status}`,
        );
        return null;
      }

      return response.json();
    } catch (err) {
      console.error(
        `[WEBHOOK] Falha na requisição para o Mercado Pago:`,
        err,
      );
      return null;
    }
  }
}
