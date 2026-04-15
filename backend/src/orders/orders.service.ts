import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { CreateOrderDto } from './dto/create-order.dto';
import { supabase } from '../lib/supabase';
import { calculateDeliveryFee } from '../utils/delivery.util';
import { PaymentsService } from '../payments/payment.service';
import { CartService } from '../cart/cart.service';

@Injectable()
export class OrdersService {
  constructor(
    private readonly cartService: CartService,
    private readonly paymentsService: PaymentsService,
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

      // Insere o pedido principal
      const { data: newOrder, error: orderError } = await supabase
        .from('orders')
        .insert({
          user_id: userId,
          address_id: dto.address_id || null,
          status: 'pending',
          payment_status: 'pending',
          total_price: finalTotalPrice,
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
        const qty = isUnit
          ? item.quantity
          : (item.weight || 0) / 1000;
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

        const failedProduct =
          stockResult?.failed_product || 'um produto';
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

      // Processa Pagamento
      console.log('[ORDER] Iniciando processamento de pagamento:', {
        payment_method: dto.payment_method,
        total_price: finalTotalPrice,
        order_id: newOrder.id,
      });

      const paymentResult = await this.paymentsService.processPayment({
        payment_method: dto.payment_method,
        total_price: finalTotalPrice,
        delivery_fee: deliveryFee,
        order_id: newOrder.id,
        items: orderItemsToInsert,
      });

      console.log('[ORDER] Resultado do processamento de pagamento:', {
        paymentResult,
      });

      // Limpa o carrinho APENAS se for dinheiro (os outros limpam via webhook depois)
      if (dto.payment_method === 'cash') {
        await supabase.from('cart_items').delete().eq('cart_id', cart.id);
        await supabase
          .from('carts')
          .update({ total_price: 0 })
          .eq('id', cart.id);
      }

      return {
        success: true,
        message: 'Pedido criado com sucesso!',
        data: {
          order_id: newOrder.id,
          status: paymentResult.orderStatus,
          total_price: finalTotalPrice,
          ...(paymentResult.init_point && {
            init_point: paymentResult.init_point,
          }),
          ...(paymentResult.sandbox_init_point && {
            sandbox_init_point: paymentResult.sandbox_init_point,
          }),
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
          order_items ( id, product_id, product_name, product_price, quantity, weight, subtotal ),
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

      const cancelableStatuses = ['pending'];

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

      // Devolver estoque dos itens do pedido cancelado
      if (orderItems && orderItems.length > 0) {
        const restoreItems = orderItems.map((item: any) => ({
          product_id: item.product_id,
          quantity: item.quantity ? item.quantity : (item.weight || 0) / 1000,
        }));

        const { error: restoreError } = await supabase.rpc('restore_stock', {
          items: restoreItems,
        });

        if (restoreError) {
          console.error(
            `[ORDER] Erro ao devolver estoque do pedido ${orderId}:`,
            restoreError,
          );
        }
      }

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

  async updateStatus(orderId: string, mpStatus: string): Promise<void> {
    const { data: order, error } = await supabase
      .from('orders')
      .select('id, status, user_id')
      .eq('id', orderId)
      .single();

    if (error || !order) {
      console.error(`[ORDER] Pedido ${orderId} não encontrado para atualização`);
      return;
    }

    // Idempotência: ignorar se já está em status final
    const finalStatuses = ['confirmed', 'cancelled'];
    if (finalStatuses.includes(order.status)) {
      console.log(
        `[ORDER] Pedido ${orderId} já está em status final "${order.status}". Ignorando.`,
      );
      return;
    }

    const statusMap: Record<
      string,
      { status: string; payment_status: string }
    > = {
      approved: { status: 'confirmed', payment_status: 'paid' },
      pending: { status: 'waiting_payment', payment_status: 'pending' },
      in_process: { status: 'waiting_payment', payment_status: 'pending' },
      rejected: { status: 'cancelled', payment_status: 'rejected' },
      cancelled: { status: 'cancelled', payment_status: 'cancelled' },
    };

    const mapped = statusMap[mpStatus];
    if (!mapped) {
      console.warn(
        `[ORDER] Status do MP desconhecido: "${mpStatus}". Ignorando.`,
      );
      return;
    }

    const { error: updateError } = await supabase
      .from('orders')
      .update({ status: mapped.status, payment_status: mapped.payment_status })
      .eq('id', orderId);

    if (updateError) {
      console.error(
        `[ORDER] Erro ao atualizar pedido ${orderId}:`,
        updateError,
      );
      return;
    }

    console.log(
      `[ORDER] Pedido ${orderId} atualizado → status="${mapped.status}" | payment_status="${mapped.payment_status}"`,
    );

    // Limpar carrinho após pagamento aprovado
    if (mpStatus === 'approved') {
      const cartResponse = await this.cartService.getCart(order.user_id);
      const cart = cartResponse?.data?.cart;
      if (cart) {
        await supabase.from('cart_items').delete().eq('cart_id', cart.id);
        await supabase
          .from('carts')
          .update({ total_price: 0 })
          .eq('id', cart.id);
        console.log(`[ORDER] Carrinho do usuário ${order.user_id} limpo após aprovação.`);
      }
    }
  }

  async confirmAndPayOrder(userId: string, orderId: string, paymentData: any) {
    // Placeholder para o MP
  }
}
