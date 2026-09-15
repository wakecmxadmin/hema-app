import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { IfoodApiService } from './ifood-api.service';

export interface IfoodEvent {
  id: string;
  code: string;
  fullCode: string;
  orderId?: string;
  createdAt: string;
  metadata?: Record<string, unknown>;
}

const POLL_INTERVAL_MS = 30_000;

/**
 * Heartbeat de conexão com o iFood. A validação `is-connected` do status da
 * loja fica em ERROR ("Gestor de Pedidos ou PDV desconectado") se o
 * integrador não faz polling de eventos com regularidade — com a loja
 * marcada como desconectada, ela some do app e o catálogo não é exibido
 * mesmo com a ingestão do Item API aceita (202).
 *
 * Não processamos pedidos ainda (isso fica pra depois): aqui só confirmamos
 * o recebimento de cada evento pra ele não voltar a ser entregue e pra
 * loja continuar marcada como conectada.
 */
@Injectable()
export class IfoodEventsService {
  private readonly logger = new Logger(IfoodEventsService.name);
  private polling = false;

  constructor(private readonly api: IfoodApiService) {}

  private get enabled(): boolean {
    return this.api.isConfigured() && !!this.api.merchantId;
  }

  /** Uma rodada de poll + acknowledge. Exposto à parte para o diagnóstico manual. */
  async pollOnce(): Promise<{ eventos: number; codigos: string[] }> {
    const response = await this.api.request<IfoodEvent[]>(
      '/events/v1.0/events:polling',
    );

    if (
      response.status === 204 ||
      !response.ok ||
      !Array.isArray(response.body)
    ) {
      return { eventos: 0, codigos: [] };
    }

    const events = response.body;
    if (events.length === 0) {
      return { eventos: 0, codigos: [] };
    }

    this.logger.log(
      `${events.length} evento(s) do iFood: ${events.map((e) => e.fullCode).join(', ')}`,
    );

    await this.api.request('/events/v1.0/events/acknowledgment', {
      method: 'POST',
      body: JSON.stringify(events.map((e) => ({ id: e.id }))),
    });

    return { eventos: events.length, codigos: events.map((e) => e.fullCode) };
  }

  @Interval(POLL_INTERVAL_MS)
  async scheduledPoll(): Promise<void> {
    if (!this.enabled || this.polling) return;
    this.polling = true;
    try {
      await this.pollOnce();
    } catch (err: any) {
      this.logger.error(`Falha no polling de eventos: ${err?.message ?? err}`);
    } finally {
      this.polling = false;
    }
  }
}
