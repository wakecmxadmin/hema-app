import {
  Injectable,
  HttpException,
  HttpStatus,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { CreateOrderDto } from './dto/create-order.dto';
import { supabase } from '../lib/supabase';
import { calculateDeliveryFee } from '../utils/delivery.util';
import { PaymentsService } from '../payments/payment.service';
import { CartService } from '../cart/cart.service';
import { ExpoPushService } from '../notifications/expo-push.service';
import { ShippingService } from '../shipping/shipping.service';

@Injectable()
export class OrdersService {
  constructor(
    private readonly cartService: CartService,
    @Inject(forwardRef(() => PaymentsService))
    private readonly paymentsService: PaymentsService,
    private readonly expoPushService: ExpoPushService,
    private readonly shippingService: ShippingService,
  ) {}

  async createOrder(userId: string, dto: CreateOrderDto) {
    try {
      // 1. Buscar o carrinho do usuário
      const cartResponse = await this.cartService.getCart(userId);
      if (!cartResponse.data.cart || cartResponse.data.items.length === 0) {
        throw new HttpException(
          { success: false, message: 'Seu carrinho está vazio.' },
          HttpStatus.BAD_REQUEST,
        );
      }

      const { cart, items: cartItems } = cartResponse.data;
      const isDelivery = !!dto.address_id;

      let deliveryFee = 0;
      if (isDelivery) {
        const { data: address, error: addressError } = await supabase
          .from('addresses')
          .select('city')
          .eq('id', dto.address_id)
          .single();

        if (addressError || !address) {
          throw new HttpException(
            { success: false, message: 'Endereço de entrega não encontrado.' },
            HttpStatus.BAD_REQUEST,
          );
        }

        deliveryFee = calculateDeliveryFee(address.city);

        if (deliveryFee === -1) {
          throw new HttpException(
            {
              success: false,
              message:
                'Não realizamos entregas para esta região. Selecione a opção "Retirar na loja".',
            },
            HttpStatus.BAD_REQUEST,
          );
        }
      }

      let calculatedTotal = 0;

      const orderItemsToInsert = cartItems.map((item: any) => {
        const product = item.product;
        const isUnit = product.type === 'unit';
        const price = isUnit ? product.price : product.price_per_kg;

        const subtotal = isUnit
          ? price * (item.quantity || 1)
          : price * ((item.weight || 0) / 1000);

        calculatedTotal += subtotal;

        return {
          product_id: product.id,
          product_name: product.name,
          product_price: price,
          quantity: isUnit ? item.quantity : null,
          weight: !isUnit ? item.weight : null,
          subtotal: Number(subtotal.toFixed(2)),
        };
      });

      const finalTotalPrice = Number(
        (calculatedTotal + deliveryFee).toFixed(2),
      );

      // Insere o pedido principal. Nasce em `awaiting_store_confirmation`:
      // a loja precisa conferir o estoque físico antes de o cliente pagar.
      const { data: newOrder, error: orderError } = await supabase
        .from('orders')
        .insert({
          user_id: userId,
          address_id: dto.address_id || null,
          status: 'awaiting_store_confirmation',
          payment_status: 'pending',
          total_price: finalTotalPrice,
          original_total_price: finalTotalPrice,
          delivery_fee: deliveryFee,
          payment_method: dto.payment_method,
        })
        .select()
        .single();

      if (orderError || !newOrder) {
        throw new Error('Falha ao inserir pedido principal.');
      }

      // Prepara e insere os itens
      const itemsWithOrderId = orderItemsToInsert.map((item) => ({
        ...item,
        order_id: newOrder.id,
      }));

      const { error: itemsError } = await supabase
        .from('order_items')
        .insert(itemsWithOrderId);

      // Rollback se falhar
      if (itemsError) {
        await supabase.from('orders').delete().eq('id', newOrder.id);
        throw new Error('Falha ao inserir itens do pedido.');
      }

      // Dedução atômica de estoque via RPC
      const stockItems = cartItems.map((item: any) => {
        const product = item.product;
        const isUnit = product.type === 'unit';
        // Para unit: quantidade inteira. Para weight: peso em KG
        const qty = isUnit ? item.quantity : (item.weight || 0) / 1000;
        return { product_id: product.id, quantity: qty };
      });

      const { data: stockResult, error: stockError } = await supabase.rpc(
        'deduct_stock',
        { items: stockItems },
      );

      if (stockError || (stockResult && !stockResult.success)) {
        // Rollback: remove order items e order
        await supabase.from('order_items').delete().eq('order_id', newOrder.id);
        await supabase.from('orders').delete().eq('id', newOrder.id);

        const msgParts = stockError?.message?.split(':');
        const failedProduct =
          (msgParts?.[0] === 'INSUFFICIENT_STOCK'
            ? msgParts.slice(1).join(':').trim()
            : null) ||
          stockResult?.failed_product ||
          'um produto';
        throw new HttpException(
          {
            success: false,
            message: `Estoque insuficiente para "${failedProduct}". Revise seu carrinho.`,
            error: 'INSUFFICIENT_STOCK',
            failed_product: failedProduct,
          },
          HttpStatus.CONFLICT,
        );
      }

      // Push fire-and-forget pra equipe: novo pedido aguardando confirmação.
      void this.notifyStaffOfNewOrder(
        newOrder.id,
        userId,
        finalTotalPrice,
        dto.payment_method,
      );

      // Limpa o carrinho — o pedido já foi criado com sucesso, mesmo que a
      // loja venha a rejeitar/editar depois.
      await supabase.from('cart_items').delete().eq('cart_id', cart.id);
      await supabase.from('carts').update({ total_price: 0 }).eq('id', cart.id);

      return {
        success: true,
        message: 'Pedido criado. Aguardando confirmação da loja.',
        data: {
          order_id: newOrder.id,
          status: 'awaiting_store_confirmation',
          total_price: finalTotalPrice,
        },
      };
    } catch (error: any) {
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        {
          success: false,
          message: 'Não foi possível finalizar o pedido.',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async findAllByUser(userId: string) {
    try {
      const { data, error } = await supabase
        .from('orders')
        .select(
          `
          *,
          order_items ( id, product_name, quantity, weight, subtotal )
        `,
        )
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      return {
        success: true,
        message: 'Histórico carregado',
        data,
      };
    } catch (error: any) {
      throw new HttpException(
        {
          success: false,
          message: 'Erro ao buscar histórico',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async findOne(userId: string, orderId: string) {
    try {
      const { data: order, error } = await supabase
        .from('orders')
        .select(
          `
          *,
          order_items ( id, product_id, product_name, product_price, quantity, weight, subtotal, products ( image_url ) ),
          addresses ( label, street, number, complement, neighborhood, city, state, zip_code )
        `,
        )
        .eq('id', orderId)
        .eq('user_id', userId)
        .single();

      if (error || !order) {
        throw new HttpException(
          { success: false, message: 'Pedido não encontrado.' },
          HttpStatus.NOT_FOUND,
        );
      }

      return {
        success: true,
        message: 'Detalhes do pedido',
        data: order,
      };
    } catch (error: any) {
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        {
          success: false,
          message: 'Erro ao buscar detalhes do pedido',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async cancelOrder(userId: string, orderId: string) {
    try {
      const { data: order, error: fetchError } = await supabase
        .from('orders')
        .select('status')
        .eq('id', orderId)
        .eq('user_id', userId)
        .single();

      if (fetchError || !order) {
        throw new HttpException(
          { success: false, message: 'Pedido não encontrado.' },
          HttpStatus.NOT_FOUND,
        );
      }

      const cancelableStatuses = [
        'pending',
        'awaiting_store_confirmation',
        'awaiting_customer_payment',
      ];

      if (!cancelableStatuses.includes(order.status)) {
        throw new HttpException(
          {
            success: false,
            message:
              'Este pedido já está em processamento e não pode ser cancelado.',
          },
          HttpStatus.CONFLICT,
        );
      }

      // Buscar itens do pedido para devolver estoque
      const { data: orderItems } = await supabase
        .from('order_items')
        .select('product_id, quantity, weight')
        .eq('order_id', orderId);

      const { error: updateError } = await supabase
        .from('orders')
        .update({ status: 'cancelled' })
        .eq('id', orderId)
        .eq('user_id', userId);

      if (updateError) throw updateError;

      // Libera as reservas dos itens do pedido cancelado
      if (orderItems && orderItems.length > 0) {
        const releaseItems = orderItems.map((item: any) => ({
          product_id: item.product_id,
          quantity: item.quantity ? item.quantity : (item.weight || 0) / 1000,
        }));

        const { error: releaseError } = await supabase.rpc('release_stock', {
          items: releaseItems,
        });

        if (releaseError) {
          console.error(
            `[ORDER] Erro ao liberar reserva do pedido ${orderId}:`,
            releaseError,
          );
        }
      }

      // Push fire-and-forget pra staff (não bloqueia a resposta ao cliente).
      void this.notifyStaffOfCancelledOrder(orderId, userId);

      return {
        success: true,
        message: 'Pedido cancelado com sucesso.',
        data: { new_status: 'cancelled' },
      };
    } catch (error: any) {
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        {
          success: false,
          message: 'Erro ao cancelar o pedido',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Aplica no pedido o status vindo de um webhook do Mercado Pago.
   *
   * O MP dispara um webhook por *tentativa* de pagamento — o cliente pode errar
   * o cartão 3x e pagar na 4ª. Por isso `rejected` NUNCA cancela o pedido: só
   * registra `payment_status`, deixando o pedido pagável até a janela expirar
   * (quem cancela é o PaymentTimeoutCron). E `approved` sempre vence, inclusive
   * sobre um pedido já cancelado — se o dinheiro entrou, o pedido existe.
   *
   * Retorna `applied` para o webhook só notificar/despachar quando a transição
   * realmente aconteceu.
   */
  async updateStatus(
    orderId: string,
    mpStatus: string,
  ): Promise<{ applied: boolean; status?: string }> {
    const { data: order, error } = await supabase
      .from('orders')
      .select('id, status, payment_status, user_id')
      .eq('id', orderId)
      .single();

    if (error || !order) {
      console.error(
        `[ORDER] Pedido ${orderId} não encontrado para atualização`,
      );
      return { applied: false };
    }

    // Pedido já pago ou em andamento: webhook posterior é ruído.
    const settledStatuses = [
      'confirmed',
      'preparing',
      'awaiting_dispatch',
      'shipped',
      'in_delivery',
      'delivered',
      'completed',
    ];
    if (settledStatuses.includes(order.status)) {
      console.log(
        `[ORDER] Pedido ${orderId} já está em "${order.status}". Ignorando webhook mp_status="${mpStatus}".`,
      );
      return { applied: false };
    }

    // Tentativa recusada não cancela nada — o cliente segue podendo pagar com
    // outro cartão, PIX ou saldo em conta enquanto a janela estiver aberta.
    if (mpStatus === 'rejected') {
      if (order.status === 'cancelled') return { applied: false };

      const { error: rejectError } = await supabase
        .from('orders')
        .update({ payment_status: 'rejected' })
        .eq('id', orderId);

      if (rejectError) {
        console.error(
          `[ORDER] Erro ao marcar tentativa recusada no pedido ${orderId}:`,
          rejectError,
        );
        return { applied: false };
      }

      console.log(
        `[ORDER] Pedido ${orderId} teve tentativa recusada → payment_status="rejected" | status mantido em "${order.status}".`,
      );
      return { applied: false };
    }

    const statusMap: Record<
      string,
      { status: string; payment_status: string }
    > = {
      approved: { status: 'confirmed', payment_status: 'paid' },
      pending: { status: 'waiting_payment', payment_status: 'pending' },
      in_process: { status: 'waiting_payment', payment_status: 'pending' },
      cancelled: { status: 'cancelled', payment_status: 'cancelled' },
    };

    const mapped = statusMap[mpStatus];
    if (!mapped) {
      console.warn(
        `[ORDER] Status do MP desconhecido: "${mpStatus}". Ignorando.`,
      );
      return { applied: false };
    }

    // Pedido cancelado (janela expirada, cancelamento manual): só um pagamento
    // aprovado o ressuscita.
    if (order.status === 'cancelled' && mpStatus !== 'approved') {
      console.log(
        `[ORDER] Pedido ${orderId} já está cancelado. Ignorando mp_status="${mpStatus}".`,
      );
      return { applied: false };
    }

    const wasCancelled = order.status === 'cancelled';

    const { error: updateError } = await supabase
      .from('orders')
      .update({ status: mapped.status, payment_status: mapped.payment_status })
      .eq('id', orderId);

    if (updateError) {
      console.error(
        `[ORDER] Erro ao atualizar pedido ${orderId}:`,
        updateError,
      );
      return { applied: false };
    }

    console.log(
      `[ORDER] Pedido ${orderId} atualizado → status="${mapped.status}" | payment_status="${mapped.payment_status}"`,
    );

    // Cancelamento vindo do MP libera a reserva, igual ao cron e ao
    // cancelamento manual.
    if (mapped.status === 'cancelled') {
      await this.releaseOrderStock(orderId);
    }

    if (mpStatus === 'approved') {
      // Pedido tinha sido cancelado e o pagamento entrou depois: a reserva já
      // foi devolvida ao estoque, então precisa ser refeita. Se não couber,
      // o pedido continua confirmado (o cliente pagou) e a loja é avisada.
      if (wasCancelled) {
        console.warn(
          `[ORDER][ALERTA] Pedido ${orderId} estava cancelado e recebeu pagamento aprovado. Reativado — conferir estoque.`,
        );
        await this.reserveOrderStock(orderId);
      }

      // Limpar carrinho após pagamento aprovado
      const cartResponse = await this.cartService.getCart(order.user_id);
      const cart = cartResponse?.data?.cart;
      if (cart) {
        await supabase.from('cart_items').delete().eq('cart_id', cart.id);
        await supabase
          .from('carts')
          .update({ total_price: 0 })
          .eq('id', cart.id);
        console.log(
          `[ORDER] Carrinho do usuário ${order.user_id} limpo após aprovação.`,
        );
      }
    }

    return { applied: true, status: mapped.status };
  }

  /** Itens do pedido no formato esperado pelas RPCs de estoque. */
  private async getStockItems(
    orderId: string,
  ): Promise<{ product_id: string; quantity: number }[]> {
    const { data: items } = await supabase
      .from('order_items')
      .select('product_id, quantity, weight')
      .eq('order_id', orderId);

    return (items ?? []).map((item: any) => ({
      product_id: item.product_id,
      quantity: item.quantity ? item.quantity : (item.weight || 0) / 1000,
    }));
  }

  private async releaseOrderStock(orderId: string): Promise<void> {
    const items = await this.getStockItems(orderId);
    if (items.length === 0) return;

    const { error } = await supabase.rpc('release_stock', { items });
    if (error) {
      console.error(
        `[ORDER] Erro ao liberar reserva do pedido ${orderId}:`,
        error,
      );
    }
  }

  private async reserveOrderStock(orderId: string): Promise<void> {
    const items = await this.getStockItems(orderId);
    if (items.length === 0) return;

    const { error } = await supabase.rpc('deduct_stock', { items });
    if (error) {
      console.error(
        `[ORDER][ALERTA] Não foi possível re-reservar o estoque do pedido ${orderId}:`,
        error,
      );
    }
  }

  /**
   * Cliente clica em "Pagar agora" após a loja confirmar. Só funciona em
   * `awaiting_customer_payment`. Para PIX/cartão cria a preference no MP e
   * retorna o init_point. Para dinheiro vai direto pra `confirmed` e dispara
   * o envio (não há pagamento online, paga na entrega).
   */
  async proceedToPayment(userId: string, orderId: string) {
    const { data: order, error } = await supabase
      .from('orders')
      .select('id, user_id, status, payment_method')
      .eq('id', orderId)
      .eq('user_id', userId)
      .single();

    if (error || !order) {
      throw new HttpException(
        { success: false, message: 'Pedido não encontrado.' },
        HttpStatus.NOT_FOUND,
      );
    }

    if (order.status !== 'awaiting_customer_payment') {
      throw new HttpException(
        {
          success: false,
          message: `Pedido não está aguardando pagamento (status: ${order.status}).`,
        },
        HttpStatus.CONFLICT,
      );
    }

    if (order.payment_method === 'cash') {
      const { error: updateError } = await supabase
        .from('orders')
        .update({ status: 'confirmed' })
        .eq('id', orderId)
        .eq('status', 'awaiting_customer_payment');

      if (updateError) {
        throw new HttpException(
          { success: false, message: 'Falha ao confirmar pedido em dinheiro.' },
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }

      void this.shippingService.createForOrder(orderId);

      return {
        success: true,
        message: 'Pedido confirmado. Pague na entrega.',
        data: { status: 'confirmed' },
      };
    }

    // PIX ou cartão — cria a preference do MP agora.
    const { init_point, sandbox_init_point } =
      await this.paymentsService.createPaymentLinkForOrder(orderId);

    return {
      success: true,
      message: 'Link de pagamento gerado.',
      data: { init_point, sandbox_init_point },
    };
  }

  /**
   * Re-adiciona os itens de um pedido antigo ao carrinho do usuário. Cada item
   * passa pelo cartService.addItem, então toda validação (produto ativo, estoque,
   * tipo unit/weight) já é reaproveitada. Itens que falharem ficam em `skipped`
   * com o motivo — não fazemos partial fulfillment.
   */
  async reorder(userId: string, orderId: string) {
    try {
      const { data: order, error } = await supabase
        .from('orders')
        .select(
          `id,
           order_items ( product_id, product_name, quantity, weight )`,
        )
        .eq('id', orderId)
        .eq('user_id', userId)
        .single();

      if (error || !order) {
        throw new HttpException(
          { success: false, message: 'Pedido não encontrado.' },
          HttpStatus.NOT_FOUND,
        );
      }

      const items: any[] = order.order_items ?? [];
      if (items.length === 0) {
        throw new HttpException(
          { success: false, message: 'Este pedido não tem itens.' },
          HttpStatus.BAD_REQUEST,
        );
      }

      const added: { product_name: string }[] = [];
      const skipped: { product_name: string; reason: string }[] = [];

      for (const item of items) {
        const dto: any = { product_id: item.product_id };
        if (item.quantity != null) dto.quantity = item.quantity;
        if (item.weight != null) dto.weight = item.weight;

        try {
          await this.cartService.addItem(userId, dto);
          added.push({ product_name: item.product_name });
        } catch (e: any) {
          const body =
            e instanceof HttpException ? (e.getResponse() as any) : null;
          skipped.push({
            product_name: item.product_name,
            reason: body?.message ?? 'Indisponível no momento',
          });
        }
      }

      const message =
        added.length === 0
          ? 'Nenhum item está disponível para adicionar ao carrinho.'
          : skipped.length === 0
            ? 'Itens adicionados ao carrinho!'
            : `${added.length} ${added.length === 1 ? 'item adicionado' : 'itens adicionados'}, ${skipped.length} indisponíve${skipped.length === 1 ? 'l' : 'is'}.`;

      return {
        success: added.length > 0,
        message,
        data: {
          added,
          skipped,
          added_count: added.length,
          skipped_count: skipped.length,
        },
      };
    } catch (error: any) {
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        {
          success: false,
          message: 'Erro ao repetir o pedido.',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  private async notifyStaffOfNewOrder(
    orderId: string,
    userId: string,
    totalPrice: number,
    paymentMethod: string,
  ): Promise<void> {
    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('name')
        .eq('id', userId)
        .single();

      const customerName = profile?.name ?? 'Cliente';

      await this.expoPushService.notifyStaffNewOrder({
        id: orderId,
        total_price: totalPrice,
        payment_method: paymentMethod,
        customer_name: customerName,
      });

      void this.paymentsService.sendNewOrderNotification(customerName);
    } catch (err: any) {
      console.error(
        '[ORDER] Falha ao notificar staff sobre novo pedido:',
        err?.message ?? err,
      );
    }
  }

  private async notifyStaffOfCancelledOrder(
    orderId: string,
    userId: string,
  ): Promise<void> {
    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('name')
        .eq('id', userId)
        .single();

      await this.expoPushService.notifyStaffOrderCancelled({
        id: orderId,
        customer_name: profile?.name ?? null,
      });
    } catch (err: any) {
      console.error(
        '[ORDER] Falha ao notificar staff sobre cancelamento:',
        err?.message ?? err,
      );
    }
  }
}
