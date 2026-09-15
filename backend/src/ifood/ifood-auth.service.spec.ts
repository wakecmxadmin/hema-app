import { IfoodAuthService } from './ifood-auth.service';

jest.mock('../lib/supabase', () => {
  const store: any = { row: null };
  const api = {
    select: () => api,
    eq: () => api,
    maybeSingle: async () => ({ data: store.row, error: null }),
    upsert: async (values: any) => {
      store.row = { ...(store.row ?? {}), ...values };
      return { error: null };
    },
  };
  return { supabase: { from: () => api }, __store: store };
});

const { __store } = jest.requireMock('../lib/supabase');

describe('IfoodAuthService', () => {
  let auth: IfoodAuthService;
  let fetchMock: jest.Mock;

  const resposta = (status: number, body: any) => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });

  beforeEach(() => {
    __store.row = null;
    process.env.IFOOD_CLIENT_ID = 'client-1';
    process.env.IFOOD_CLIENT_SECRET = 'secret-1';
    delete process.env.IFOOD_AUTH_MODE;

    auth = new IfoodAuthService();
    fetchMock = jest.fn();
    global.fetch = fetchMock as any;
  });

  describe('modo centralizado', () => {
    it('autentica com client_credentials', async () => {
      fetchMock.mockResolvedValue(
        resposta(200, { accessToken: 'tok-1', expiresIn: 21599 }),
      );

      expect(await auth.getAccessToken()).toBe('tok-1');

      const body = fetchMock.mock.calls[0][1].body.toString();
      expect(body).toContain('grantType=client_credentials');
    });

    it('reaproveita o token em cache', async () => {
      fetchMock.mockResolvedValue(
        resposta(200, { accessToken: 'tok-1', expiresIn: 21599 }),
      );

      await auth.getAccessToken();
      await auth.getAccessToken();

      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('renova depois de invalidate', async () => {
      fetchMock.mockResolvedValue(
        resposta(200, { accessToken: 'tok-1', expiresIn: 21599 }),
      );

      await auth.getAccessToken();
      auth.invalidate();
      await auth.getAccessToken();

      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('coalesce renovações simultâneas numa só requisição', async () => {
      fetchMock.mockResolvedValue(
        resposta(200, { accessToken: 'tok-1', expiresIn: 21599 }),
      );

      await Promise.all([
        auth.getAccessToken(),
        auth.getAccessToken(),
        auth.getAccessToken(),
      ]);

      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('devolve null quando a API recusa', async () => {
      fetchMock.mockResolvedValue(
        resposta(401, { error: { message: 'invalid client' } }),
      );
      expect(await auth.getAccessToken()).toBeNull();
    });

    it('não persiste tokens no banco', async () => {
      fetchMock.mockResolvedValue(
        resposta(200, { accessToken: 'tok-1', expiresIn: 21599 }),
      );
      await auth.getAccessToken();
      expect(__store.row).toBeNull();
    });
  });

  describe('modo distribuído', () => {
    beforeEach(() => {
      process.env.IFOOD_AUTH_MODE = 'distributed';
      auth = new IfoodAuthService();
    });

    it('gera userCode e guarda o verifier', async () => {
      fetchMock.mockResolvedValue(
        resposta(200, {
          userCode: 'ABCD1234',
          authorizationCodeVerifier: 'verif-1',
          expiresIn: 600,
        }),
      );

      const r = await auth.requestUserCode();

      expect(r?.userCode).toBe('ABCD1234');
      expect(__store.row.authorization_code_verifier).toBe('verif-1');
    });

    it('troca o authorizationCode e guarda o refresh token', async () => {
      __store.row = { authorization_code_verifier: 'verif-1' };
      fetchMock.mockResolvedValue(
        resposta(200, {
          accessToken: 'tok-1',
          refreshToken: 'refresh-1',
          expiresIn: 21599,
        }),
      );

      expect(await auth.completeAuthorization('auth-code-1')).toBe(true);

      const body = fetchMock.mock.calls[0][1].body.toString();
      expect(body).toContain('grantType=authorization_code');
      expect(body).toContain('authorizationCodeVerifier=verif-1');
      expect(__store.row.refresh_token).toBe('refresh-1');
    });

    it('recusa completar sem verifier', async () => {
      __store.row = null;
      expect(await auth.completeAuthorization('auth-code-1')).toBe(false);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('renova usando refresh_token', async () => {
      __store.row = { refresh_token: 'refresh-1' };
      fetchMock.mockResolvedValue(
        resposta(200, { accessToken: 'tok-2', expiresIn: 21599 }),
      );

      expect(await auth.getAccessToken()).toBe('tok-2');

      const body = fetchMock.mock.calls[0][1].body.toString();
      expect(body).toContain('grantType=refresh_token');
      expect(body).toContain('refreshToken=refresh-1');
    });

    it('não tenta autenticar enquanto a loja não autorizou', async () => {
      __store.row = null;
      expect(await auth.getAccessToken()).toBeNull();
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });
});
