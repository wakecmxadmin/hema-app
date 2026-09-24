jest.mock('../lib/supabase', () => ({ supabase: {} }));

import { IfoodCatalogService } from './ifood-catalog.service';
import { IfoodSyncService } from './ifood-sync.service';

describe('IfoodSyncService — envio incremental', () => {
  const linha = (over: Partial<any> = {}) => ({
    id: 'p1',
    name: 'ARROZ BRANCO 5KG',
    description: 'Arroz tipo 1',
    image_url: 'https://cdn.hema/arroz.png',
    type: 'unit',
    price: 10,
    price_per_kg: null,
    stock: 42,
    codigo: 7891234567890,
    is_active: true,
    categories: { name: 'Cereais' },
    ...over,
  });

  let api: any;
  let catalog: IfoodCatalogService;
  let svc: IfoodSyncService;

  /** Estado como se o produto tivesse subido com o payload atual. */
  const estadoDe = (row: any) => {
    const item = catalog.toCatalogItem(row) as any;
    const [payload] = catalog.toApiPayload([item]);
    return {
      product_id: row.id,
      barcode: String(row.codigo),
      payload_hash: svc.hashPayload(payload),
    };
  };

  const setup = (rows: any[], state: any[] = []) => {
    jest.spyOn(catalog, 'fetchProducts').mockResolvedValue(rows);
    jest
      .spyOn(svc as any, 'fetchState')
      .mockResolvedValue(new Map(state.map((s) => [s.product_id, s])));
  };

  beforeEach(() => {
    process.env.IFOOD_PRICE_MARKUP = '1.12';
    api = {
      merchantId: 'm1',
      isConfigured: jest.fn().mockReturnValue(true),
      request: jest.fn().mockResolvedValue({ ok: true, status: 202, body: {} }),
    };
    catalog = new IfoodCatalogService(api);
    svc = new IfoodSyncService(api, catalog);
    jest.spyOn(svc as any, 'startRun').mockResolvedValue('run-1');
    jest.spyOn(svc as any, 'finishRun').mockResolvedValue(undefined);
    jest.spyOn(svc as any, 'saveState').mockResolvedValue(undefined);
  });

  describe('plan', () => {
    it('estado vazio: tudo é novo (primeira carga)', async () => {
      setup([linha(), linha({ id: 'p2', codigo: 7891000100103 })]);
      const plano = await svc.plan('m1', false);
      expect(plano.novos).toHaveLength(2);
      expect(plano.alterados).toHaveLength(0);
    });

    it('inativo que nunca subiu não é criado', async () => {
      setup([linha({ is_active: false })]);
      const plano = await svc.plan('m1', false);
      expect(plano.novos).toHaveLength(0);
      expect(plano.motivoIgnorados['inativo']).toBe(1);
    });

    it('inativo sem código conta como inativo, não como erro de cadastro', async () => {
      setup([linha({ is_active: false, codigo: null })]);
      const plano = await svc.plan('m1', false);
      expect(plano.motivoIgnorados).toEqual({ inativo: 1 });
    });

    it('mesmo payload: inalterado; preço diferente: alterado', async () => {
      const a = linha();
      const b = linha({ id: 'p2', codigo: 7891000100103 });
      setup([a, { ...b, price: 20 }], [estadoDe(a), estadoDe(b)]);
      const plano = await svc.plan('m1', false);
      expect(plano.inalterados).toBe(1);
      expect(plano.alterados.map((e) => e.productId)).toEqual(['p2']);
    });

    it('force reenvia o que não mudou', async () => {
      const a = linha();
      setup([a], [estadoDe(a)]);
      const plano = await svc.plan('m1', true);
      expect(plano.alterados).toHaveLength(1);
    });

    it('produto que ficou inativo vai como alterado com active:false', async () => {
      const a = linha();
      setup([{ ...a, is_active: false }], [estadoDe(a)]);
      const plano = await svc.plan('m1', false);
      expect(plano.alterados[0].payload.active).toBe(false);
    });

    it('troca de código: desativa o antigo e cria o novo', async () => {
      const a = linha();
      setup([{ ...a, codigo: 7891000100103 }], [estadoDe(a)]);
      const plano = await svc.plan('m1', false);
      expect(plano.removidos[0].payload).toEqual({
        barcode: '7891234567890',
        active: false,
      });
      expect(plano.novos[0].barcode).toBe('7891000100103');
    });

    it('produto que perdeu requisito (sem preço) é desativado', async () => {
      const a = linha();
      setup([{ ...a, price: 0 }], [estadoDe(a)]);
      const plano = await svc.plan('m1', false);
      expect(plano.removidos).toHaveLength(1);
      expect(plano.motivoIgnorados['sem preco']).toBe(1);
    });

    it('produto apagado do banco é desativado', async () => {
      setup([], [estadoDe(linha())]);
      const plano = await svc.plan('m1', false);
      expect(plano.removidos.map((e) => e.productId)).toEqual(['p1']);
    });
  });

  describe('syncChanges', () => {
    it('novos vão por POST ?reset=false, alterados por PATCH', async () => {
      const a = linha();
      const b = linha({ id: 'p2', codigo: 7891000100103 });
      setup([{ ...a, price: 20 }, b], [estadoDe(a)]);

      const r = await svc.syncChanges();

      expect(r.ok).toBe(true);
      expect(api.request).toHaveBeenCalledWith(
        '/item/v1.0/ingestion/m1?reset=false',
        expect.objectContaining({ method: 'POST' }),
      );
      expect(api.request).toHaveBeenCalledWith(
        '/item/v1.0/ingestion/m1',
        expect.objectContaining({ method: 'PATCH' }),
      );
      expect((svc as any).saveState).toHaveBeenCalledTimes(2);
    });

    it('lote recusado não grava estado — volta na próxima rodada', async () => {
      api.request.mockResolvedValue({ ok: false, status: 400, body: { erro: 'x' } });
      setup([linha()]);

      const r = await svc.syncChanges();

      expect(r.ok).toBe(false);
      expect(r.falhas).toEqual([{ lote: 1, tipo: 'novos', status: 400, body: { erro: 'x' } }]);
      expect((svc as any).saveState).not.toHaveBeenCalled();
    });

    it('nada mudou: nenhuma chamada ao iFood', async () => {
      const a = linha();
      setup([a], [estadoDe(a)]);
      const r = await svc.syncChanges();
      expect(r.lotes).toBe(0);
      expect(api.request).not.toHaveBeenCalled();
    });

    it('falha ao ler o estado interrompe — não reenvia tudo como novo', async () => {
      jest.spyOn(catalog, 'fetchProducts').mockResolvedValue([linha()]);
      jest
        .spyOn(svc as any, 'fetchState')
        .mockRejectedValue(new Error('Falha ao ler ifood_sync_state: boom'));

      const r = await svc.syncChanges();

      expect(r.erro).toContain('boom');
      expect(api.request).not.toHaveBeenCalled();
      expect((svc as any).finishRun).toHaveBeenCalled();
    });

    it('dry-run não chama o iFood nem registra rodada', async () => {
      setup([linha()]);
      const r = await svc.syncChanges({ dryRun: true });
      expect(r.novos).toBe(1);
      expect(r.amostra.novos).toHaveLength(1);
      expect(api.request).not.toHaveBeenCalled();
      expect((svc as any).startRun).not.toHaveBeenCalled();
    });

    it('não roda em paralelo com outra carga', async () => {
      setup([linha()]);
      catalog.acquire();
      const r = await svc.syncChanges();
      expect(r.erro).toMatch(/andamento/);
      expect(api.request).not.toHaveBeenCalled();
    });
  });
});
