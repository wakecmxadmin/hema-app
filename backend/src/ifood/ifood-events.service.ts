import { Injectable, Logger } from '@nestjs/common';
import { IfoodApiService } from './ifood-api.service';

export interface IfoodEvent {
  id: string;
  code: string;
  fullCode: string;
  orderId?: string;
  createdAt: string;
  metadata?: Record<string, unknown>;
}

/**
 * Polling de eventos (pedidos) do iFood — **sem agendamento automático**.
 *
 * O módulo Order não está liberado para esta aplicação no Portal do
 * Desenvolvedor: `/events/v1.0/events:polling` responde 403 ("user is
 * forbidden to access this resource") com o mesmo token que faz a ingestão
 * do Item API dar 202. Rodava a cada 30s e só produzia erro em log.
 *
 * A integração é de catálogo: os pedidos do iFood não chegam por aqui. Se um
 * dia o módulo Order for liberado, `pollOnce` continua pronto e exposto em
 * `POST /ifood/events/poll` — basta voltar a agendá-lo com `@Interval`.
 */
@Injectable()
export class IfoodEventsService {
  private readonly logger = new Logger(IfoodEventsService.name);

  constructor(private readonly api: IfoodApiService) {}

  /** Uma rodada de poll + acknowledge. Só roda quando chamada na mão. */
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
}
