import {
  Injectable,
  BadRequestException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { MercadoPagoConfig, Preference, Payment } from 'mercadopago';
import { OrdersService } from '../orders/orders.service';
import { supabase } from '../lib/supabase';
import { ShippingService } from '../shipping/shipping.service';

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
    private readonly shippingService: ShippingService,
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
        await this.notifyOrder(order_id, {
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
        console.log(`[PAYMENT] Criando preferência para ${payment_method}...`);

        const preference = await this.createMercadoPagoPreference({
          order_id,
          items,
          delivery_fee,
          total_price,
          payment_method,
        });

        if (!preference?.id) {
          console.error('[PAYMENT] Preference sem ID válido:', preference);
          throw new BadRequestException(
            'Falha ao criar preferência de pagamento no Mercado Pago',
          );
        }

        const initPoint = preference.init_point;
        const sandboxInitPoint = (preference as any).sandbox_init_point;

        if (!initPoint && !sandboxInitPoint) {
          console.error(
            '[PAYMENT] Nenhum init_point retornado pela API do MP:',
            preference,
          );
          throw new BadRequestException(
            'Mercado Pago não retornou URL de pagamento',
          );
        }

        console.log('[PAYMENT] Preferência criada com sucesso:', {
          id: preference.id,
          init_point: initPoint,
          sandbox_init_point: sandboxInitPoint,
        });

        return {
          orderStatus: 'waiting_payment',
          paymentStatus: 'pending',
          init_point: initPoint,
          sandbox_init_point: sandboxInitPoint,
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
    try {
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

      console.log('[MP_PREFERENCE] Enviando requisição para criar preference:', {
        order_id: params.order_id,
        payment_method: params.payment_method,
        total_price: params.total_price,
        items_count: mpItems.length,
      });

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

      console.log('[MP_PREFERENCE] Resposta completa da API:', {
        id: response?.id,
        init_point: response?.init_point,
        initPoint: (response as any)?.initPoint,
        sandbox_init_point: (response as any)?.sandbox_init_point,
        sandboxInitPoint: (response as any)?.sandboxInitPoint,
        allKeys: Object.keys(response || {}),
      });

      return response;
    } catch (error) {
      console.error('[MP_PREFERENCE] Erro ao criar preferência:', error);
      throw new BadRequestException(
        `Erro ao criar preferência no Mercado Pago: ${error instanceof Error ? error.message : 'Unknown error'}`,
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

    if (mpStatus === 'approved') {
      await this.notifyOrder(orderId, mpPayment);
      void this.shippingService.createForOrder(orderId);
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

  private async notifyOrder(orderId: string, mpPayment: any): Promise<void> {
    const payload = await this.buildOrderPayload(orderId, mpPayment);
    if (!payload) return;

    const customerName = payload.customer?.name ?? 'Cliente';
    const sent = await this.sendWhatsappMessage(customerName);
    if (sent) return;

    console.warn('[NOTIFY] WhatsApp falhou. Tentando fallback n8n...');
    await this.sendN8nWebhook(payload);
  }

  private async buildOrderPayload(
    orderId: string,
    mpPayment: any,
  ): Promise<any | null> {
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
      console.error(
        `[NOTIFY] Pedido ${orderId} não encontrado para notificação`,
      );
      return null;
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('name, phone')
      .eq('id', order.user_id)
      .single();

    console.log(
      `[NOTIFY] Profile query for user ${order.user_id}:`,
      JSON.stringify(profile),
      profileError?.message ?? 'OK',
    );

    const paymentLabels: Record<string, string> = {
      pix: 'PIX',
      credit_card: 'Cartão de Crédito',
      debit_card: 'Cartão de Débito',
      cash: 'Dinheiro',
    };

    const address = order.addresses;
    const items = order.order_items ?? [];
    const isCash = order.payment_method === 'cash';

    return {
      event: isCash ? 'order_cash' : 'payment_approved',
      order_id: orderId,
      order_short_id: orderId.substring(0, 8).toUpperCase(),
      payment_id: mpPayment.id,
      payment_method:
        paymentLabels[order.payment_method] ?? order.payment_method,
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

      subtotal: items.reduce(
        (sum: number, i: any) => sum + Number(i.subtotal),
        0,
      ),
      total: order.total_price,
    };
  }

  private async sendWhatsappMessage(customerName: string): Promise<boolean> {
    const token = process.env.WHATSAPP_ACCESS_TOKEN;
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    const recipient = process.env.WHATSAPP_RECIPIENT;
    const templateName = process.env.WHATSAPP_TEMPLATE_NAME;
    const templateLanguage =
      process.env.WHATSAPP_TEMPLATE_LANGUAGE ?? 'pt_BR';
    const graphVersion = process.env.WHATSAPP_GRAPH_VERSION ?? 'v22.0';

    if (!token || !phoneNumberId || !recipient || !templateName) {
      console.warn(
        '[WHATSAPP] Credenciais ausentes (TOKEN/PHONE_NUMBER_ID/RECIPIENT/TEMPLATE_NAME). Envio ignorado.',
      );
      return false;
    }

    try {
      const url = `https://graph.facebook.com/${graphVersion}/${phoneNumberId}/messages`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: recipient,
          type: 'template',
          template: {
            name: templateName,
            language: { code: templateLanguage },
            components: [
              {
                type: 'body',
                parameters: [{ type: 'text', text: customerName }],
              },
            ],
          },
        }),
      });

      if (!response.ok) {
        const errBody = await response.text();
        console.error(
          `[WHATSAPP] Falha no envio → status ${response.status}: ${errBody}`,
        );
        return false;
      }

      console.log(`[WHATSAPP] Template enviado → status ${response.status}`);
      return true;
    } catch (err) {
      console.error('[WHATSAPP] Erro ao enviar mensagem:', err);
      return false;
    }
  }

  private async sendN8nWebhook(payload: any): Promise<void> {
    const n8nWebhookUrl = process.env.N8N_WEBHOOK_URL;
    if (!n8nWebhookUrl) {
      console.warn('[N8N] N8N_WEBHOOK_URL não configurado. Fallback ignorado.');
      return;
    }

    try {
      const response = await fetch(n8nWebhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      console.log(`[N8N] Notificação enviada → status ${response.status}`);
    } catch (err) {
      console.error('[N8N] Falha ao notificar n8n:', err);
    }
  }
}
