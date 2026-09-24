import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { createHash } from 'crypto';
import { supabase } from '../lib/supabase';
import { IfoodApiService } from './ifood-api.service';
import { IfoodCatalogService } from './ifood-catalog.service';

const BATCH_SIZE = 500;
const PAGE_SIZE = 1000;

type Lote = 'novos' | 'alterados' | 'removidos';

interface StateRow {
  product_id: string;
  barcode: string;
  payload_hash: string;
}

/** Item pronto para envio: o payload e o que gravar no estado se o iFood aceitar. */
interface Envio {
  productId: string;
  barcode: string;
  payload: Record<string, unknown>;
  hash: string;
}

export interface ChangesResult {
  ok: boolean;
  dryRun: boolean;
  force: boolean;
  runId: string | null;
  total: number;
  novos: number;
  alterados: number;
  /** Itens desativados no iFood: produto sumiu, perdeu requisito ou trocou de código. */
  removidos: number;
  inalterados: number;
  ignorados: number;
  motivoIgnorados: Record<string, number>;
  enviados: number;
  lotes: number;
  falhas: { lote: number; tipo: Lote; status: number; body: any }[];
  /** Mensagem de erro que interrompeu a rodada antes de enviar. */
  erro?: string;
  /** Até 3 itens de cada tipo — pré-visualização do que vai (ou foi) enviado. */
  amostra: Partial<Record<Lote, any[]>>;
}

export interface SyncRun {
  id: string;
  trigger: 'cron' | 'manual';
  force: boolean;
  status: 'running' | 'success' | 'partial' | 'error' | 'empty';
  started_at: string;
  finished_at: string | null;
  total: number;
  novos: number;
  alterados: number;
  removidos: number;
  inalterados: number;
  ignorados: number;
  enviados: number;
  lotes: number;
  motivo_ignorados: Record<string, number>;
  falhas: ChangesResult['falhas'];
  error: string | null;
}

/**
 * Envio incremental do catálogo: só vai ao iFood o que mudou desde o último
 * envio aceito. Cargas grandes caem numa fila de baixa prioridade do iFood,
 * então depois da primeira carga (estado vazio = tudo é novo) cada rodada
 * manda só a diferença.
 *
 * A mudança é detectada pelo hash do payload — `products.updated_at` não
 * serve, porque o fluxo do n8n regrava em todo produto do lote.
 *
 *   novo      (sem estado)          -> POST ?reset=false, payload completo
 *   alterado  (hash diferente)      -> PATCH, payload completo
 *   removido  (tinha estado e não   -> PATCH { barcode, active: false }
 *              sobe mais, ou trocou
 *              de código)
 *
 * O estado só é gravado depois do 202 — lote que falha volta na próxima rodada.
 */
@Injectable()
export class IfoodSyncService {
  private readonly logger = new Logger(IfoodSyncService.name);

  constructor(
    private readonly api: IfoodApiService,
    private readonly catalog: IfoodCatalogService,
  ) {}

  private get syncEnabled(): boolean {
    return process.env.IFOOD_SYNC_ENABLED === 'true';
  }

  /** Mesma serialização do envio: o hash muda se e só se o body mudar. */
  hashPayload(payload: unknown): string {
    return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  }

  private async fetchState(merchantId: string): Promise<Map<string, StateRow>> {
    const state = new Map<string, StateRow>();

    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error } = await supabase
        .from('ifood_sync_state')
        .select('product_id, barcode, payload_hash')
        .eq('merchant_id', merchantId)
        .order('product_id', { ascending: true })
        .range(from, from + PAGE_SIZE - 1);

      // Falha de leitura não pode virar "estado vazio" — isso reenviaria o
      // catálogo inteiro como novo.
      if (error) throw new Error(`Falha ao ler ifood_sync_state: ${error.message}`);
      if (!data?.length) break;

      for (const row of data as StateRow[]) state.set(row.product_id, row);
      if (data.length < PAGE_SIZE) break;
    }

    return state;
  }

  /** Separa o catálogo atual em novos, alterados e removidos. */
  async plan(merchantId: string, force: boolean) {
    const [rows, state] = await Promise.all([
      this.catalog.fetchProducts(),
      this.fetchState(merchantId),
    ]);

    const novos: Envio[] = [];
    const alterados: Envio[] = [];
    const removidos: Envio[] = [];
    const motivoIgnorados: Record<string, number> = {};
    let ignorados = 0;
    let inalterados = 0;
    const vistos = new Set<string>();

    const ignorar = (motivo: string) => {
      ignorados++;
      motivoIgnorados[motivo] = (motivoIgnorados[motivo] ?? 0) + 1;
    };

    const desativar = (productId: string, barcode: string) => {
      const payload = { barcode, active: false };
      removidos.push({ productId, barcode, payload, hash: this.hashPayload(payload) });
    };

    for (const row of rows) {
      vistos.add(row.id);
      const anterior = state.get(row.id);

      // Inativo que nunca subiu não precisa ser criado no iFood — e conta
      // como inativo mesmo sem código/preço, pra não parecer erro de cadastro.
      if (row.is_active === false && !anterior) {
        ignorar('inativo');
        continue;
      }

      const mapped = this.catalog.toCatalogItem(row);

      if ('skip' in mapped) {
        ignorar(mapped.skip);
        // Já estava no iFood e deixou de atender os requisitos (perdeu
        // código, preço...): tira de venda em vez de deixar o valor antigo.
        if (anterior) desativar(row.id, anterior.barcode);
        continue;
      }

      const [payload] = this.catalog.toApiPayload([mapped]);
      const envio: Envio = {
        productId: row.id,
        barcode: mapped.externalCode,
        payload,
        hash: this.hashPayload(payload),
      };

      if (!anterior) {
        novos.push(envio);
      } else if (anterior.barcode !== envio.barcode) {
        // Código trocou: para o iFood é outro item. Desativa o antigo e cria o novo.
        desativar(row.id, anterior.barcode);
        novos.push(envio);
      } else if (force || anterior.payload_hash !== envio.hash) {
        alterados.push(envio);
      } else {
        inalterados++;
      }
    }

    // Produto apagado do banco depois de ter subido.
    for (const [productId, anterior] of state) {
      if (!vistos.has(productId)) desativar(productId, anterior.barcode);
    }

    return {
      total: rows.length,
      novos,
      alterados,
      removidos,
      inalterados,
      ignorados,
      motivoIgnorados,
    };
  }

  private async saveState(
    merchantId: string,
    runId: string,
    tipo: Lote,
    batch: Envio[],
  ): Promise<void> {
    const productIds = batch.map((e) => e.productId);

    if (tipo === 'removidos') {
      // Um produto que trocou de código aparece em "removidos" (código
      // antigo) e em "novos" (código novo). Só apaga o estado se ele ainda
      // aponta pro código desativado — o lote de novos roda depois e grava
      // o estado novo.
      for (const envio of batch) {
        const { error } = await supabase
          .from('ifood_sync_state')
          .delete()
          .eq('merchant_id', merchantId)
          .eq('product_id', envio.productId)
          .eq('barcode', envio.barcode);
        if (error) this.logger.error(`Falha ao limpar estado: ${error.message}`);
      }
      return;
    }

    const { error } = await supabase.from('ifood_sync_state').upsert(
      batch.map((e) => ({
        merchant_id: merchantId,
        product_id: e.productId,
        barcode: e.barcode,
        payload_hash: e.hash,
        payload: e.payload,
        last_sent_at: new Date().toISOString(),
        last_run_id: runId,
      })),
      { onConflict: 'merchant_id,product_id' },
    );

    // O iFood já aceitou: se o estado não gravar, a próxima rodada só
    // reenvia esses itens — nada se perde.
    if (error) {
      this.logger.error(
        `Falha ao gravar estado de ${productIds.length} itens: ${error.message}`,
      );
    }
  }

  private async startRun(
    merchantId: string,
    trigger: SyncRun['trigger'],
    force: boolean,
  ): Promise<string> {
    const { data, error } = await supabase
      .from('ifood_sync_runs')
      .insert({ merchant_id: merchantId, trigger, force, status: 'running' })
      .select('id')
      .single();

    if (error || !data) {
      throw new Error(`Falha ao registrar rodada: ${error?.message ?? 'sem id'}`);
    }
    return data.id;
  }

  private async finishRun(runId: string, result: ChangesResult): Promise<void> {
    const status: SyncRun['status'] = result.erro
      ? 'error'
      : result.lotes === 0
        ? 'empty'
        : result.falhas.length === 0
          ? 'success'
          : result.falhas.length < result.lotes
            ? 'partial'
            : 'error';

    const { error } = await supabase
      .from('ifood_sync_runs')
      .update({
        status,
        finished_at: new Date().toISOString(),
        total: result.total,
        novos: result.novos,
        alterados: result.alterados,
        removidos: result.removidos,
        inalterados: result.inalterados,
        ignorados: result.ignorados,
        enviados: result.enviados,
        lotes: result.lotes,
        motivo_ignorados: result.motivoIgnorados,
        falhas: result.falhas,
        error: result.erro ?? null,
      })
      .eq('id', runId);

    if (error) this.logger.error(`Falha ao fechar rodada ${runId}: ${error.message}`);
  }

  /**
   * `dryRun` calcula a diferença sem chamar o iFood e sem gravar nada.
   * `force` reenvia como alterado tudo que já subiu, ignorando o hash.
   */
  async syncChanges(
    options: { dryRun?: boolean; force?: boolean; trigger?: SyncRun['trigger'] } = {},
  ): Promise<ChangesResult> {
    const dryRun = options.dryRun ?? false;
    const force = options.force ?? false;
    const trigger = options.trigger ?? 'manual';
    const merchantId = this.api.merchantId;

    const result: ChangesResult = {
      ok: false,
      dryRun,
      force,
      runId: null,
      total: 0,
      novos: 0,
      alterados: 0,
      removidos: 0,
      inalterados: 0,
      ignorados: 0,
      motivoIgnorados: {},
      enviados: 0,
      lotes: 0,
      falhas: [],
      amostra: {},
    };

    if (!merchantId) {
      return { ...result, erro: 'IFOOD_MERCHANT_ID ausente.' };
    }
    if (!dryRun && !this.api.isConfigured()) {
      return { ...result, erro: 'Credenciais do iFood ausentes.' };
    }
    if (!this.catalog.acquire()) {
      return { ...result, erro: 'Já existe uma sincronização em andamento.' };
    }

    try {
      if (!dryRun) result.runId = await this.startRun(merchantId, trigger, force);

      const plano = await this.plan(merchantId, force);
      Object.assign(result, {
        total: plano.total,
        novos: plano.novos.length,
        alterados: plano.alterados.length,
        removidos: plano.removidos.length,
        inalterados: plano.inalterados,
        ignorados: plano.ignorados,
        motivoIgnorados: plano.motivoIgnorados,
      });

      // Removidos primeiro: um produto que trocou de código precisa ter o
      // estado antigo limpo antes do lote de novos gravar o estado novo.
      const filas: [Lote, Envio[], 'POST' | 'PATCH'][] = [
        ['removidos', plano.removidos, 'PATCH'],
        ['novos', plano.novos, 'POST'],
        ['alterados', plano.alterados, 'PATCH'],
      ];

      for (const [tipo, envios, method] of filas) {
        if (envios.length) result.amostra[tipo] = envios.slice(0, 3).map((e) => e.payload);

        for (let i = 0; i < envios.length; i += BATCH_SIZE) {
          const batch = envios.slice(i, i + BATCH_SIZE);
          result.lotes++;

          if (dryRun) {
            result.enviados += batch.length;
            continue;
          }

          const response = await this.api.request(
            this.catalog.ingestionPath(method === 'POST' ? 'post' : 'patch', false),
            { method, body: JSON.stringify(batch.map((e) => e.payload)) },
          );

          if (response.ok) {
            result.enviados += batch.length;
            await this.saveState(merchantId, result.runId!, tipo, batch);
          } else {
            result.falhas.push({
              lote: result.lotes,
              tipo,
              status: response.status,
              body: response.body,
            });
          }
        }
      }

      result.ok = result.falhas.length === 0;
    } catch (err) {
      result.erro = err instanceof Error ? err.message : String(err);
      this.logger.error(`Sync incremental interrompido: ${result.erro}`);
    } finally {
      this.catalog.release();
    }

    if (result.runId) await this.finishRun(result.runId, result);

    this.logger.log(
      `Sync incremental iFood${dryRun ? ' (dry-run)' : ''} [${trigger}]: ` +
        `${result.novos} novos, ${result.alterados} alterados, ${result.removidos} removidos, ` +
        `${result.inalterados} inalterados, ${result.falhas.length} lotes com falha.`,
    );

    return result;
  }

  async listRuns(limit = 20): Promise<SyncRun[]> {
    const merchantId = this.api.merchantId;
    if (!merchantId) return [];

    const { data, error } = await supabase
      .from('ifood_sync_runs')
      .select('*')
      .eq('merchant_id', merchantId)
      .order('started_at', { ascending: false })
      .limit(limit);

    if (error) {
      this.logger.error(`Falha ao ler ifood_sync_runs: ${error.message}`);
      return [];
    }
    return data as SyncRun[];
  }

  /**
   * A cada 30 min, nos minutos 15 e 45 — fora da virada de hora, quando o
   * fluxo do n8n começa a regravar os produtos.
   */
  @Cron('0 15,45 * * * *')
  async scheduledSync(): Promise<void> {
    if (!this.syncEnabled) return;
    await this.syncChanges({ trigger: 'cron' });
  }
}
