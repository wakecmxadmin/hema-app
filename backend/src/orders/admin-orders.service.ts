import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { supabase } from '../lib/supabase';
import {
  ORDER_STATUSES,
  UpdateOrderStatusDto,
} from './dto/update-order-status.dto';
import type { OrderStatus } from './dto/update-order-status.dto';
import { ShippingService } from '../shipping/shipping.service';

interface ListOrdersQuery {
  status?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

@Injectable()
export class AdminOrdersService {
  constructor(private readonly shippingService: ShippingService) {}

  async findAll(query: ListOrdersQuery) {
    try {
      const limit = Math.min(Math.max(Number(query.limit) || 50, 1), 200);
      const offset = Math.max(Number(query.offset) || 0, 0);

      let q = supabase
        .from('orders')
        .select(
          `*,
           order_items ( id, product_name, quantity, weight, subtotal ),
           addresses ( city, state )`,
          { count: 'exact' },
        )
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (query.status) {
        const statuses = query.status.split(',').filter(Boolean);
        if (statuses.length > 0) q = q.in('status', statuses);
      }

      const { data: orders, error, count } = await q;
      if (error) throw error;

      const userIds = Array.from(
        new Set((orders ?? []).map((o: any) => o.user_id).filter(Boolean)),
      );

      let profilesById: Record<string, any> = {};
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, name, phone')
          .in('id', userIds);

        profilesById = Object.fromEntries(
          (profiles ?? []).map((p: any) => [p.id, p]),
        );
      }

      let enriched = (orders ?? []).map((o: any) => ({
        ...o,
        customer: profilesById[o.user_id] ?? null,
      }));

      // Search is applied client-side after enrichment so we can match on name.
      if (query.search) {
        const term = query.search.trim().toLowerCase();
        if (term) {
          enriched = enriched.filter((o: any) => {
            const name = o.customer?.name?.toLowerCase() ?? '';
            const id = o.id?.toLowerCase() ?? '';
            return name.includes(term) || id.includes(term);
          });
        }
      }

      return {
        success: true,
        message: 'Pedidos carregados',
        data: enriched,
        meta: { total: count ?? enriched.length, limit, offset },
      };
    } catch (error: any) {
      throw new HttpException(
        {
          success: false,
          message: 'Erro ao listar pedidos.',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async findOne(orderId: string) {
    try {
      const { data: order, error } = await supabase
        .from('orders')
        .select(
          `*,
           order_items ( id, product_id, product_name, product_price, quantity, weight, subtotal, products ( image_url ) ),
           addresses ( label, street, number, complement, neighborhood, city, state, zip_code )`,
        )
        .eq('id', orderId)
        .single();

      if (error || !order) {
        throw new HttpException(
          { success: false, message: 'Pedido não encontrado.' },
          HttpStatus.NOT_FOUND,
        );
      }

      const [{ data: profile }, { data: userData }] = await Promise.all([
        supabase
          .from('profiles')
          .select('id, name, phone, cpf, avatar_url')
          .eq('id', order.user_id)
          .single(),
        supabase.auth.admin.getUserById(order.user_id),
      ]);

      const customer = {
        ...(profile ?? {}),
        email: userData?.user?.email ?? null,
      };

      return {
        success: true,
        message: 'Detalhes do pedido',
        data: { ...order, customer },
      };
    } catch (error: any) {
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        {
          success: false,
          message: 'Erro ao buscar pedido.',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async updateStatus(orderId: string, dto: UpdateOrderStatusDto) {
    try {
      if (!ORDER_STATUSES.includes(dto.status)) {
        throw new HttpException(
          { success: false, message: 'Status inválido.' },
          HttpStatus.BAD_REQUEST,
        );
      }

      const { data: existing, error: fetchError } = await supabase
        .from('orders')
        .select('id, status, payment_method, logmanager_envio_id')
        .eq('id', orderId)
        .single();

      if (fetchError || !existing) {
        throw new HttpException(
          { success: false, message: 'Pedido não encontrado.' },
          HttpStatus.NOT_FOUND,
        );
      }

      if (existing.status === dto.status) {
        return {
          success: true,
          message: 'Pedido já estava neste status.',
          data: { status: dto.status },
        };
      }

      const { data: updated, error } = await supabase
        .from('orders')
        .update({ status: dto.status as OrderStatus })
        .eq('id', orderId)
        .select()
        .single();

      if (error) throw error;

      // Para pedidos em dinheiro, o gatilho do envio é a confirmação manual do
      // admin (não há webhook de pagamento). PIX/cartão são tratados no
      // PaymentsService.handleMercadoPagoWebhook.
      if (
        dto.status === 'confirmed' &&
        existing.payment_method === 'cash' &&
        !existing.logmanager_envio_id
      ) {
        void this.shippingService.createForOrder(orderId);
      }

      return {
        success: true,
        message: 'Status atualizado.',
        data: updated,
      };
    } catch (error: any) {
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        {
          success: false,
          message: 'Erro ao atualizar status.',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async cancelOrder(orderId: string) {
    try {
      const { data: existing, error: fetchError } = await supabase
        .from('orders')
        .select('id, status')
        .eq('id', orderId)
        .single();

      if (fetchError || !existing) {
        throw new HttpException(
          { success: false, message: 'Pedido não encontrado.' },
          HttpStatus.NOT_FOUND,
        );
      }

      if (existing.status === 'cancelled') {
        return {
          success: true,
          message: 'Pedido já está cancelado.',
          data: { status: 'cancelled' },
        };
      }

      const { data: orderItems } = await supabase
        .from('order_items')
        .select('product_id, quantity, weight')
        .eq('order_id', orderId);

      const { error } = await supabase
        .from('orders')
        .update({ status: 'cancelled' })
        .eq('id', orderId);

      if (error) throw error;

      // Devolve estoque dos itens. A devolução de estoque para pedidos que já
      // estavam "delivered/completed" pode causar inconsistência, mas o admin
      // assumiu esse risco ao cancelar fora do fluxo padrão.
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
            `[ADMIN_ORDER] Falha ao devolver estoque do pedido ${orderId}:`,
            restoreError,
          );
        }
      }

      return {
        success: true,
        message: 'Pedido cancelado.',
        data: { status: 'cancelled' },
      };
    } catch (error: any) {
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        {
          success: false,
          message: 'Erro ao cancelar pedido.',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
