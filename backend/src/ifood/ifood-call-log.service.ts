import { Injectable } from '@nestjs/common';

export type IfoodCallFlow =
  | 'auth'
  | 'ingestion-full'
  | 'ingestion-partial'
  | 'other';

export interface IfoodCallLogEntry {
  id: number;
  timestamp: string;
  flow: IfoodCallFlow;
  method: string;
  path: string;
  status: number;
  ok: boolean;
  durationMs: number;
  headers?: unknown;
  request?: unknown;
  response?: unknown;
}

const MAX_ENTRIES = 50;
const SEGREDOS = new Set(['clientSecret', 'refreshToken', 'accessToken']);

/**
 * Histórico em memória das chamadas feitas à Merchant-API, pra tela de
 * monitoramento em `/admin/ifood` — a homologação do Catalog exige
 * evidência em vídeo do front rodando de verdade, não Postman.
 * Não persiste: reinicia com o processo, o que é suficiente pra gravar
 * uma demonstração ao vivo.
 */
@Injectable()
export class IfoodCallLogService {
  private entries: IfoodCallLogEntry[] = [];
  private seq = 0;

  /** `Bearer eyJhbGc...3fA` — prova que o token foi anexado sem expor o valor inteiro na tela. */
  private maskAuthHeader(value: string): string {
    const match = /^Bearer\s+(.+)$/.exec(value);
    if (!match) return value;
    const token = match[1];
    if (token.length <= 18) return `Bearer ${token.slice(0, 4)}…`;
    return `Bearer ${token.slice(0, 12)}…${token.slice(-6)}`;
  }

  /** Mascara segredos e reduz arrays grandes (payload de até 500 itens por lote). */
  private summarize(value: unknown): unknown {
    if (value === undefined || value === null) return value;

    if (Array.isArray(value)) {
      const amostra = value.slice(0, 3).map((v) => this.summarize(v));
      return value.length > 3
        ? { total: value.length, amostra }
        : amostra;
    }

    if (typeof value === 'object') {
      const out: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
        if (SEGREDOS.has(key)) {
          out[key] = '••••••';
        } else if (key.toLowerCase() === 'authorization' && typeof val === 'string') {
          out[key] = this.maskAuthHeader(val);
        } else {
          out[key] = this.summarize(val);
        }
      }
      return out;
    }

    return value;
  }

  record(entry: Omit<IfoodCallLogEntry, 'id' | 'timestamp' | 'headers' | 'request' | 'response'> & {
    headers?: unknown;
    request?: unknown;
    response?: unknown;
  }): void {
    this.entries.unshift({
      ...entry,
      id: ++this.seq,
      timestamp: new Date().toISOString(),
      headers: this.summarize(entry.headers),
      request: this.summarize(entry.request),
      response: this.summarize(entry.response),
    });
    if (this.entries.length > MAX_ENTRIES) {
      this.entries.length = MAX_ENTRIES;
    }
  }

  list(): IfoodCallLogEntry[] {
    return this.entries;
  }

  clear(): void {
    this.entries = [];
  }
}
