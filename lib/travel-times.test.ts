import { describe, it, expect, vi, afterEach } from 'vitest';
import { needsTravelTimes, requestTravelTimes } from './travel-times';

afterEach(() => { vi.unstubAllGlobals(); });

describe('needsTravelTimes', () => {
  const base = { latitude: -31.4, longitude: -64.1, drive_minutes: null, walk_minutes: null, bike_minutes: null };
  it('ubicado y sin ningún tiempo → true', () => expect(needsTravelTimes(base)).toBe(true));
  it('sin ubicar → false', () => expect(needsTravelTimes({ ...base, latitude: null })).toBe(false));
  it('con algún tiempo cargado → false', () => expect(needsTravelTimes({ ...base, walk_minutes: 4 })).toBe(false));
});

describe('requestTravelTimes', () => {
  it('manda projectId/poiIds/overwrite y devuelve times', async () => {
    const times = [{ id: 'a', drive_minutes: 3, walk_minutes: 9, bike_minutes: 4 }];
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ updated: 1, times }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    expect(await requestTravelTimes({ projectId: 'p1', poiIds: ['a'], overwrite: true })).toEqual({ ok: true, times });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/admin/calculate-travel-times');
    expect(JSON.parse(init.body)).toEqual({ projectId: 'p1', poiIds: ['a'], overwrite: true });
  });

  it('modo proyecto: no manda poiIds ni overwrite', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ updated: 0, times: [] }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    await requestTravelTimes({ projectId: 'p1' });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ projectId: 'p1' });
  });

  it('error de la ruta: ok false con el mensaje y el status', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'Google Routes respondió un error (403).' }), { status: 502 })));
    expect(await requestTravelTimes({ projectId: 'p1' })).toEqual({ ok: false, status: 502, error: 'Google Routes respondió un error (403).' });
  });

  it('sin conexión: ok false con mensaje genérico', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')));
    expect(await requestTravelTimes({ projectId: 'p1' })).toEqual({ ok: false, status: 0, error: 'No se pudieron calcular los tiempos de viaje.' });
  });
});
