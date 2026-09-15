import { IfoodEventsService } from './ifood-events.service';
import { IfoodApiService } from './ifood-api.service';

describe('IfoodEventsService — heartbeat de conexão', () => {
  let api: jest.Mocked<IfoodApiService>;
  let service: IfoodEventsService;

  beforeEach(() => {
    api = { request: jest.fn() } as any;
    service = new IfoodEventsService(api);
  });

  it('sem eventos pendentes (204), não confirma nada', async () => {
    api.request.mockResolvedValue({ ok: true, status: 204, body: {} });

    const result = await service.pollOnce();

    expect(result).toEqual({ eventos: 0, codigos: [] });
    expect(api.request).toHaveBeenCalledTimes(1);
  });

  it('recebe eventos e confirma todos de uma vez', async () => {
    api.request
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        body: [
          {
            id: 'e1',
            code: 'PLC',
            fullCode: 'PLACED',
            createdAt: '2026-09-15T00:00:00Z',
          },
          {
            id: 'e2',
            code: 'CFM',
            fullCode: 'CONFIRMED',
            createdAt: '2026-09-15T00:00:01Z',
          },
        ],
      })
      .mockResolvedValueOnce({ ok: true, status: 202, body: {} });

    const result = await service.pollOnce();

    expect(result).toEqual({ eventos: 2, codigos: ['PLACED', 'CONFIRMED'] });
    expect(api.request).toHaveBeenCalledTimes(2);
    expect(api.request).toHaveBeenLastCalledWith(
      '/events/v1.0/events/acknowledgment',
      { method: 'POST', body: JSON.stringify([{ id: 'e1' }, { id: 'e2' }]) },
    );
  });

  it('falha no polling não tenta confirmar nada', async () => {
    api.request.mockResolvedValue({ ok: false, status: 500, body: {} });

    const result = await service.pollOnce();

    expect(result).toEqual({ eventos: 0, codigos: [] });
    expect(api.request).toHaveBeenCalledTimes(1);
  });
});
