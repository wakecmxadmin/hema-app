import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { supabase } from '../lib/supabase';
import {
  ORDER_STATUSES,
  UpdateOrderStatusDto,
} from './dto/update-order-status.dto';
import type { OrderStatus } from './dto/update-order-status.dto';
import { ConfirmOrderDto, RejectOrderDto } from './dto/confirm-order.dto';
import { ShippingService } from '../shipping/shipping.service';
import { ExpoPushService } from '../notifications/expo-push.service';

interface ListOrdersQuery {
  status?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

const PAYMENT_WINDOW_HOURS = 1;

@Injectable()
export class AdminOrdersService {
  constructor(
    private readonly shippingService: ShippingService,
    private readonly expoPushService: ExpoPushService,
  ) {}

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
        .update({ status: dto.status })
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

  /**
   * Confirma o pedido após a loja conferir o estoque físico. Pode opcionalmente
   * editar itens (apenas reduzir/remover, nunca aumentar). Para PIX/cartão,
   * abre janela de pagamento; para dinheiro, vai direto pra `confirmed` e
   * dispara o envio.
   */
  async confirmOrder(orderId: string, dto: ConfirmOrderDto) {
    try {
      const { data: order, error: fetchError } = await supabase
        .from('orders')
        .select(
          `id, user_id, status, payment_method, delivery_fee, total_price,
           original_total_price,
           order_items ( id, product_id, product_price, quantity, weight, subtotal )`,
        )
        .eq('id', orderId)
        .single();

      if (fetchError || !order) {
        throw new HttpException(
          { success: false, message: 'Pedido não encontrado.' },
          HttpStatus.NOT_FOUND,
        );
      }

      if (order.status !== 'awaiting_store_confirmation') {
        throw new HttpException(
          {
            success: false,
            message: `Pedido não pode ser confirmado (status atual: ${order.status}).`,
          },
          HttpStatus.CONFLICT,
        );
      }

      const wasEdited = !!dto.edits && dto.edits.length > 0;

      if (wasEdited) {
        await this.applyEdits(orderId, order, dto.edits);
      }

      const isCash = order.payment_method === 'cash';
      const nextStatus: OrderStatus = isCash
        ? 'confirmed'
        : 'awaiting_customer_payment';

      const updatePayload: Record<string, any> = {
        status: nextStatus,
        was_edited: wasEdited,
      };

      if (!isCash) {
        updatePayload.payment_window_expires_at = new Date(
          Date.now() + PAYMENT_WINDOW_HOURS * 60 * 60 * 1000,
        ).toISOString();
      }

      // Lock otimista por status: se outro admin confirmou no mesmo segundo,
      // só um dos updates afeta linha.
      const { data: updated, error: updateError } = await supabase
        .from('orders')
        .update(updatePayload)
        .eq('id', orderId)
        .eq('status', 'awaiting_store_confirmation')
        .select()
        .single();

      if (updateError || !updated) {
        throw new HttpException(
          {
            success: false,
            message:
              'Não foi possível confirmar o pedido (talvez já tenha sido confirmado).',
          },
          HttpStatus.CONFLICT,
        );
      }

      if (isCash) {
        void this.shippingService.createForOrder(orderId);
      }

      void this.notifyCustomerOfConfirmation(order.user_id, orderId, {
        isCash,
        wasEdited,
      });

      return {
        success: true,
        message: isCash
          ? 'Pedido confirmado.'
          : 'Pedido confirmado. Cliente foi notificado para pagar.',
        data: updated,
      };
    } catch (error: any) {
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        {
          success: false,
          message: 'Erro ao confirmar pedido.',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Loja não consegue atender — libera reserva e devolve ao cliente.
   */
  async rejectOrder(orderId: string, dto: RejectOrderDto) {
    try {
      const { data: order, error: fetchError } = await supabase
        .from('orders')
        .select(
          `id, user_id, status,
           order_items ( product_id, quantity, weight )`,
        )
        .eq('id', orderId)
        .single();

      if (fetchError || !order) {
        throw new HttpException(
          { success: false, message: 'Pedido não encontrado.' },
          HttpStatus.NOT_FOUND,
        );
      }

      if (
        order.status !== 'awaiting_store_confirmation' &&
        order.status !== 'awaiting_customer_payment'
      ) {
        throw new HttpException(
          {
            success: false,
            message: `Pedido não pode ser rejeitado (status: ${order.status}).`,
          },
          HttpStatus.CONFLICT,
        );
      }

      const { error: updateError } = await supabase
        .from('orders')
        .update({
          status: 'cancelled',
          rejection_reason: dto.reason,
        })
        .eq('id', orderId);

      if (updateError) throw updateError;

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
          console.error(
            `[ADMIN_ORDER] Falha ao liberar reserva ao rejeitar ${orderId}:`,
            releaseError,
          );
        }
      }

      void this.expoPushService.notifyUser(order.user_id, {
        title: 'Pedido cancelado pela loja ❌',
        body: `Motivo: ${dto.reason}`,
        data: { type: 'order_rejected', orderId },
      });

      return {
        success: true,
        message: 'Pedido rejeitado.',
        data: { status: 'cancelled', rejection_reason: dto.reason },
      };
    } catch (error: any) {
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        {
          success: false,
          message: 'Erro ao rejeitar pedido.',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Aplica as edições do admin no order_items. Só permite reduzir/remover —
   * aumentar quantidade levaria o cliente a um total maior sem nova aceitação
   * de pagamento, então rejeitamos.
   */
  private async applyEdits(
    orderId: string,
    order: any,
    edits: ConfirmOrderDto['edits'],
  ): Promise<void> {
    const itemsById = new Map<string, any>(
      (order.order_items as any[]).map((it) => [it.id, it]),
    );

    const releaseAccum: Array<{ product_id: string; quantity: number }> = [];
    let newSubtotalSum = 0;

    // Subtotais inalterados — soma só dos itens que não foram tocados.
    const editedIds = new Set(edits!.map((e) => e.order_item_id));
    for (const it of itemsById.values()) {
      if (!editedIds.has(it.id)) newSubtotalSum += Number(it.subtotal);
    }

    for (const edit of edits!) {
      const current = itemsById.get(edit.order_item_id);
      if (!current) {
        throw new HttpException(
          {
            success: false,
            message: `Item ${edit.order_item_id} não pertence ao pedido.`,
          },
          HttpStatus.BAD_REQUEST,
        );
      }

      const isUnit = current.quantity != null;

      if (isUnit && edit.new_weight != null) {
        throw new HttpException(
          { success: false, message: 'Item por unidade — use new_quantity.' },
          HttpStatus.BAD_REQUEST,
        );
      }
      if (!isUnit && edit.new_quantity != null) {
        throw new HttpException(
          { success: false, message: 'Item por peso — use new_weight.' },
          HttpStatus.BAD_REQUEST,
        );
      }

      if (isUnit) {
        const next = edit.new_quantity ?? 0;
        if (next > Number(current.quantity)) {
          throw new HttpException(
            {
              success: false,
              message: 'Edição não pode aumentar quantidade.',
            },
            HttpStatus.BAD_REQUEST,
          );
        }
        const released = Number(current.quantity) - next;
        if (released > 0) {
          releaseAccum.push({
            product_id: current.product_id,
            quantity: released,
          });
        }

        if (next === 0) {
          await supabase.from('order_items').delete().eq('id', current.id);
        } else {
          const newSubtotal = Number(
            (Number(current.product_price) * next).toFixed(2),
          );
          await supabase
            .from('order_items')
            .update({ quantity: next, subtotal: newSubtotal })
            .eq('id', current.id);
          newSubtotalSum += newSubtotal;
        }
      } else {
        const nextW = edit.new_weight ?? 0;
        if (nextW > Number(current.weight)) {
          throw new HttpException(
            { success: false, message: 'Edição não pode aumentar peso.' },
            HttpStatus.BAD_REQUEST,
          );
        }
        const releasedKg = (Number(current.weight) - nextW) / 1000;
        if (releasedKg > 0) {
          releaseAccum.push({
            product_id: current.product_id,
            quantity: releasedKg,
          });
        }

        if (nextW === 0) {
          await supabase.from('order_items').delete().eq('id', current.id);
        } else {
          const newSubtotal = Number(
            (Number(current.product_price) * (nextW / 1000)).toFixed(2),
          );
          await supabase
            .from('order_items')
            .update({ weight: nextW, subtotal: newSubtotal })
            .eq('id', current.id);
          newSubtotalSum += newSubtotal;
        }
      }
    }

    if (newSubtotalSum === 0) {
      throw new HttpException(
        {
          success: false,
          message:
            'Edição zerou o pedido. Use o endpoint de rejeição para cancelar.',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    if (releaseAccum.length > 0) {
      const { error: releaseError } = await supabase.rpc('release_stock', {
        items: releaseAccum,
      });
      if (releaseError) {
        console.error(
          `[ADMIN_ORDER] Falha ao liberar reservas na edição de ${orderId}:`,
          releaseError,
        );
      }
    }

    const newTotal = Number(
      (newSubtotalSum + Number(order.delivery_fee ?? 0)).toFixed(2),
    );

    await supabase
      .from('orders')
      .update({ total_price: newTotal })
      .eq('id', orderId);
  }

  private async notifyCustomerOfConfirmation(
    userId: string,
    orderId: string,
    opts: { isCash: boolean; wasEdited: boolean },
  ): Promise<void> {
    const title = opts.wasEdited
      ? 'Loja editou seu pedido ✏️'
      : 'Pedido confirmado pela loja ✅';

    const body = opts.wasEdited
      ? 'Revise os itens disponíveis e finalize o pagamento.'
      : opts.isCash
        ? 'Estamos preparando seu pedido. Você paga na entrega.'
        : 'Toque para pagar e garantir seu pedido (1h).';

    await this.expoPushService.notifyUser(userId, {
      title,
      body,
      data: { type: 'order_confirmed_by_store', orderId },
    });
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

      // Libera as reservas dos itens. Pedidos já em delivered/completed podem
      // ter reservas zeradas (após shipped/commit_stock) — release com clamp
      // em zero é idempotente, então não causa inconsistência.
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
            `[ADMIN_ORDER] Falha ao liberar reserva do pedido ${orderId}:`,
            releaseError,
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
