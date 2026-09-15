import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { supabase } from '../lib/supabase';
import { CartService } from '../cart/cart.service';
import { CreateCouponDto } from './dto/create-coupon.dto';
import { UpdateCouponDto } from './dto/update-coupon.dto';

const RATE_LIMIT_MAX_ATTEMPTS = 10;
const RATE_LIMIT_WINDOW_MS = 60_000;

@Injectable()
export class CouponsService {
  // Limitador simples em memória: não vale a pena uma dependência nova
  // (@nestjs/throttler) só para isto. Reinicia a cada deploy, o que é
  // aceitável já que o objetivo é só dificultar tentativa em massa.
  private readonly attemptsByUser = new Map<
    string,
    { count: number; resetAt: number }
  >();

  constructor(private readonly cartService: CartService) {}

  private checkRateLimit(userId: string) {
    const now = Date.now();
    const entry = this.attemptsByUser.get(userId);

    if (!entry || entry.resetAt <= now) {
      this.attemptsByUser.set(userId, {
        count: 1,
        resetAt: now + RATE_LIMIT_WINDOW_MS,
      });
      return;
    }

    if (entry.count >= RATE_LIMIT_MAX_ATTEMPTS) {
      throw new HttpException(
        {
          success: false,
          message: 'Muitas tentativas. Aguarde um minuto e tente novamente.',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    entry.count += 1;
  }

  /**
   * Validação somente leitura para o checkout: não consome o cupom (isso só
   * acontece na criação do pedido, via RPC `deduct_stock_and_redeem`).
   */
  async validateForUser(userId: string, code: string) {
    this.checkRateLimit(userId);

    const cartResponse = await this.cartService.getCart(userId);
    const subtotal = Number(cartResponse.data?.total_price ?? 0);

    if (!cartResponse.data.cart || subtotal <= 0) {
      throw new HttpException(
        { success: false, message: 'Seu carrinho está vazio.' },
        HttpStatus.BAD_REQUEST,
      );
    }

    const { data: coupon } = await supabase
      .from('coupons')
      .select('*')
      .eq('code_normalized', code.trim().toUpperCase())
      .maybeSingle();

    const genericInvalid = () =>
      new HttpException(
        {
          success: false,
          message: 'Cupom inválido ou expirado.',
          error: 'COUPON_INVALID',
        },
        HttpStatus.BAD_REQUEST,
      );

    if (!coupon || !coupon.is_active) throw genericInvalid();
    if (coupon.expires_at && new Date(coupon.expires_at) <= new Date()) {
      throw genericInvalid();
    }
    if (coupon.max_uses !== null && coupon.used_count >= coupon.max_uses) {
      throw genericInvalid();
    }
    if (
      coupon.min_order_total !== null &&
      subtotal < Number(coupon.min_order_total)
    ) {
      throw new HttpException(
        {
          success: false,
          message: `Válido em compras acima de ${Number(coupon.min_order_total).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}.`,
          error: 'COUPON_BELOW_MIN_ORDER',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const discountAmount = Number(
      Math.min(
        subtotal,
        (subtotal * Number(coupon.discount_percent)) / 100,
      ).toFixed(2),
    );

    return {
      success: true,
      message: 'Cupom aplicado.',
      data: {
        code: coupon.code,
        discount_percent: Number(coupon.discount_percent),
        discount_amount: discountAmount,
      },
    };
  }

  /** Estorna o uso do cupom de um pedido. Idempotente — seguro chamar mais de uma vez. */
  async revertRedemption(orderId: string) {
    const { error } = await supabase.rpc('revert_coupon_redemption', {
      p_order_id: orderId,
    });
    if (error) {
      console.error(
        `[COUPONS] Falha ao estornar cupom do pedido ${orderId}:`,
        error.message,
      );
    }
  }

  async adminList() {
    const { data, error } = await supabase
      .from('coupons')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    return { success: true, message: 'ok', data };
  }

  async adminCreate(dto: CreateCouponDto, createdBy: string) {
    const maxUses = dto.is_single_use ? 1 : (dto.max_uses ?? null);

    const { data, error } = await supabase
      .from('coupons')
      .insert({
        code: dto.code.trim(),
        description: dto.description ?? null,
        discount_percent: dto.discount_percent,
        max_uses: maxUses,
        min_order_total: dto.min_order_total ?? null,
        expires_at: dto.expires_at ?? null,
        created_by: createdBy,
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        throw new HttpException(
          { success: false, message: 'Já existe um cupom com este código.' },
          HttpStatus.CONFLICT,
        );
      }
      throw error;
    }

    return { success: true, message: 'Cupom criado.', data };
  }

  async adminUpdate(id: string, dto: UpdateCouponDto) {
    const update: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (dto.description !== undefined) update.description = dto.description;
    if (dto.discount_percent !== undefined)
      update.discount_percent = dto.discount_percent;
    if (dto.min_order_total !== undefined)
      update.min_order_total = dto.min_order_total;
    if (dto.expires_at !== undefined) update.expires_at = dto.expires_at;
    if (dto.is_single_use !== undefined) {
      update.max_uses = dto.is_single_use ? 1 : (dto.max_uses ?? null);
    } else if (dto.max_uses !== undefined) {
      update.max_uses = dto.max_uses;
    }

    const { data, error } = await supabase
      .from('coupons')
      .update(update)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw new HttpException(
        { success: false, message: 'Cupom não encontrado.' },
        HttpStatus.NOT_FOUND,
      );
    }

    return { success: true, message: 'Cupom atualizado.', data };
  }

  async adminToggle(id: string, isActive: boolean) {
    const { data, error } = await supabase
      .from('coupons')
      .update({ is_active: isActive, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw new HttpException(
        { success: false, message: 'Cupom não encontrado.' },
        HttpStatus.NOT_FOUND,
      );
    }

    return {
      success: true,
      message: isActive ? 'Cupom ativado.' : 'Cupom desativado.',
      data,
    };
  }
}
