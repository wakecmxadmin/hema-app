import {
  Injectable,
  BadRequestException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { MercadoPagoConfig, Preference, Payment } from 'mercadopago';
import { OrdersService } from '../orders/orders.service';
import { supabase } from '../lib/supabase';

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
        await this.notifyN8n(order_id, {
          id: null,
          payment_method_id: 'cash',
          transaction_amount: total_price,
          date_approved: null,
        });
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

    const paymentMethods =
      params.payment_method === 'pix'
        ? {
            excluded_payment_types: [
              { id: 'credit_card' },
              { id: 'debit_card' },
              { id: 'prepaid_card' },
              { id: 'ticket' },
              { id: 'atm' },
            ],
          }
        : {
            excluded_payment_types: [
              { id: 'prepaid_card' },
              { id: 'bank_transfer' },
              { id: 'ticket' },
              { id: 'atm' },
            ],
          };

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
        payment_methods: paymentMethods,
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
      // Busca pedido completo com itens e endereço
      const { data: order, error: orderError } = await supabase
        .from('orders')
        .select(
          `
          *,
          order_items ( id, product_name, product_price, quantity, weight, subtotal ),
          addresses ( label, street, number, complement, neighborhood, city, state, zip_code )
        `,
        )
        .eq('id', orderId)
        .single();

      if (orderError || !order) {
        console.error(`[N8N] Pedido ${orderId} não encontrado para notificação`);
        return;
      }

      // Busca dados do usuário (nome e telefone)
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('name, phone')
        .eq('id', order.user_id)
        .single();

      console.log(`[N8N] Profile query for user ${order.user_id}:`, JSON.stringify(profile), profileError?.message ?? 'OK');

      const paymentLabels: Record<string, string> = {
        pix: 'PIX',
        credit_card: 'Cartão de Crédito',
        debit_card: 'Cartão de Débito',
        cash: 'Dinheiro',
      };

      const address = order.addresses;
      const items = order.order_items ?? [];

      const isCash = order.payment_method === 'cash';

      const response = await fetch(n8nWebhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event: isCash ? 'order_cash' : 'payment_approved',
          order_id: orderId,
          order_short_id: orderId.substring(0, 8).toUpperCase(),
          payment_id: mpPayment.id,
          payment_method: paymentLabels[order.payment_method] ?? order.payment_method,
          approved_at: mpPayment.date_approved,

          customer: {
            name: profile?.name ?? 'Cliente',
            phone: profile?.phone ?? null,
          },

          delivery: address
            ? {
                label: address.label,
                street: address.street,
                number: address.number,
                complement: address.complement,
                neighborhood: address.neighborhood,
                city: address.city,
                state: address.state,
                zip_code: address.zip_code,
              }
            : null,
          delivery_method: address ? 'delivery' : 'pickup',
          delivery_fee: order.delivery_fee,

          items: items.map((item: any) => ({
            name: item.product_name,
            price: item.product_price,
            quantity: item.quantity,
            weight: item.weight,
            subtotal: item.subtotal,
          })),
          items_count: items.length,

          subtotal: items.reduce((sum: number, i: any) => sum + Number(i.subtotal), 0),
          total: order.total_price,
        }),
      });

      console.log(`[N8N] Notificação enviada → status ${response.status}`);
    } catch (err) {
      console.error('[N8N] Falha ao notificar n8n:', err);
    }
  }
}
