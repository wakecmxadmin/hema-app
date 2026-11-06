import {
  Injectable,
  BadRequestException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import {
  MercadoPagoConfig,
  Preference,
  Payment,
  PaymentRefund,
} from 'mercadopago';
import { OrdersService } from '../orders/orders.service';
import { supabase } from '../lib/supabase';
import { ShippingService } from '../shipping/shipping.service';

export interface ProcessPaymentInput {
  payment_method: string;
  total_price: number;
  delivery_fee: number;
  order_id: string;
  discount_amount?: number;
  items: {
    product_id: string;
    product_name: string;
    quantity: number | null;
    weight: number | null;
    subtotal: number;
  }[];
}

export interface RefundResult {
  /** true quando o dinheiro já tinha voltado antes desta chamada. */
  alreadyRefunded: boolean;
  status: 'refunded' | 'partial';
  amount: number;
  message: string;
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

  /**
   * Cria a preference do Mercado Pago para um pedido existente que já está em
   * `awaiting_customer_payment`. Carrega itens + delivery_fee do banco em vez
   * de receber por parâmetro (no fluxo store-confirm-first os valores podem ter
   * sido editados pelo admin).
   */
  async createPaymentLinkForOrder(orderId: string): Promise<{
    init_point?: string;
    sandbox_init_point?: string;
  }> {
    const { data: order, error } = await supabase
      .from('orders')
      .select(
        `id, total_price, delivery_fee, payment_method, discount_amount,
         order_items ( product_id, product_name, quantity, weight, subtotal )`,
      )
      .eq('id', orderId)
      .single();

    if (error || !order) {
      throw new BadRequestException('Pedido não encontrado.');
    }

    const items = (order.order_items as any[]) ?? [];
    if (items.length === 0) {
      throw new BadRequestException('Pedido sem itens.');
    }

    const preference = await this.createMercadoPagoPreference({
      order_id: orderId,
      items: items.map((it) => ({
        product_id: it.product_id,
        product_name: it.product_name,
        quantity: it.quantity,
        weight: it.weight,
        subtotal: Number(it.subtotal),
      })),
      delivery_fee: Number(order.delivery_fee ?? 0),
      total_price: Number(order.total_price ?? 0),
      discount_amount: Number(order.discount_amount ?? 0),
      payment_method: order.payment_method,
    });

    return {
      init_point: preference?.init_point,
      sandbox_init_point: (preference as any)?.sandbox_init_point,
    };
  }

  async processPayment(
    input: ProcessPaymentInput,
  ): Promise<ProcessPaymentResult> {
    const {
      payment_method,
      total_price,
      delivery_fee,
      order_id,
      items,
      discount_amount,
    } = input;

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
          discount_amount,
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
    discount_amount?: number;
    payment_method: string;
  }) {
    try {
      const preferenceClient = new Preference(this.mpClient);

      const discountAmount = Number(params.discount_amount ?? 0);

      // O MP cobra a soma dos `items`, não `total_price` — sem isso, um
      // pedido com cupom cobraria o valor cheio. Como o MP rejeita
      // `unit_price <= 0` (não dá pra mandar o desconto como item negativo),
      // um pedido com desconto vira um único item consolidado com o valor
      // exato dos produtos já descontado, sem sobra de centavos.
      const mpItems: any[] =
        discountAmount > 0
          ? [
              {
                id: params.order_id,
                title: `Pedido #${params.order_id.slice(0, 8)} — ${params.items.length} ite${params.items.length === 1 ? 'm' : 'ns'}`,
                quantity: 1,
                unit_price: Number(
                  (
                    params.items.reduce((sum, it) => sum + it.subtotal, 0) -
                    discountAmount
                  ).toFixed(2),
                ),
                currency_id: 'BRL',
              },
            ]
          : params.items.map((item) => ({
              id: item.product_id,
              title: item.product_name,
              quantity: item.quantity || 1,
              unit_price: Number(
                (item.subtotal / (item.quantity || 1)).toFixed(2),
              ),
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

      console.log(
        '[MP_PREFERENCE] Enviando requisição para criar preference:',
        {
          order_id: params.order_id,
          payment_method: params.payment_method,
          total_price: params.total_price,
          items_count: mpItems.length,
        },
      );

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

    // Guarda o id do pagamento que de fato tem dinheiro. Só o aprovado: o MP
    // dispara um webhook por tentativa, e salvar o de uma recusada deixaria o
    // estorno apontando pra uma cobrança que nunca existiu.
    if (mpStatus === 'approved') {
      const { error: persistError } = await supabase
        .from('orders')
        .update({ mp_payment_id: String(paymentId) })
        .eq('id', orderId);

      if (persistError) {
        console.error(
          `[WEBHOOK] Falha ao salvar mp_payment_id do pedido ${orderId}:`,
          persistError,
        );
      }
    }

    // Estorno ou contestação originados fora do app (painel do MP, disputa
    // aberta pelo cliente no cartão). Antes isso caía no "status desconhecido"
    // e era descartado, deixando o pedido como pago aqui com o dinheiro já
    // devolvido lá. Registra sem mexer no status do pedido: um pedido já em
    // rota não pode ser cancelado automaticamente por um webhook.
    if (mpStatus === 'refunded' || mpStatus === 'charged_back') {
      await this.applyExternalRefund(orderId, mpStatus, mpPayment);
      return;
    }

    const { applied, status } = await this.ordersService.updateStatus(
      orderId,
      mpStatus,
    );

    // Só notifica e despacha quando a confirmação realmente foi aplicada —
    // senão um webhook ignorado (tentativa recusada, evento duplicado) geraria
    // WhatsApp de "pedido confirmado" e envio no LogManager para um pedido que
    // não está confirmado.
    if (applied && status === 'confirmed') {
      await this.notifyOrder(orderId, mpPayment);
      void this.shippingService.createForOrder(orderId);
    }
  }

  /**
   * Estorna no Mercado Pago o pagamento de um pedido.
   *
   * O MP aceita vários refunds parciais sobre o mesmo pagamento e essa rota
   * não tem idempotency key, então a proteção contra devolver o dinheiro duas
   * vezes é nossa e tem duas camadas: um lock otimista em `refund_status`
   * (que só sai de null/failed) antes da chamada, e uma conferência dos
   * refunds já registrados no próprio MP antes de criar mais um. A segunda
   * camada é o que cobre estornos feitos por fora, direto no painel.
   */
  async refundPayment(orderId: string, amount?: number): Promise<RefundResult> {
    const { data: order, error } = await supabase
      .from('orders')
      .select(
        `id, payment_status, payment_method, total_price,
         mp_payment_id, refund_status, refund_amount`,
      )
      .eq('id', orderId)
      .single();

    if (error || !order) {
      throw new BadRequestException('Pedido não encontrado.');
    }

    if (order.payment_method === 'cash') {
      throw new BadRequestException(
        'Pedido pago em dinheiro não tem estorno pelo Mercado Pago.',
      );
    }

    if (order.payment_status !== 'paid') {
      throw new BadRequestException(
        'Pedido não consta como pago — não há valor a estornar.',
      );
    }

    if (order.refund_status === 'refunded') {
      return {
        alreadyRefunded: true,
        status: 'refunded',
        amount: Number(order.refund_amount ?? order.total_price),
        message: 'Este pedido já havia sido estornado.',
      };
    }

    if (order.refund_status === 'charged_back') {
      throw new BadRequestException(
        'Pagamento está em contestação (chargeback) — o valor já foi retido pelo Mercado Pago.',
      );
    }

    if (order.refund_status === 'partial') {
      throw new BadRequestException(
        `Este pedido já teve um estorno parcial de R$ ${Number(order.refund_amount ?? 0).toFixed(2)}. ` +
          'Um segundo estorno precisa ser feito pelo painel do Mercado Pago, para não devolver duas vezes por engano.',
      );
    }

    if (order.refund_status === 'pending') {
      throw new BadRequestException(
        'Já existe um estorno em andamento para este pedido.',
      );
    }

    // Pedidos anteriores a esta feature não têm o payment id salvo: recupera
    // na API do MP pela nossa própria referência.
    const paymentId =
      order.mp_payment_id ?? (await this.findApprovedPaymentId(orderId));

    if (!paymentId) {
      throw new BadRequestException(
        'Nenhum pagamento aprovado foi encontrado no Mercado Pago para este pedido.',
      );
    }

    // Lock otimista: só a primeira chamada passa daqui. Um segundo clique no
    // admin encontra `refund_status` já em "pending" e para antes de chamar o MP.
    const { data: locked } = await supabase
      .from('orders')
      .update({
        refund_status: 'pending',
        refund_error: null,
        mp_payment_id: paymentId,
      })
      .eq('id', orderId)
      .or('refund_status.is.null,refund_status.eq.failed')
      .select('id')
      .maybeSingle();

    if (!locked) {
      throw new BadRequestException(
        'Já existe um estorno em andamento para este pedido.',
      );
    }

    try {
      const refundClient = new PaymentRefund(this.mpClient);

      // Conferência no MP antes de criar: se alguém já estornou (inclusive
      // pelo painel), sincroniza o estado local em vez de devolver de novo.
      const existing = await refundClient.list({ payment_id: paymentId });
      const alreadyRefunded = (existing ?? []).reduce(
        (sum: number, r: any) => sum + Number(r?.amount ?? 0),
        0,
      );

      if (alreadyRefunded > 0) {
        const total = Number(order.total_price ?? 0);
        const isTotal = alreadyRefunded >= total - 0.01;
        await this.saveRefundResult(orderId, {
          refund_status: isTotal ? 'refunded' : 'partial',
          refund_amount: alreadyRefunded,
          refunded_at: new Date().toISOString(),
          ...(isTotal ? { payment_status: 'refunded' } : {}),
        });

        console.log(
          `[REFUND] Pedido ${orderId} já tinha estorno no MP (R$ ${alreadyRefunded}). Estado local sincronizado.`,
        );

        return {
          alreadyRefunded: true,
          status: isTotal ? 'refunded' : 'partial',
          amount: alreadyRefunded,
          message: `Este pagamento já tinha um estorno de R$ ${alreadyRefunded.toFixed(2)} registrado no Mercado Pago. Nada foi cobrado de novo.`,
        };
      }

      console.log(
        `[REFUND] Solicitando estorno ao MP → order=${orderId} payment=${paymentId} amount=${amount ?? 'total'}`,
      );

      const response = amount
        ? await refundClient.create({
            payment_id: paymentId,
            body: { amount: Number(amount.toFixed(2)) },
          })
        : await refundClient.total({ payment_id: paymentId });

      const refundedAmount = Number(response?.amount ?? amount ?? order.total_price);
      const isTotal = !amount;

      await this.saveRefundResult(orderId, {
        refund_status: isTotal ? 'refunded' : 'partial',
        refund_amount: refundedAmount,
        refunded_at: new Date().toISOString(),
        // Só no estorno integral: num parcial o pagamento segue valendo pelo
        // restante, e marcá-lo como devolvido impediria tratar o saldo depois.
        ...(isTotal ? { payment_status: 'refunded' } : {}),
      });

      console.log(
        `[REFUND] Estorno concluído → order=${orderId} refund_id=${response?.id} status=${response?.status} amount=${refundedAmount}`,
      );

      return {
        alreadyRefunded: false,
        status: isTotal ? 'refunded' : 'partial',
        amount: refundedAmount,
        message: isTotal
          ? `Estorno integral de R$ ${refundedAmount.toFixed(2)} solicitado ao Mercado Pago.`
          : `Estorno parcial de R$ ${refundedAmount.toFixed(2)} solicitado ao Mercado Pago.`,
      };
    } catch (err: any) {
      const detail = this.describeMercadoPagoError(err);

      await this.saveRefundResult(orderId, {
        refund_status: 'failed',
        refund_error: detail,
      });

      console.error(`[REFUND] Falha ao estornar pedido ${orderId}:`, err);

      throw new BadRequestException(
        `Mercado Pago recusou o estorno: ${detail}`,
      );
    }
  }

  /**
   * Reflete no pedido um estorno/chargeback que não partiu do app.
   */
  private async applyExternalRefund(
    orderId: string,
    mpStatus: 'refunded' | 'charged_back',
    mpPayment: any,
  ): Promise<void> {
    // O MP também notifica os estornos que partiram daqui. Nesse caso o
    // registro já existe e o webhook é só confirmação — não é um alerta.
    const { data: current } = await supabase
      .from('orders')
      .select('refund_status')
      .eq('id', orderId)
      .maybeSingle();

    const wasOurs =
      current?.refund_status === 'refunded' ||
      current?.refund_status === 'partial';

    const refundedAmount = Number(
      mpPayment?.transaction_amount_refunded ?? mpPayment?.transaction_amount ?? 0,
    );
    const total = Number(mpPayment?.transaction_amount ?? 0);
    const isPartial =
      mpStatus === 'refunded' && refundedAmount > 0 && refundedAmount < total - 0.01;

    const refundStatus =
      mpStatus === 'charged_back'
        ? 'charged_back'
        : isPartial
          ? 'partial'
          : 'refunded';

    const { error } = await supabase
      .from('orders')
      .update({
        payment_status: mpStatus,
        refund_status: refundStatus,
        refund_amount: refundedAmount || null,
        refunded_at: new Date().toISOString(),
        mp_payment_id: String(mpPayment?.id ?? ''),
      })
      .eq('id', orderId);

    if (error) {
      console.error(
        `[WEBHOOK][ALERTA] Falha ao registrar ${mpStatus} do pedido ${orderId}:`,
        error,
      );
      return;
    }

    if (wasOurs && mpStatus === 'refunded') {
      console.log(
        `[WEBHOOK] MP confirmou o estorno do pedido ${orderId} (R$ ${refundedAmount}).`,
      );
      return;
    }

    console.warn(
      `[WEBHOOK][ALERTA] Pedido ${orderId} recebeu "${mpStatus}" (R$ ${refundedAmount}) fora do app. ` +
        `Status do pedido mantido — conferir no admin se precisa cancelar ou interromper a entrega.`,
    );
  }

  /**
   * Recupera o pagamento aprovado de um pedido na API do MP, para pedidos
   * fechados antes de `mp_payment_id` existir. Entre várias tentativas do
   * mesmo pedido só uma fica aprovada; se houver mais de uma, vence a mais
   * recente.
   */
  private async findApprovedPaymentId(orderId: string): Promise<string | null> {
    try {
      const paymentClient = new Payment(this.mpClient);
      const search = await paymentClient.search({
        options: { external_reference: orderId },
      });

      const approved = (search?.results ?? [])
        .filter((p: any) => p?.status === 'approved')
        .sort(
          (a: any, b: any) =>
            new Date(b?.date_approved ?? 0).getTime() -
            new Date(a?.date_approved ?? 0).getTime(),
        );

      if (approved.length === 0) {
        console.warn(
          `[REFUND] Nenhum pagamento aprovado no MP para o pedido ${orderId}.`,
        );
        return null;
      }

      const paymentId = String(approved[0].id);
      console.log(
        `[REFUND] payment_id ${paymentId} recuperado via busca para o pedido ${orderId}.`,
      );
      return paymentId;
    } catch (err) {
      console.error(
        `[REFUND] Falha ao buscar pagamento do pedido ${orderId} no MP:`,
        err,
      );
      return null;
    }
  }

  private async saveRefundResult(
    orderId: string,
    fields: Record<string, any>,
  ): Promise<void> {
    const { error } = await supabase
      .from('orders')
      .update(fields)
      .eq('id', orderId);

    if (error) {
      // O dinheiro pode já ter voltado — perder o registro disso é pior que a
      // própria falha, então vai pro log com destaque.
      console.error(
        `[REFUND][ALERTA] Estorno do pedido ${orderId} não pôde ser gravado no banco:`,
        error,
        fields,
      );
    }
  }

  /** Extrai do erro do SDK a mensagem que faz sentido mostrar pro admin. */
  private describeMercadoPagoError(err: any): string {
    const causes = err?.cause ?? err?.response?.cause;
    if (Array.isArray(causes) && causes.length > 0) {
      const described = causes
        .map((c: any) => c?.description ?? c?.message ?? c?.code)
        .filter(Boolean)
        .join('; ');
      if (described) return described;
    }

    return (
      err?.response?.message ??
      err?.message ??
      'erro desconhecido ao chamar a API de estorno'
    );
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

  async sendNewOrderNotification(customerName: string): Promise<void> {
    const templateName = process.env.WHATSAPP_TEMPLATE_NAME_NEW_ORDER;
    if (!templateName) {
      console.warn(
        '[WHATSAPP] WHATSAPP_TEMPLATE_NAME_NEW_ORDER não configurado. Envio ignorado.',
      );
      return;
    }
    await this.sendWhatsappMessage(customerName, templateName);
  }

  private async sendWhatsappMessage(
    customerName: string,
    templateOverride?: string,
  ): Promise<boolean> {
    const token = process.env.WHATSAPP_ACCESS_TOKEN;
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    const recipient = process.env.WHATSAPP_RECIPIENT;
    const templateName = templateOverride ?? process.env.WHATSAPP_TEMPLATE_NAME;
    const templateLanguage = process.env.WHATSAPP_TEMPLATE_LANGUAGE ?? 'pt_BR';
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
