import { IfoodCatalogService } from './ifood-catalog.service';
import { IfoodApiService } from './ifood-api.service';

describe('IfoodCatalogService — mapeamento e regras de preço', () => {
  let service: IfoodCatalogService;

  const linha = (over: Partial<any> = {}) => ({
    id: 'uuid-1',
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

  beforeEach(() => {
    process.env.IFOOD_PRICE_MARKUP = '1.12';
    service = new IfoodCatalogService({} as IfoodApiService);
  });

  describe('preço: +12% e arredondamento para baixo', () => {
    it.each([
      [10.0, 11], // 11,20 -> 11
      [4.9, 5], // 5,488 -> 5  (SAL MARINHO, conferido na planilha)
      [12.12, 13], // 13,57 -> 13
      [100.0, 112], // 112,00 exato
      [1.0, 1], // 1,12 -> 1
    ])('R$ %s vira R$ %s', (base, esperado) => {
      expect(service.priceForIfood(base)).toBe(esperado);
    });

    it('nunca arredonda para cima acima do piso', () => {
      for (let base = 1; base < 200; base += 0.37) {
        expect(service.priceForIfood(base)).toBeLessThanOrEqual(base * 1.12);
      }
    });

    // Os 5 itens de centavos do catálogo zeravam no arredondamento e eram
    // descartados. Sobem por R$ 1 — item grátis no iFood é pedido perdido.
    it.each([
      [0.27, 1], // BRINDE CARTELA PREMIADA
      [0.55, 1], // CHICLE DIPLOKO MONSTERS
      [0.8, 1], // PAÇOQUITA UNIDADE
      [0.01, 1],
    ])('R$ %s sobe pelo piso de R$ %s', (base, esperado) => {
      expect(service.priceForIfood(base)).toBe(esperado);
    });
  });

  describe('itens unitários', () => {
    it('mapeia com unidade UN e código como externalCode', () => {
      const item = service.toCatalogItem(linha()) as any;
      expect(item).toMatchObject({
        externalCode: '7891234567890',
        name: 'ARROZ BRANCO 5KG',
        price: 11,
        stock: 42,
        active: true,
        unit: 'UN',
      });
    });
  });

  describe('itens a granel', () => {
    it('usa price_per_kg e marca unidade KG', () => {
      const item = service.toCatalogItem(
        linha({ type: 'weight', price: null, price_per_kg: 4.9, codigo: 457 }),
      ) as any;
      expect(item.unit).toBe('KG');
      expect(item.price).toBe(5);
      expect(item.externalCode).toBe('457');
    });
  });

  describe('estoque', () => {
    it('envia estoque zerado em vez de omitir (evita ruptura e cancelamento)', () => {
      const item = service.toCatalogItem(linha({ stock: 0 })) as any;
      expect(item.stock).toBe(0);
      expect('skip' in item).toBe(false);
    });

    it('trata estoque nulo como zero', () => {
      const item = service.toCatalogItem(linha({ stock: null })) as any;
      expect(item.stock).toBe(0);
    });
  });

  describe('validação — motivos de descarte', () => {
    it.each([
      ['sem codigo', { codigo: null }],
      ['codigo invalido', { codigo: 0 }],
      ['sem nome', { name: '   ' }],
      ['tipo desconhecido', { type: 'combo' }],
      ['sem preco', { price: 0 }],
      ['sem preco', { price: null }],
    ])('descarta com motivo "%s"', (motivo, over) => {
      expect(service.toCatalogItem(linha(over))).toEqual({ skip: motivo });
    });
  });

  describe('piso de preço', () => {
    it('item de centavos sobe por R$ 1 em vez de ser descartado', () => {
      const item = service.toCatalogItem(linha({ price: 0.27 })) as any;
      expect('skip' in item).toBe(false);
      expect(item.price).toBe(1);
    });
  });

  describe('plu — código de balança x EAN', () => {
    it('EAN de 13 dígitos não vira plu', () => {
      const item = service.toCatalogItem(linha()) as any;
      expect(item.plu).toBeUndefined();
    });

    it('código curto de balança também vai em plu', () => {
      const item = service.toCatalogItem(linha({ codigo: 457 })) as any;
      expect(item.plu).toBe('457');
      expect(item.externalCode).toBe('457');
    });
  });

  describe('payload no schema ItemIntegrationRequest', () => {
    const payload = (over: any = {}) => {
      const item = service.toCatalogItem(linha(over)) as any;
      return (service as any).toApiPayload([item])[0];
    };

    it('monta o objeto aninhado esperado pelo iFood', () => {
      expect(payload()).toEqual({
        barcode: '7891234567890',
        name: 'ARROZ BRANCO 5KG',
        active: true,
        details: {
          unit: 'UN',
          imageUrl: 'https://cdn.hema/arroz.png',
          description: 'Arroz tipo 1',
          categorization: { category: 'Cereais' },
        },
        prices: { price: 11 },
        inventory: { stock: 42 },
        channels: ['ifood-app'],
      });
    });

    it('granel vai com unidade KG', () => {
      const p = payload({
        type: 'weight',
        price: null,
        price_per_kg: 4.9,
        codigo: 457,
      });
      expect(p.details.unit).toBe('KG');
      expect(p.prices.price).toBe(5);
      expect(p.plu).toBe('457');
    });

    it('omite campos opcionais vazios em vez de mandar null', () => {
      const p = payload({
        image_url: null,
        description: null,
        categories: null,
      });
      expect(p.details).toEqual({ unit: 'UN' });
      expect('plu' in p).toBe(false);
    });

    it('aceita a categoria vinda como array do supabase-js', () => {
      const p = payload({ categories: [{ name: 'Temperos' }] });
      expect(p.details.categorization).toEqual({ category: 'Temperos' });
    });

    it('não envia scalePrices enquanto a flag estiver desligada', () => {
      const p = payload({ type: 'weight', price: null, price_per_kg: 4.9 });
      expect('scalePrices' in p).toBe(false);
    });

    it('com a flag ligada, granel leva scalePrices de 1 kg', () => {
      process.env.IFOOD_SCALE_PRICES = 'true';
      const p = payload({ type: 'weight', price: null, price_per_kg: 4.9 });
      expect(p.scalePrices).toEqual([{ price: 5, quantity: 1 }]);
      delete process.env.IFOOD_SCALE_PRICES;
    });

    it('item unitário nunca leva scalePrices', () => {
      process.env.IFOOD_SCALE_PRICES = 'true';
      expect('scalePrices' in payload()).toBe(false);
      delete process.env.IFOOD_SCALE_PRICES;
    });

    it('produto inativo mantém active=false no payload', () => {
      expect(payload({ is_active: false }).active).toBe(false);
    });
  });

  describe('payload parcial — fields: "price-stock"', () => {
    it('manda só barcode, prices e inventory', () => {
      const item = service.toCatalogItem(linha()) as any;
      const p = (service as any).toApiPayload([item], 'price-stock')[0];

      expect(p).toEqual({
        barcode: '7891234567890',
        prices: { price: 11 },
        inventory: { stock: 42 },
      });
    });

    it('não inclui name, details, active nem channels', () => {
      const item = service.toCatalogItem(linha()) as any;
      const p = (service as any).toApiPayload([item], 'price-stock')[0];

      expect(p).not.toHaveProperty('name');
      expect(p).not.toHaveProperty('details');
      expect(p).not.toHaveProperty('active');
      expect(p).not.toHaveProperty('channels');
    });
  });

  describe('sync com fields: "price-stock" força PATCH sem reset', () => {
    it('ignora mode:post e reset:true quando fields é price-stock', async () => {
      const api = {
        isConfigured: jest.fn().mockReturnValue(true),
        merchantId: 'merchant-1',
        request: jest
          .fn()
          .mockResolvedValue({ ok: true, status: 202, body: {} }),
      } as any;
      const svc = new IfoodCatalogService(api);
      jest.spyOn(svc as any, 'fetchProducts').mockResolvedValue([linha()]);

      await svc.sync({ fields: 'price-stock', mode: 'post', reset: true });

      expect(api.request).toHaveBeenCalledWith(
        '/item/v1.0/ingestion/merchant-1',
        expect.objectContaining({ method: 'PATCH' }),
      );
    });
  });

  describe('status', () => {
    it('produto inativo sobe como indisponível, não some do catálogo', () => {
      const item = service.toCatalogItem(linha({ is_active: false })) as any;
      expect(item.active).toBe(false);
    });
  });

  describe('verify — conferência do catálogo já gravado no iFood', () => {
    let api: jest.Mocked<IfoodApiService>;

    const catalogo = (over: Partial<any> = {}) => ({
      catalogId: 'catalog-1',
      status: 'AVAILABLE',
      context: ['DEFAULT'],
      modifiedAt: '2026-09-14T00:00:00Z',
      groupId: 'group-1',
      ...over,
    });

    beforeEach(() => {
      api = {
        listCatalogs: jest.fn(),
        listSellableItems: jest.fn(),
        listUnsellableItems: jest.fn(),
        getMerchantStatus: jest
          .fn()
          .mockResolvedValue({ ok: true, status: 200, body: [] }),
      } as any;
      service = new IfoodCatalogService(api);
    });

    it('agrega vendáveis e rejeitados de todos os catálogos', async () => {
      api.listCatalogs.mockResolvedValue({
        ok: true,
        status: 200,
        body: [catalogo()],
      });
      api.listSellableItems.mockResolvedValue({
        ok: true,
        status: 200,
        body: [
          {
            itemId: 'i1',
            categoryId: 'c1',
            categoryName: 'Cereais',
            itemName: 'ARROZ',
          },
        ],
      });
      api.listUnsellableItems.mockResolvedValue({
        ok: true,
        status: 200,
        body: {
          categories: [
            {
              id: 'c1',
              status: 'string',
              restrictions: [],
              unsellableItems: [
                { id: 'u1', productId: 'p1', restrictions: ['ITEM_PAUSED'] },
              ],
            },
          ],
        },
      });

      const result = await service.verify();

      expect(result.ok).toBe(true);
      expect(api.listSellableItems).toHaveBeenCalledWith('group-1');
      expect(api.listUnsellableItems).toHaveBeenCalledWith('catalog-1');
      expect(result.sellableCount).toBe(1);
      expect(result.amostraSellable).toEqual([
        {
          itemId: 'i1',
          categoryId: 'c1',
          categoryName: 'Cereais',
          itemName: 'ARROZ',
        },
      ]);
      expect(result.unsellableCount).toBe(1);
      expect(result.unsellable).toEqual([
        { produtoId: 'p1', motivo: ['ITEM_PAUSED'] },
      ]);
    });

    it('devolve ok=false sem chamar os demais endpoints se listCatalogs falhar', async () => {
      api.listCatalogs.mockResolvedValue({
        ok: false,
        status: 401,
        body: {} as any,
      });

      const result = await service.verify();

      expect(result.ok).toBe(false);
      expect(api.listSellableItems).not.toHaveBeenCalled();
      expect(api.listUnsellableItems).not.toHaveBeenCalled();
    });

    it('limita a amostra a 30 itens mesmo com múltiplos catálogos', async () => {
      api.listCatalogs.mockResolvedValue({
        ok: true,
        status: 200,
        body: [
          catalogo({ catalogId: 'c1', groupId: 'g1' }),
          catalogo({ catalogId: 'c2', groupId: 'g2' }),
        ],
      });
      const item = (n: number) => ({
        itemId: `i${n}`,
        categoryId: 'c',
        categoryName: 'x',
        itemName: `Item ${n}`,
      });
      api.listSellableItems.mockResolvedValue({
        ok: true,
        status: 200,
        body: Array.from({ length: 20 }, (_, i) => item(i)),
      });
      api.listUnsellableItems.mockResolvedValue({
        ok: true,
        status: 200,
        body: { categories: [] },
      });

      const result = await service.verify();

      expect(result.sellableCount).toBe(40);
      expect(result.amostraSellable).toHaveLength(30);
    });
  });
});
