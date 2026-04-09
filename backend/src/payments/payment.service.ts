import {
  Injectable,
  BadRequestException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { MercadoPagoConfig, Preference, Payment } from 'mercadopago';
import { OrdersService } from '../orders/orders.service';

export interface ProcessPaymentInput {
  payment_method: string;
  total_price: number;
  delivery_fee: number;
  order_id: string;
  items: {
    product_id: string;
    product_name: string;
    quantity: number | null;
    weight: number | null;
    subtotal: number;
  }[];
}

export interface ProcessPaymentResult {
  orderStatus: string;
  paymentStatus: string;
  init_point?: string;
  sandbox_init_point?: string;
}

@Injectable()
export class PaymentsService {
  private mpClient: MercadoPagoConfig;

  constructor(
    @Inject(forwardRef(() => OrdersService))
    private readonly ordersService: OrdersService,
  ) {
    this.mpClient = new MercadoPagoConfig({
      accessToken: process.env.MP_ACCESS_TOKEN!,
    });
  }

  async processPayment(
    input: ProcessPaymentInput,
  ): Promise<ProcessPaymentResult> {
    const { payment_method, total_price, delivery_fee, order_id, items } =
      input;

    switch (payment_method) {
      case 'cash':
        console.log(`[PAYMENT] Order ${order_id} → Dinheiro → fluxo offline`);
        return {
          orderStatus: 'pending',
          paymentStatus: 'waiting_cash',
        };

      case 'pix':
      case 'credit_card': {
        const preference = await this.createMercadoPagoPreference({
          order_id,
          items,
          delivery_fee,
          total_price,
          payment_method,
        });

        console.log(preference)

        console.log(
          `[PAYMENT] Order ${order_id} → ${payment_method} → Preference ${preference.id} criada`,
        );

        return {
          orderStatus: 'waiting_payment',
          paymentStatus: 'pending',
          init_point: preference.init_point!,
          sandbox_init_point: (preference as any).sandbox_init_point,
        };
      }

      default:
        throw new BadRequestException(
          `Método de pagamento inválido: ${payment_method}`,
        );
    }
  }

  private async createMercadoPagoPreference(params: {
    order_id: string;
    items: ProcessPaymentInput['items'];
    delivery_fee: number;
    total_price: number;
    payment_method: string;
  }) {
    const preferenceClient = new Preference(this.mpClient);

    const mpItems: any[] = params.items.map((item) => ({
      id: item.product_id,
      title: item.product_name,
      quantity: item.quantity || 1,
      unit_price: Number((item.subtotal / (item.quantity || 1)).toFixed(2)),
      currency_id: 'BRL',
    }));

    if (params.delivery_fee > 0) {
      mpItems.push({
        id: 'delivery_fee',
        title: 'Taxa de Entrega',
        quantity: 1,
        unit_price: params.delivery_fee,
        currency_id: 'BRL',
      });
    }

    const response = await preferenceClient.create({
      body: {
        items: mpItems,
        external_reference: params.order_id,
        notification_url:
          'https://api.apphema.codificaai.pro/webhook/mercadopago',
        back_urls: {
          success: 'hemaapp://payment/success',
          failure: 'hemaapp://payment/failure',
          pending: 'hemaapp://payment/pending',
        },
        auto_return: 'approved',
        payment_methods: {
          excluded_payment_types: [{ id: 'ticket' }, { id: 'atm' }],
          excluded_payment_methods: [{ id: 'debvisa' }, { id: 'debmaster' }],
        },
        statement_descriptor: 'HEMA CEREAIS',
      },
    });

    return response;
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

    // Notificar n8n após aprovação do pagamento
    if (mpStatus === 'approved') {
      await this.notifyN8n(orderId, mpPayment);
    }
  }

  private async fetchMercadoPagoPayment(paymentId: string): Promise<any> {
    try {
      const paymentClient = new Payment(this.mpClient);
      const payment = await paymentClient.get({ id: paymentId });
      return payment;
    } catch (err) {
      console.error(
        `[WEBHOOK] Falha ao buscar pagamento ${paymentId} via SDK:`,
        err,
      );
      return null;
    }
  }

  private async notifyN8n(orderId: string, mpPayment: any): Promise<void> {
    const n8nWebhookUrl = process.env.N8N_WEBHOOK_URL;
    if (!n8nWebhookUrl) {
      console.warn(
        '[N8N] N8N_WEBHOOK_URL não configurado. Notificação ignorada.',
      );
      return;
    }

    try {
      const response = await fetch(n8nWebhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event: 'payment_approved',
          order_id: orderId,
          payment_id: mpPayment.id,
          payment_method: mpPayment.payment_method_id,
          total_paid: mpPayment.transaction_amount,
          payer_email: mpPayment.payer?.email,
          approved_at: mpPayment.date_approved,
        }),
      });

      console.log(`[N8N] Notificação enviada → status ${response.status}`);
    } catch (err) {
      console.error('[N8N] Falha ao notificar n8n:', err);
    }
  }
}
