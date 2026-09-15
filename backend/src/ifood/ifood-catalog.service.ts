import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { supabase } from '../lib/supabase';
import {
  IfoodApiService,
  IfoodCatalog,
  IfoodSellableItem,
} from './ifood-api.service';

interface ProductRow {
  id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  type: 'unit' | 'weight' | string;
  price: number | null;
  price_per_kg: number | null;
  stock: number | null;
  codigo: number | null;
  is_active: boolean | null;
  categories?: { name: string | null } | { name: string | null }[] | null;
}

/**
 * Item no formato conceitual do catálogo de Groceries.
 * O contrato final da Merchant-API é aplicado em `toApiPayload` — é o único
 * ponto a ajustar caso o iFood peça outro shape na homologação.
 */
export interface IfoodCatalogItem {
  /** EAN ou código interno de balança (coluna `codigo`). */
  externalCode: string;
  name: string;
  /** Preço já com markup e arredondamento. Para granel, é o preço de 1 kg. */
  price: number;
  /** Em unidades para `unit`, em kg para `weight`. */
  stock: number;
  active: boolean;
  /** UN ou KG — determina se o iFood trata o item como pesável. */
  unit: 'UN' | 'KG';
  /** Código interno de balança; vazio quando o `codigo` é um EAN de verdade. */
  plu?: string;
  imageUrl?: string;
  description?: string;
  /** Nome da categoria da Hema. A base é plana: não há departamento nem subcategoria. */
  category?: string;
}

export interface CatalogVerification {
  ok: boolean;
  catalogs: IfoodCatalog[];
  sellableCount: number;
  unsellableCount: number;
  /** Até 10 itens reais, pra conferir nome/descrição/preço/imagem sem baixar o catálogo inteiro. */
  amostraSellable: IfoodSellableItem[];
  unsellable: { produtoId: string; motivo: string[] }[];
}

export interface SyncResult {
  ok: boolean;
  total: number;
  enviados: number;
  ignorados: number;
  motivoIgnorados: Record<string, number>;
  lotes: number;
  modo: 'patch' | 'post';
  falhas: { lote: number; status: number; body: any }[];
  dryRun: boolean;
}

const BATCH_SIZE = 500;

@Injectable()
export class IfoodCatalogService {
  private readonly logger = new Logger(IfoodCatalogService.name);
  private running = false;

  constructor(private readonly api: IfoodApiService) {}

  private get markup(): number {
    return Number(process.env.IFOOD_PRICE_MARKUP) || 1.12;
  }

  /** Envia `scalePrices` nos itens a granel. Desligado até validar na homologação. */
  private get scalePricesEnabled(): boolean {
    return process.env.IFOOD_SCALE_PRICES === 'true';
  }

  private get syncEnabled(): boolean {
    return process.env.IFOOD_SYNC_ENABLED === 'true';
  }

  /** Nenhum item sobe abaixo disto — o iFood não aceita preço zero. */
  private readonly precoMinimo = 1;

  /**
   * Regra combinada com o iFood na carga inicial por planilha:
   * acrescenta o markup e arredonda para baixo até o real inteiro
   * (12,12 -> 12,00). Mantida aqui para o catálogo não divergir.
   *
   * Exceção: itens de centavos zerariam no arredondamento (R$ 0,27 -> R$ 0),
   * e item grátis no iFood é pedido perdido. Esses sobem pelo piso de R$ 1
   * em vez de serem descartados.
   */
  priceForIfood(base: number): number {
    return Math.max(this.precoMinimo, Math.floor(base * this.markup));
  }

  /**
   * Valida e converte uma linha de `products`. Todo motivo de descarte é
   * nomeado para virar contagem no relatório de sync — o analista do iFood
   * pede justificativa para item que não sobe.
   */
  toCatalogItem(row: ProductRow): IfoodCatalogItem | { skip: string } {
    if (row.codigo === null || row.codigo === undefined) {
      return { skip: 'sem codigo' };
    }
    if (!Number.isFinite(Number(row.codigo)) || Number(row.codigo) <= 0) {
      return { skip: 'codigo invalido' };
    }

    const name = (row.name ?? '').trim();
    if (!name) {
      return { skip: 'sem nome' };
    }

    if (row.type !== 'unit' && row.type !== 'weight') {
      return { skip: 'tipo desconhecido' };
    }

    const isWeight = row.type === 'weight';
    const base = Number(isWeight ? row.price_per_kg : row.price);

    if (!Number.isFinite(base) || base <= 0) {
      return { skip: 'sem preco' };
    }

    const price = this.priceForIfood(base);

    const stock = Number(row.stock ?? 0);
    if (!Number.isFinite(stock)) {
      return { skip: 'estoque invalido' };
    }

    const codigo = String(row.codigo);
    // EAN tem 8, 12, 13 ou 14 dígitos. Códigos curtos são de balança e vão
    // também em `plu`, que é o campo de código interno do iFood.
    const isEan = [8, 12, 13, 14].includes(codigo.length);

    return {
      externalCode: codigo,
      plu: isEan ? undefined : codigo,
      imageUrl: row.image_url ?? undefined,
      description: row.description ?? undefined,
      category: this.categoryName(row) || undefined,
      name,
      price,
      // Estoque zero ou negativo é enviado de propósito: a doc de mercado
      // orienta transmitir a ruptura em vez de omitir o item, senão o
      // iFood segue vendendo e o pedido acaba cancelado.
      stock,
      active: row.is_active !== false,
      unit: isWeight ? 'KG' : 'UN',
    };
  }

  /** O join do supabase-js pode vir como objeto ou array — normaliza. */
  private categoryName(row: ProductRow): string | undefined {
    const rel = row.categories;
    const first = Array.isArray(rel) ? rel[0] : rel;
    return first?.name?.trim() || undefined;
  }

  private async fetchProducts(): Promise<ProductRow[]> {
    const pageSize = 1000;
    const rows: ProductRow[] = [];

    for (let from = 0; ; from += pageSize) {
      const { data, error } = await supabase
        .from('products')
        .select(
          'id, name, description, image_url, type, price, price_per_kg, stock, codigo, is_active, categories(name)',
        )
        .order('id', { ascending: true })
        .range(from, from + pageSize - 1);

      if (error) {
        this.logger.error(`Falha ao ler products: ${error.message}`);
        break;
      }
      if (!data?.length) break;

      rows.push(...(data as ProductRow[]));
      if (data.length < pageSize) break;
    }

    return rows;
  }

  /**
   * Rota de ingestão do módulo Item (Groceries), confirmada contra a loja de
   * teste em 31/08/2026:
   *
   *   POST  /item/v1.0/ingestion/{merchantId}?reset={bool}  carga completa
   *   PATCH /item/v1.0/ingestion/{merchantId}               atualização parcial
   *
   * A sincronização periódica usa PATCH: mexe em preço e estoque sem
   * arriscar apagar o catálogo. O POST com `reset=true` substitui o catálogo
   * inteiro e só deve ser usado em carga inicial.
   */
  private ingestionPath(mode: 'patch' | 'post', reset = false): string {
    const base = `/item/v1.0/ingestion/${this.api.merchantId}`;
    return mode === 'post' && reset ? `${base}?reset=true` : base;
  }

  /**
   * Corpo do `ItemIntegrationRequest` — array na raiz, um objeto por produto.
   * O merchantId vai na URL, não no corpo.
   *
   * `fields: 'price-stock'` manda só `barcode` + `prices` + `inventory` —
   * é o cenário "Atualização parcial" da homologação: só os campos enviados
   * são alterados (JSON Merge Patch), o resto do item no iFood não é
   * tocado. Serve pra sync de rotina (preço/estoque mudam a toda hora,
   * nome/imagem/categoria não) sem reenviar o objeto inteiro.
   */
  private toApiPayload(
    items: IfoodCatalogItem[],
    fields: 'full' | 'price-stock' = 'full',
  ) {
    if (fields === 'price-stock') {
      return items.map((item) => ({
        barcode: item.externalCode,
        prices: { price: item.price },
        inventory: { stock: item.stock },
      }));
    }

    return items.map((item) => ({
      barcode: item.externalCode,
      name: item.name,
      ...(item.plu ? { plu: item.plu } : {}),
      active: item.active,
      details: {
        unit: item.unit,
        ...(item.imageUrl ? { imageUrl: item.imageUrl } : {}),
        ...(item.description ? { description: item.description } : {}),
        // Só `category`: a base da Hema é plana, e inventar department/
        // subCategory seria dado falso. Nenhum dos três é obrigatório.
        ...(item.category
          ? { categorization: { category: item.category } }
          : {}),
      },
      prices: {
        price: item.price,
      },
      // Preço por balança. A semântica de `quantity` é ambígua na referência
      // ("quantidade para o preço ser aplicado"): mandamos 1, casando com
      // details.unit = KG, ou seja, o preço de 1 kg. Confirmar na homologação.
      ...(item.unit === 'KG' && this.scalePricesEnabled
        ? { scalePrices: [{ price: item.price, quantity: 1 }] }
        : {}),
      inventory: {
        stock: item.stock,
      },
      channels: ['ifood-app'],
    }));
  }

  async sync(
    options: {
      dryRun?: boolean;
      mode?: 'patch' | 'post';
      reset?: boolean;
      fields?: 'full' | 'price-stock';
    } = {},
  ): Promise<SyncResult> {
    const dryRun = options.dryRun ?? false;
    const fields = options.fields ?? 'full';
    // price-stock é sempre PATCH (merge parcial) — POST+reset com payload
    // reduzido apagaria nome/imagem/categoria do catálogo inteiro.
    const mode = fields === 'price-stock' ? 'patch' : (options.mode ?? 'patch');
    const reset = fields === 'price-stock' ? false : (options.reset ?? false);

    const result: SyncResult = {
      ok: true,
      total: 0,
      enviados: 0,
      ignorados: 0,
      motivoIgnorados: {},
      lotes: 0,
      modo: mode,
      falhas: [],
      dryRun,
    };

    if (!dryRun && !this.api.isConfigured()) {
      this.logger.warn('Credenciais do iFood ausentes — sync não executado.');
      return { ...result, ok: false };
    }

    if (!dryRun && !this.api.merchantId) {
      this.logger.warn('IFOOD_MERCHANT_ID ausente — sync não executado.');
      return { ...result, ok: false };
    }

    if (this.running) {
      this.logger.warn('Sync já em andamento — chamada ignorada.');
      return { ...result, ok: false };
    }
    this.running = true;

    try {
      const rows = await this.fetchProducts();
      result.total = rows.length;

      const items: IfoodCatalogItem[] = [];
      for (const row of rows) {
        const mapped = this.toCatalogItem(row);
        if ('skip' in mapped) {
          result.ignorados++;
          result.motivoIgnorados[mapped.skip] =
            (result.motivoIgnorados[mapped.skip] ?? 0) + 1;
          continue;
        }
        items.push(mapped);
      }

      for (let i = 0; i < items.length; i += BATCH_SIZE) {
        const batch = items.slice(i, i + BATCH_SIZE);
        const loteNum = result.lotes + 1;
        result.lotes = loteNum;

        if (dryRun) {
          result.enviados += batch.length;
          continue;
        }

        const response = await this.api.request(
          this.ingestionPath(mode, reset),
          {
            method: mode === 'post' ? 'POST' : 'PATCH',
            body: JSON.stringify(this.toApiPayload(batch, fields)),
          },
        );

        if (response.ok) {
          result.enviados += batch.length;
        } else {
          result.ok = false;
          result.falhas.push({
            lote: loteNum,
            status: response.status,
            body: response.body,
          });
        }
      }

      this.logger.log(
        `Sync iFood${dryRun ? ' (dry-run)' : ''}: ${result.enviados}/${result.total} enviados, ` +
          `${result.ignorados} ignorados, ${result.falhas.length} lotes com falha.`,
      );

      return result;
    } finally {
      this.running = false;
    }
  }

  /**
   * Confere o que o iFood realmente gravou depois de um `sync` — o Item API
   * não tem rota de status, então isso substitui olhar o Portal do Parceiro
   * na mão. É também a evidência (nome, imagem, descrição, valor) que a
   * homologação manual do catálogo pede.
   */
  async verify(): Promise<CatalogVerification> {
    const result: CatalogVerification = {
      ok: false,
      catalogs: [],
      sellableCount: 0,
      unsellableCount: 0,
      amostraSellable: [],
      unsellable: [],
    };

    const statusRes = await this.api.getMerchantStatus();
    this.logger.log(
      `Verify: status da loja -> ${JSON.stringify(statusRes.body)}`,
    );

    this.logger.log('Verify: consultando /catalogs...');
    const catalogsRes = await this.api.listCatalogs();
    this.logger.log(
      `Verify: /catalogs -> ${catalogsRes.status} ${JSON.stringify(catalogsRes.body)}`,
    );
    if (!catalogsRes.ok) return result;
    result.catalogs = catalogsRes.body;

    for (const catalog of catalogsRes.body) {
      const [sellableRes, unsellableRes] = await Promise.all([
        this.api.listSellableItems(catalog.groupId),
        this.api.listUnsellableItems(catalog.catalogId),
      ]);
      this.logger.log(
        `Verify: catalog ${catalog.catalogId} (groupId=${catalog.groupId}) -> ` +
          `sellableItems ${sellableRes.status} (${Array.isArray(sellableRes.body) ? sellableRes.body.length : 'n/a'} itens), ` +
          `unsellableItems ${unsellableRes.status}`,
      );

      if (sellableRes.ok) {
        result.sellableCount += sellableRes.body.length;
        result.amostraSellable.push(...sellableRes.body);
      }

      if (unsellableRes.ok) {
        for (const categoria of unsellableRes.body.categories ?? []) {
          for (const item of categoria.unsellableItems ?? []) {
            result.unsellableCount++;
            result.unsellable.push({
              produtoId: item.productId,
              motivo: item.restrictions,
            });
          }
        }
      }
    }

    result.amostraSellable = result.amostraSellable.slice(0, 10);
    result.ok = true;
    return result;
  }

  /** Sincronização automática de hora em hora, se habilitada no .env. */
  @Cron(CronExpression.EVERY_HOUR)
  async scheduledSync(): Promise<void> {
    if (!this.syncEnabled) return;
    await this.sync();
  }
}
