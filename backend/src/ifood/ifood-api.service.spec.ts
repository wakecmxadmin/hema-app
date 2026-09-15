import { IfoodApiService } from './ifood-api.service';
import { IfoodAuthService } from './ifood-auth.service';

describe('IfoodApiService — resiliência', () => {
  let auth: jest.Mocked<IfoodAuthService>;
  let api: IfoodApiService;
  let fetchMock: jest.Mock;

  const resposta = (status: number, body: any = {}, headers: any = {}) => ({
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (k: string) => headers[k] ?? null },
    json: async () => body,
  });

  beforeEach(() => {
    auth = {
      getAccessToken: jest.fn().mockResolvedValue('token-abc'),
      invalidate: jest.fn(),
      isConfigured: jest.fn().mockReturnValue(true),
    } as any;

    api = new IfoodApiService(auth);
    // Sem espera real: o teste valida a política, não o relógio.
    jest.spyOn(api as any, 'sleep').mockResolvedValue(undefined);

    fetchMock = jest.fn();
    global.fetch = fetchMock as any;
  });

  it('envia Bearer token e Content-Type', async () => {
    fetchMock.mockResolvedValue(resposta(200, { ok: true }));
    await api.request('/merchant/v1.0/merchants');

    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers.Authorization).toBe('Bearer token-abc');
    expect(init.headers['Content-Type']).toBe('application/json');
  });

  it('não chama a API sem token', async () => {
    auth.getAccessToken.mockResolvedValue(null);
    const r = await api.request('/qualquer');

    expect(fetchMock).not.toHaveBeenCalled();
    expect(r.ok).toBe(false);
    expect(r.status).toBe(0);
  });

  it('no 401 renova o token e repete uma única vez', async () => {
    fetchMock
      .mockResolvedValueOnce(resposta(401))
      .mockResolvedValueOnce(resposta(200, { ok: true }));

    const r = await api.request('/item/v1.0/items', { method: 'PUT' });

    expect(auth.invalidate).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(r.ok).toBe(true);
  });

  it('não entra em loop se o 401 persistir', async () => {
    fetchMock.mockResolvedValue(resposta(401));
    const r = await api.request('/item/v1.0/items');

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(r.status).toBe(401);
  });

  it.each([429, 500, 502, 503, 408])(
    'repete com backoff no status %s e devolve o sucesso',
    async (status) => {
      fetchMock
        .mockResolvedValueOnce(resposta(status))
        .mockResolvedValueOnce(resposta(200, { ok: true }));

      const r = await api.request('/item/v1.0/items');

      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(r.ok).toBe(true);
    },
  );

  it('respeita o Retry-After em segundos', async () => {
    fetchMock
      .mockResolvedValueOnce(resposta(429, {}, { 'Retry-After': '7' }))
      .mockResolvedValueOnce(resposta(200));

    const sleep = jest.spyOn(api as any, 'sleep');
    await api.request('/item/v1.0/items');

    expect(sleep).toHaveBeenCalledWith(7000);
  });

  it('desiste após 4 tentativas e devolve o erro', async () => {
    fetchMock.mockResolvedValue(resposta(503, { erro: 'indisponivel' }));
    const r = await api.request('/item/v1.0/items');

    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(r.ok).toBe(false);
    expect(r.status).toBe(503);
  });

  it('não repete em erro do cliente (400)', async () => {
    fetchMock.mockResolvedValue(resposta(400, { erro: 'payload invalido' }));
    const r = await api.request('/item/v1.0/items');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(r.status).toBe(400);
  });

  it('repete falha de rede e se recupera', async () => {
    fetchMock
      .mockRejectedValueOnce(new Error('ECONNRESET'))
      .mockResolvedValueOnce(resposta(200, { ok: true }));

    const r = await api.request('/item/v1.0/items');

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(r.ok).toBe(true);
  });

  it('backoff é exponencial', () => {
    const b = (n: number) => (api as any).backoffMs(n);
    expect(b(1)).toBeGreaterThanOrEqual(1000);
    expect(b(2)).toBeGreaterThanOrEqual(2000);
    expect(b(3)).toBeGreaterThanOrEqual(4000);
    expect(b(1)).toBeLessThan(b(3));
  });
});
