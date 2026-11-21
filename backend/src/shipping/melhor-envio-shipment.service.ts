import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { supabase } from '../lib/supabase';
import {
  MelhorEnvioService,
  MeQuoteOption,
  meErrorMessage,
} from './melhor-envio.service';
import { PackItem, pickVolume, Volume } from './melhor-envio.packaging';
import { advancesDelivery } from './shipping-status.util';

// Status do Melhor Envio que mexem no status do pedido. Os demais só ficam
// em `shipping_status`.
const ME_STATUS_MAP: Record<string, string | null> = {
  posted: 'shipped',
  delivered: 'delivered',
};

const FINAL_ME_STATUSES = ['delivered', 'canceled', 'cancelled', 'expired'];

function digits(value?: string | null): string {
  return (value ?? '').replace(/\D/g, '');
}

export interface MeQuoteResult {
  ok: boolean;
  options: MeQuoteOption[];
  volume: Volume | null;
  message?: string;
}

export interface MeDispatchResult {
  ok: boolean;
  message: string;
  meOrderId?: string;
}

@Injectable()
export class MelhorEnvioShipmentService {
  private readonly logger = new Logger(MelhorEnvioShipmentService.name);

  constructor(private readonly me: MelhorEnvioService) {}

  isConfigured(): boolean {
    return this.me.isConfigured();
  }

  // ───────────────────────── cotação ─────────────────────────

  async quote(
    postalCode: string,
    items: PackItem[],
    insuranceValue: number,
  ): Promise<MeQuoteResult> {
    const cep = digits(postalCode);
    if (cep.length !== 8) {
      return { ok: false, options: [], volume: null, message: 'CEP inválido.' };
    }

    const volume = pickVolume(items);
    if (!volume) {
      return {
        ok: false,
        options: [],
        volume: null,
        message:
          'O pedido passa de 30 kg, limite para envio pelos Correios. Divida em mais de um pedido.',
      };
    }

    const result = await this.me.quote(cep, volume, insuranceValue);
    if (!result.ok) {
      return {
        ok: false,
        options: [],
        volume,
        message: 'Não foi possível calcular o frete agora.',
      };
    }
    if (result.options.length === 0) {
      return {
        ok: false,
        options: [],
        volume,
        message: 'Nenhuma transportadora atende este CEP.',
      };
    }
    return { ok: true, options: result.options, volume };
  }

  // ───────────────────────── etiqueta ─────────────────────────

  /**
   * Compra e gera a etiqueta do pedido: carrinho → checkout (saldo da
   * carteira) → generate. Retomável: se uma etapa falhar, a próxima chamada
   * consulta o status da etiqueta no Melhor Envio e continua de onde parou,
   * sem comprar duas vezes.
   */
  async createForOrder(
    orderId: string,
    restarted = false,
  ): Promise<MeDispatchResult> {
    const { data: order, error } = await supabase
      .from('orders')
      .select(
        `id, user_id, status, me_service_id, me_order_id, nfe_key,
         shipping_dispatched_at,
         order_items ( id, product_id, product_name, product_price, quantity, weight, subtotal ),
         addresses ( street, number, complement, neighborhood, city, state, zip_code )`,
      )
      .eq('id', orderId)
      .single();

    if (error || !order) {
      return { ok: false, message: 'Pedido não encontrado.' };
    }

    const items: any[] = order.order_items ?? [];
    let meOrderId: string | null = order.me_order_id;

    if (!meOrderId) {
      const built = await this.buildCartPayload(order, items);
      if ('error' in built) return this.fail(orderId, built.error);

      const cart = await this.me.addToCart(built.payload);
      if (!cart.ok || !cart.body?.id) {
        return this.fail(
          orderId,
          `Melhor Envio recusou a etiqueta: ${meErrorMessage(cart.body)}`,
        );
      }
      meOrderId = String(cart.body.id);
      await supabase
        .from('orders')
        .update({ me_order_id: meOrderId, shipping_status: 'pending' })
        .eq('id', orderId);
    }

    const info = (await this.me.tracking([meOrderId]))?.[meOrderId];
    let status = info?.status ?? 'pending';

    if (['canceled', 'cancelled', 'expired'].includes(status)) {
      if (restarted) {
        return this.fail(
          orderId,
          `Etiqueta ${meOrderId} está ${status} no Melhor Envio.`,
        );
      }
      // Etiqueta antiga venceu/foi cancelada: começa uma nova.
      await supabase
        .from('orders')
        .update({ me_order_id: null })
        .eq('id', orderId);
      return this.createForOrder(orderId, true);
    }

    if (status === 'pending') {
      const paid = await this.me.checkout(meOrderId);
      if (!paid.ok) {
        return this.fail(
          orderId,
          `Pagamento da etiqueta falhou (saldo na carteira do Melhor Envio?): ${meErrorMessage(paid.body)}`,
        );
      }
      status = 'released';
    }

    if (status === 'released') {
      const gen = await this.me.generate(meOrderId);
      const genOk = gen.ok && gen.body?.[meOrderId]?.status !== false;
      if (!genOk) {
        return this.fail(
          orderId,
          `Geração da etiqueta falhou: ${meErrorMessage(gen.body?.[meOrderId] ?? gen.body)}`,
        );
      }
      status = 'generated';
    }

    const update: Record<string, any> = {
      shipping_status: status,
      shipping_last_error: null,
    };
    if (!order.shipping_dispatched_at) {
      update.shipping_dispatched_at = new Date().toISOString();
    }
    if (info?.tracking) update.me_tracking_code = info.tracking;

    // A geração é assíncrona; se a impressão ainda não estiver pronta, o
    // admin busca o link depois pelo botão "Etiqueta".
    const printed = await this.me.print(meOrderId);
    if (printed.ok && printed.body?.url) update.me_label_url = printed.body.url;

    await supabase.from('orders').update(update).eq('id', orderId);

    // Mesmo comportamento do LogManager: a mercadoria saiu da reserva.
    if (!order.shipping_dispatched_at) {
      const commitItems = items.map((it: any) => ({
        product_id: it.product_id,
        quantity: it.quantity ? it.quantity : (it.weight || 0) / 1000,
      }));
      const { error: commitError } = await supabase.rpc('commit_stock', {
        items: commitItems,
      });
      if (commitError) {
        this.logger.error(
          `Falha ao commitar estoque do pedido ${orderId}: ${commitError.message}`,
        );
      }
    }

    this.logger.log(
      `Pedido ${orderId}: etiqueta Melhor Envio ${meOrderId} (${status}).`,
    );
    return {
      ok: true,
      message: `Etiqueta gerada no Melhor Envio (${meOrderId}).`,
      meOrderId,
    };
  }

  private async fail(
    orderId: string,
    message: string,
  ): Promise<MeDispatchResult> {
    this.logger.warn(`Pedido ${orderId}: ${message}`);
    await supabase
      .from('orders')
      .update({ shipping_last_error: message })
      .eq('id', orderId);
    return { ok: false, message };
  }

  private async buildCartPayload(
    order: any,
    items: any[],
  ): Promise<{ payload: any } | { error: string }> {
    const address: any = order.addresses;
    if (!address) return { error: 'Pedido sem endereço de entrega.' };
    if (!order.me_service_id) {
      return {
        error: 'Pedido sem serviço de frete escolhido (me_service_id).',
      };
    }

    const [{ data: profile }, { data: userData }] = await Promise.all([
      supabase
        .from('profiles')
        .select('name, phone, cpf')
        .eq('id', order.user_id)
        .single(),
      supabase.auth.admin.getUserById(order.user_id),
    ]);

    const faltando: string[] = [];
    if (digits(profile?.phone).length < 10)
      faltando.push('telefone do cliente');
    if (digits(profile?.cpf).length !== 11) faltando.push('CPF do cliente');
    if (digits(address.zip_code).length !== 8) faltando.push('CEP do endereço');

    const nfeKey = digits(order.nfe_key);
    const nonCommercial = process.env.MELHOR_ENVIO_NON_COMMERCIAL === 'true';
    if (!nfeKey && !nonCommercial) faltando.push('chave da NF-e');
    if (nfeKey && nfeKey.length !== 44) {
      return { error: 'Chave da NF-e inválida: precisa ter 44 dígitos.' };
    }

    if (faltando.length > 0) {
      return {
        error: `Etiqueta não criada: falta ${faltando.join(', ')}. Corrija e reenvie.`,
      };
    }

    const volume = pickVolume(
      items.map((it) => ({
        name: it.product_name,
        quantity: it.quantity,
        weight: it.weight,
      })),
    );
    if (!volume)
      return { error: 'Pedido passa de 30 kg — não cabe numa etiqueta.' };

    const insurance = Number(
      items.reduce((sum, it) => sum + Number(it.subtotal || 0), 0).toFixed(2),
    );

    const fromDoc = digits(process.env.MELHOR_ENVIO_FROM_DOCUMENT);
    const env = process.env;

    const options: Record<string, any> = {
      insurance_value: insurance,
      receipt: false,
      own_hand: false,
      reverse: false,
      non_commercial: !nfeKey,
      platform: 'Hema',
      reminder: `Pedido #${order.id.substring(0, 8).toUpperCase()}`,
      tags: [{ tag: order.id, url: null }],
    };
    if (nfeKey) options.invoice = { key: nfeKey };

    return {
      payload: {
        service: order.me_service_id,
        from: {
          name: env.MELHOR_ENVIO_FROM_NAME ?? 'Hema',
          phone: digits(env.MELHOR_ENVIO_FROM_PHONE),
          email: env.MELHOR_ENVIO_FROM_EMAIL ?? '',
          ...(fromDoc.length === 14
            ? { document: '', company_document: fromDoc }
            : { document: fromDoc }),
          // Com declaração de conteúdo (sem NF-e) a API exige IE vazia ou
          // "ISENTO"; a IE só vai em envio comercial.
          state_register: nfeKey
            ? (env.MELHOR_ENVIO_FROM_STATE_REGISTER ?? '')
            : '',
          economic_activity_code: env.MELHOR_ENVIO_FROM_CNAE ?? '',
          address: env.MELHOR_ENVIO_FROM_ADDRESS ?? '',
          number: env.MELHOR_ENVIO_FROM_NUMBER ?? '',
          complement: env.MELHOR_ENVIO_FROM_COMPLEMENT ?? '',
          district: env.MELHOR_ENVIO_FROM_DISTRICT ?? '',
          city: env.MELHOR_ENVIO_FROM_CITY ?? '',
          state_abbr: env.MELHOR_ENVIO_FROM_STATE ?? '',
          country_id: 'BR',
          postal_code: digits(env.MELHOR_ENVIO_FROM_POSTAL_CODE),
        },
        to: {
          name: profile?.name ?? 'Cliente',
          phone: digits(profile?.phone),
          email: userData?.user?.email ?? '',
          document: digits(profile?.cpf),
          address: address.street ?? '',
          number: address.number ?? 'S/N',
          complement: address.complement ?? '',
          district: address.neighborhood ?? '',
          city: address.city ?? '',
          state_abbr: (address.state ?? '').toUpperCase(),
          country_id: 'BR',
          postal_code: digits(address.zip_code),
        },
        products: items.map((it) =>
          it.quantity
            ? {
                name: it.product_name,
                quantity: String(it.quantity),
                unitary_value: String(Number(it.product_price).toFixed(2)),
              }
            : {
                name: `${it.product_name} (${it.weight}g)`,
                quantity: '1',
                unitary_value: String(Number(it.subtotal).toFixed(2)),
              },
        ),
        volumes: [volume],
        options,
      },
    };
  }

  /** Link público da etiqueta para imprimir. Busca de novo se ainda não tiver. */
  async labelUrl(
    orderId: string,
  ): Promise<{ ok: boolean; message: string; url?: string }> {
    const { data: order } = await supabase
      .from('orders')
      .select('me_order_id')
      .eq('id', orderId)
      .single();

    if (!order?.me_order_id) {
      return {
        ok: false,
        message: 'Pedido ainda não tem etiqueta no Melhor Envio.',
      };
    }

    const printed = await this.me.print(order.me_order_id);
    if (!printed.ok || !printed.body?.url) {
      return {
        ok: false,
        message: `Etiqueta ainda não disponível: ${meErrorMessage(printed.body)}`,
      };
    }

    await supabase
      .from('orders')
      .update({ me_label_url: printed.body.url })
      .eq('id', orderId);
    return { ok: true, message: 'Etiqueta disponível.', url: printed.body.url };
  }

  // ───────────────────────── cancelamento ─────────────────────────

  /**
   * Cancela a etiqueta do pedido (se houver). Melhor esforço: chamado depois
   * de o pedido já ter sido cancelado no app; uma falha aqui fica registrada
   * em `shipping_last_error` para o admin resolver no painel do Melhor Envio.
   * Etiqueta gerada e cancelada volta para a carteira em ~12h.
   */
  async cancelForOrder(orderId: string, reason: string): Promise<void> {
    const { data: order } = await supabase
      .from('orders')
      .select('me_order_id, shipping_status')
      .eq('id', orderId)
      .single();

    const meOrderId = order?.me_order_id;
    if (!meOrderId) return;

    const status =
      (await this.me.tracking([meOrderId]))?.[meOrderId]?.status ??
      order?.shipping_status ??
      'pending';

    if (['canceled', 'cancelled', 'expired'].includes(status)) return;

    let result;
    if (status === 'pending') {
      result = await this.me.removeFromCart(meOrderId);
    } else if (['released', 'generated'].includes(status)) {
      result = await this.me.cancel(meOrderId, reason);
    } else {
      result = {
        ok: false,
        status: 409,
        body: { message: `etiqueta já está ${status}` },
      };
    }

    if (result.ok) {
      await supabase
        .from('orders')
        .update({ shipping_status: 'canceled' })
        .eq('id', orderId);
      this.logger.log(`Pedido ${orderId}: etiqueta ${meOrderId} cancelada.`);
      return;
    }

    await supabase
      .from('orders')
      .update({
        shipping_last_error: `Pedido cancelado, mas a etiqueta ${meOrderId} não foi cancelada no Melhor Envio: ${meErrorMessage(result.body)}`,
      })
      .eq('id', orderId);
  }

  // ───────────────────────── status ─────────────────────────

  /** Aplica um status de etiqueta (webhook ou consulta) ao pedido. */
  async applyStatus(
    meOrderId: string,
    meStatus: string,
    trackingCode?: string | null,
    trackingUrl?: string | null,
  ): Promise<void> {
    const { data: order } = await supabase
      .from('orders')
      .select('id, status, shipping_status, me_tracking_code')
      .eq('me_order_id', meOrderId)
      .maybeSingle();

    if (!order) {
      this.logger.warn(
        `Melhor Envio: etiqueta ${meOrderId} sem pedido correspondente.`,
      );
      return;
    }

    const normalized = String(meStatus).toLowerCase();
    const update: Record<string, any> = { shipping_status: normalized };

    if (trackingCode && trackingCode !== order.me_tracking_code) {
      update.me_tracking_code = trackingCode;
      update.me_tracking_url =
        trackingUrl ??
        `https://www.melhorrastreio.com.br/rastreio/${trackingCode}`;
    }

    const mapped = ME_STATUS_MAP[normalized] ?? null;
    if (advancesDelivery(order.status, mapped)) update.status = mapped;

    if (
      order.shipping_status === normalized &&
      !update.me_tracking_code &&
      !update.status
    ) {
      return; // nada mudou (evento repetido)
    }

    const { error } = await supabase
      .from('orders')
      .update(update)
      .eq('id', order.id);
    if (error) {
      this.logger.error(
        `Erro ao atualizar pedido ${order.id}: ${error.message}`,
      );
      return;
    }
    this.logger.log(
      `Melhor Envio: pedido ${order.id} shipping_status=${normalized}${update.status ? ` status=${update.status}` : ''}`,
    );
  }

  async handleWebhook(payload: any): Promise<void> {
    const data = payload?.data;
    if (!data?.id || !data?.status) {
      this.logger.warn(
        `Webhook Melhor Envio ignorado — payload incompleto: ${JSON.stringify(payload).substring(0, 500)}`,
      );
      return;
    }
    await this.applyStatus(
      String(data.id),
      String(data.status),
      data.tracking ?? data.self_tracking ?? null,
      data.tracking_url ?? null,
    );
  }

  /**
   * Rede de segurança do webhook (que desiste após 5 tentativas e não
   * dispara para etiquetas criadas com token do painel).
   */
  @Cron(CronExpression.EVERY_HOUR)
  async syncTracking(): Promise<void> {
    if (!this.me.isConfigured()) return;

    const { data: orders, error } = await supabase
      .from('orders')
      .select('me_order_id, shipping_status')
      .eq('shipping_provider', 'melhor_envio')
      .not('me_order_id', 'is', null)
      .neq('status', 'cancelled')
      .not('shipping_status', 'in', `(${FINAL_ME_STATUSES.join(',')})`)
      .limit(100);

    if (error) {
      this.logger.error(
        `Falha ao listar etiquetas para rastreio: ${error.message}`,
      );
      return;
    }

    const ids = (orders ?? []).map((o: any) => o.me_order_id as string);
    if (ids.length === 0) return;

    const info = await this.me.tracking(ids);
    if (!info) return;

    for (const id of ids) {
      const t = info[id];
      if (t?.status) {
        await this.applyStatus(
          id,
          t.status,
          t.tracking ?? t.melhorenvio_tracking,
        );
      }
    }
  }
}
