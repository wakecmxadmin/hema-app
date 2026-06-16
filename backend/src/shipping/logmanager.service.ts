import { Injectable, Logger } from '@nestjs/common';

export interface LogManagerItemDimension {
  largura: number; // cm
  altura: number; // cm
  comprimento: number; // cm
  peso: number; // gramas
}

export interface LogManagerItem {
  quantidade: number;
  descricao: string;
  dimensoes: LogManagerItemDimension;
}

export interface LogManagerShipmentPayload {
  idEnvio: string;
  dtCriacao: string; // YYYY-MM-DD
  vlFrete: number; // integer (centavos)
  vlPago: number; // integer (centavos)
  nomeComprador: string;
  telefoneComprador: string;
  telefoneComprador_1: string;
  idVenda: string;
  comentarios: string;
  chaveNFE: string;
  numeroNFE: string;
  serieNFE: string;
  enderecoEntrega: string;
  enderecoEntregaNumero: string;
  enderecoEntregaComplemento: string;
  cepEntrega: string;
  cidadeEntrega: string;
  estadoEntrega: string;
  bairroEntrega: string;
  itens: LogManagerItem[];
}

export interface LogManagerCreateResult {
  ok: boolean;
  status: number;
  body: any;
}

@Injectable()
export class LogManagerService {
  private readonly logger = new Logger(LogManagerService.name);

  private get apiUrl(): string {
    return (
      process.env.LOGMANAGER_API_URL ?? 'https://app.logmanager.com.br'
    ).replace(/\/+$/, '');
  }

  private get apiToken(): string | undefined {
    return process.env.LOGMANAGER_API_TOKEN;
  }

  isConfigured(): boolean {
    return !!this.apiToken;
  }

  async createShipment(
    payload: LogManagerShipmentPayload,
  ): Promise<LogManagerCreateResult> {
    if (!this.apiToken) {
      this.logger.warn('LOGMANAGER_API_TOKEN ausente — envio não será criado.');
      return { ok: false, status: 0, body: { message: 'token ausente' } };
    }

    const url = `${this.apiUrl}/api/integrations/erp/callback`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiToken}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const body: any = await response.json().catch(() => ({}));

      if (!response.ok) {
        this.logger.error(
          `LogManager createShipment falhou (${response.status}): ${JSON.stringify(body)}`,
        );
      } else {
        this.logger.log(
          `LogManager envio criado: idEnvio=${payload.idEnvio} status=${response.status}`,
        );
      }

      return { ok: response.ok, status: response.status, body };
    } catch (err: any) {
      this.logger.error(`Falha de rede no LogManager: ${err?.message ?? err}`);
      return {
        ok: false,
        status: 0,
        body: { message: err?.message ?? 'network error' },
      };
    }
  }
}
