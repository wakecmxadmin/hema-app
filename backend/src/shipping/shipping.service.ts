import { Injectable, Logger } from '@nestjs/common';
import { supabase } from '../lib/supabase';
import {
  LogManagerItem,
  LogManagerService,
  LogManagerShipmentPayload,
} from './logmanager.service';
import { MelhorEnvioShipmentService } from './melhor-envio-shipment.service';
import { PackItem } from './melhor-envio.packaging';
import { advancesDelivery } from './shipping-status.util';

// Status do LogManager mapeados para os nossos. Mantemos o status do pedido (`status`)
// apenas para transições significativas e usamos `shipping_status` para o estado bruto.
const STATUS_MAP: Record<string, string | null> = {
  collected: 'shipped',
  coletado: 'shipped',
  shipped: 'shipped',
  em_rota: 'in_delivery',
  in_delivery: 'in_delivery',
  delivered: 'delivered',
  entregue: 'delivered',
  cancelled: null, // não rebaixa o pedido — só registra
  cancelado: null,
};

// O LogManager devolve o nosso idEnvio com um prefixo da conta dele
// (ex.: enviamos `HEMA-7BF6A127` e o webhook chega com
// `LM182291APHEMA-7BF6A127`). Extrai o trecho que nós geramos.
function extrairIdEnvio(valor: string): string | null {
  const match = valor.toUpperCase().match(/HEMA-[0-9A-F]{8}/);
  return match ? match[0] : null;
}

function centavos(reais: number | string): number {
  return Math.round(Number(reais) * 100);
}

function somenteDigitos(valor?: string | null): string {
  return (valor ?? '').replace(/\D/g, '');
}

function defaultDimensions(itemCount: number): {
  largura: number;
  altura: number;
  comprimento: number;
  peso: number;
} {
  const boxCm = Number(process.env.SHIPPING_DEFAULT_BOX_CM ?? 30);
  const baseWeightG = Number(process.env.SHIPPING_BASE_WEIGHT_G ?? 500);
  const unitWeightG = Number(process.env.SHIPPING_UNIT_WEIGHT_G ?? 300);
  return {
    largura: boxCm,
    altura: boxCm,
    comprimento: boxCm,
    peso: baseWeightG + unitWeightG * Math.max(itemCount, 1),
  };
}

export interface ShippingDispatchResult {
  ok: boolean;
  message: string;
  idEnvio?: string;
}

@Injectable()
export class ShippingService {
  private readonly logger = new Logger(ShippingService.name);

  constructor(
    private readonly logManager: LogManagerService,
    private readonly melhorEnvio: MelhorEnvioShipmentService,
  ) {}

  /** Melhor Envio tem credencial e CEP de origem configurados. */
  isMelhorEnvioConfigured(): boolean {
    return this.melhorEnvio.isConfigured();
  }

  /** Cotação Melhor Envio para entregas fora da área do motoboy. */
  quoteMelhorEnvio(
    postalCode: string,
    items: PackItem[],
    insuranceValue: number,
  ) {
    return this.melhorEnvio.quote(postalCode, items, insuranceValue);
  }

  /** Link público da etiqueta Melhor Envio do pedido. */
  labelUrl(orderId: string) {
    return this.melhorEnvio.labelUrl(orderId);
  }

  /**
   * Chamado depois que o pedido foi cancelado. Pedidos do Melhor Envio têm a
   * etiqueta cancelada para o valor voltar à carteira; os do motoboy seguem
   * como antes (sem chamada à LogManager).
   */
  async cancelForOrder(orderId: string, reason: string): Promise<void> {
    try {
      await this.melhorEnvio.cancelForOrder(orderId, reason);
    } catch (err: any) {
      this.logger.error(
        `Erro ao cancelar etiqueta do pedido ${orderId}: ${err?.message ?? err}`,
      );
    }
  }

  /**
   * Cria o envio do pedido na transportadora certa: Melhor Envio para
   * pedidos de fora da região do motoboy, LogManager para o resto.
   */
  async createForOrder(orderId: string): Promise<ShippingDispatchResult> {
    const { data: provider } = await supabase
      .from('orders')
      .select('shipping_provider')
      .eq('id', orderId)
      .maybeSingle();

    if (provider?.shipping_provider === 'melhor_envio') {
      try {
        const result = await this.melhorEnvio.createForOrder(orderId);
        return {
          ok: result.ok,
          message: result.message,
          idEnvio: result.meOrderId,
        };
      } catch (err: any) {
        const message = err?.message ?? 'Erro desconhecido.';
        this.logger.error(
          `Erro ao criar etiqueta Melhor Envio do pedido ${orderId}: ${message}`,
        );
        await supabase
          .from('orders')
          .update({ shipping_last_error: message })
          .eq('id', orderId);
        return { ok: false, message };
      }
    }

    return this.createLogManagerShipment(orderId);
  }

  /**
   * Idempotente: se o pedido já tem `logmanager_envio_id`, não dispara de novo.
   * Pickup orders (sem address_id) são ignorados.
   */
  private async createLogManagerShipment(
    orderId: string,
  ): Promise<ShippingDispatchResult> {
    if (!this.logManager.isConfigured()) {
      this.logger.warn(
        `Pulando envio para pedido ${orderId}: LogManager não configurado.`,
      );
      return {
        ok: false,
        message: 'Integração com a transportadora não está configurada.',
      };
    }

    try {
      const { data: order, error } = await supabase
        .from('orders')
        .select(
          `id, user_id, status, total_price, delivery_fee, payment_method,
           logmanager_envio_id,
           order_items ( id, product_id, product_name, product_price, quantity, weight, subtotal ),
           addresses ( street, number, complement, neighborhood, city, state, zip_code )`,
        )
        .eq('id', orderId)
        .single();

      if (error || !order) {
        this.logger.error(
          `Pedido ${orderId} não encontrado para envio: ${error?.message}`,
        );
        return { ok: false, message: 'Pedido não encontrado.' };
      }

      if (order.logmanager_envio_id) {
        this.logger.log(
          `Pedido ${orderId} já possui idEnvio ${order.logmanager_envio_id}, pulando.`,
        );
        return {
          ok: true,
          message: `Envio já criado anteriormente (${order.logmanager_envio_id}).`,
          idEnvio: order.logmanager_envio_id,
        };
      }

      if (!order.addresses) {
        this.logger.log(`Pedido ${orderId} é retirada na loja — sem envio.`);
        return {
          ok: false,
          message: 'Pedido é retirada na loja — não há envio a criar.',
        };
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('name, phone')
        .eq('id', order.user_id)
        .single();

      const address: any = order.addresses;
      const items: any[] = order.order_items ?? [];
      const dimensions = defaultDimensions(items.length);

      const itens: LogManagerItem[] = items.map((it) => ({
        quantidade: it.quantity ?? 1,
        descricao: it.product_name,
        dimensoes: dimensions,
      }));

      const idEnvio = `HEMA-${order.id.substring(0, 8).toUpperCase()}`;
      const phone = profile?.phone ?? '';

      // O LogManager rejeita (422) o envio sem telefone do comprador ou com CEP
      // inválido. Sem esta checagem o pedido ficava parado com o erro cru da
      // API na tela do admin, sem dizer o que fazer.
      const faltando: string[] = [];
      if (somenteDigitos(phone).length < 10) {
        faltando.push('telefone do cliente');
      }
      if (somenteDigitos(address.zip_code).length !== 8) {
        faltando.push('CEP do endereço');
      }

      if (faltando.length > 0) {
        const motivo =
          `Envio não criado: ${faltando.join(' e ')} ausente ou inválido. ` +
          'Atualize o cadastro do cliente e reenvie o pedido.';
        this.logger.warn(`Pedido ${orderId}: ${motivo}`);
        await supabase
          .from('orders')
          .update({ shipping_last_error: motivo })
          .eq('id', orderId);
        return { ok: false, message: motivo };
      }

      const now = new Date();
      const dtCriacao = `${now.toISOString().substring(0, 10)} ${now
        .toISOString()
        .substring(11, 19)}`;

      const payload: LogManagerShipmentPayload = {
        idEnvio,
        dtCriacao,
        vlFrete: centavos(order.delivery_fee ?? 0),
        vlPago: centavos(order.total_price ?? 0),
        nomeComprador: profile?.name ?? 'Cliente',
        telefoneComprador: phone,
        telefoneComprador_1: phone,
        idVenda: order.id,
        comentarios: `Pagamento: ${order.payment_method}`,
        chaveNFE: 'SEMNFE',
        numeroNFE: '0',
        serieNFE: '0',
        enderecoEntrega: address.street ?? '',
        enderecoEntregaNumero: address.number ?? '',
        enderecoEntregaComplemento: address.complement ?? '',
        cepEntrega: (address.zip_code ?? '').replace(/\D/g, ''),
        cidadeEntrega: address.city ?? '',
        estadoEntrega: address.state ?? '',
        bairroEntrega: address.neighborhood ?? '',
        itens,
      };

      const result = await this.logManager.createShipment(payload);

      // Guarda o que o LogManager respondeu, inclusive no sucesso: um envio
      // aceito pela API que não aparece no painel só é diagnosticável pelo
      // corpo da resposta.
      const lastResponse = {
        status: result.status,
        body: result.body,
        at: new Date().toISOString(),
      };

      if (result.ok) {
        await supabase
          .from('orders')
          .update({
            shipping_last_response: lastResponse,
            logmanager_envio_id: idEnvio,
            shipping_status: 'created',
            shipping_dispatched_at: new Date().toISOString(),
            shipping_last_error: null,
          })
          .eq('id', orderId);

        // O item saiu da loja: zera a reserva. O ERP refletirá a saída na
        // próxima rodada do sync (que sobrescreve products.stock).
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

        return {
          ok: true,
          message: `Envio criado na transportadora (${idEnvio}).`,
          idEnvio,
        };
      }

      const falha = `HTTP ${result.status}: ${JSON.stringify(result.body).substring(0, 500)}`;
      await supabase
        .from('orders')
        .update({
          shipping_last_error: falha,
          shipping_last_response: lastResponse,
        })
        .eq('id', orderId);

      return { ok: false, message: falha };
    } catch (err: any) {
      this.logger.error(
        `Erro ao criar envio para pedido ${orderId}: ${err?.message ?? err}`,
      );
      await supabase
        .from('orders')
        .update({ shipping_last_error: err?.message ?? 'unknown error' })
        .eq('id', orderId)
        .then(() => {});

      return { ok: false, message: err?.message ?? 'Erro desconhecido.' };
    }
  }

  /**
   * Reenvio manual, acionado pelo admin quando o envio falhou (telefone
   * ausente, transportadora fora do ar, CEP errado). Opcionalmente grava um
   * telefone no cadastro do cliente antes de tentar de novo — é o caso mais
   * comum de falha, e sem isso o admin teria que editar o perfil por fora.
   *
   * Idempotente: um pedido que já tem `logmanager_envio_id` não é duplicado.
   */
  async resendForOrder(
    orderId: string,
    phone?: string,
    nfeKey?: string,
  ): Promise<ShippingDispatchResult> {
    // Chave da NF-e: exigida pelo Melhor Envio em envio comercial.
    if (nfeKey !== undefined) {
      const key = somenteDigitos(nfeKey);
      if (key.length !== 44) {
        return {
          ok: false,
          message: 'Chave da NF-e inválida: precisa ter 44 dígitos.',
        };
      }
      const { error: nfeError } = await supabase
        .from('orders')
        .update({ nfe_key: key })
        .eq('id', orderId);
      if (nfeError) {
        return {
          ok: false,
          message: `Não foi possível salvar a chave da NF-e: ${nfeError.message}`,
        };
      }
    }

    if (phone !== undefined) {
      if (somenteDigitos(phone).length < 10) {
        return {
          ok: false,
          message: 'Telefone inválido: informe DDD + número.',
        };
      }

      const { data: order, error } = await supabase
        .from('orders')
        .select('user_id')
        .eq('id', orderId)
        .single();

      if (error || !order?.user_id) {
        return { ok: false, message: 'Pedido não encontrado.' };
      }

      const { error: profileError } = await supabase
        .from('profiles')
        .update({ phone })
        .eq('id', order.user_id);

      if (profileError) {
        this.logger.error(
          `Falha ao gravar telefone do cliente do pedido ${orderId}: ${profileError.message}`,
        );
        return {
          ok: false,
          message: `Não foi possível salvar o telefone: ${profileError.message}`,
        };
      }

      this.logger.log(`Telefone do cliente do pedido ${orderId} atualizado.`);
    }

    return this.createForOrder(orderId);
  }

  /**
   * Webhook handler — atualiza o shipping_status sempre e, quando o status
   * tem mapeamento significativo, também atualiza o `status` do pedido (e
   * dispara o Realtime que o cliente já escuta para notificações in-app).
   */
  async handleStatusWebhook(payload: any): Promise<void> {
    // Payload completo no log: ainda não sabemos com certeza quais nomes de
    // status o LogManager usa, e o STATUS_MAP precisa ser conferido contra eles.
    this.logger.log(
      `Webhook LogManager recebido: ${JSON.stringify(payload).substring(0, 2000)}`,
    );

    const rawOrderId: string | undefined = payload?.orderId;
    const carrierStatus: string | undefined = payload?.status;

    if (!rawOrderId || !carrierStatus) {
      this.logger.warn('Webhook LogManager ignorado — payload incompleto.');
      return;
    }

    const idEnvio = extrairIdEnvio(String(rawOrderId));
    if (!idEnvio) {
      this.logger.warn(
        `Webhook LogManager: orderId=${rawOrderId} não contém um idEnvio HEMA-.`,
      );
      return;
    }

    const { data: order, error } = await supabase
      .from('orders')
      .select('id, status, logmanager_envio_id')
      .eq('logmanager_envio_id', idEnvio)
      .single();

    if (error || !order) {
      this.logger.warn(
        `Webhook LogManager: pedido com idEnvio=${idEnvio} (recebido ${rawOrderId}) não encontrado.`,
      );
      return;
    }

    const normalized = String(carrierStatus).toLowerCase();
    const mappedOrderStatus = STATUS_MAP[normalized];

    const update: Record<string, any> = { shipping_status: normalized };
    if (advancesDelivery(order.status, mappedOrderStatus ?? null)) {
      update.status = mappedOrderStatus;
    }

    const { error: updateError } = await supabase
      .from('orders')
      .update(update)
      .eq('id', order.id);

    if (updateError) {
      this.logger.error(
        `Erro ao atualizar pedido ${order.id} via webhook: ${updateError.message}`,
      );
      return;
    }

    this.logger.log(
      `Webhook LogManager: pedido ${order.id} shipping_status=${normalized}${update.status ? ` status=${update.status}` : ''}`,
    );
  }
}
