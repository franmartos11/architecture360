import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/require-project-access', () => ({
  requireProjectAccess: vi.fn(),
}));
vi.mock('@/lib/rate-limit', () => ({
  rateLimitOrRespond: vi.fn(),
}));

import { mockSupabase, jsonRequest } from '@/lib/test-helpers/supabase-mock';

const ORIGINAL_KEY = process.env.GOOGLE_MAPS_API_KEY;

// Módulo fresco por test (resetModules) para que cada uno arranque con
// mocks limpios. Imports SECUENCIALES: en paralelo, tras resetModules(), el
// route puede quedar enlazado a una instancia real (no mockeada) de
// require-project-access.
async function loadRoute() {
  vi.resetModules();
  const requireAccessModule = await import('@/lib/supabase/require-project-access');
  const rateLimitModule = await import('@/lib/rate-limit');
  const routeModule = await import('./route');
  return {
    POST: routeModule.POST,
    requireProjectAccess: requireAccessModule.requireProjectAccess,
    rateLimitOrRespond: rateLimitModule.rateLimitOrRespond,
  };
}

function req(body: unknown) {
  return jsonRequest('http://localhost/api/admin/calculate-travel-times', body);
}

type MockResult = { data?: unknown; error?: unknown };

const PROJECT: MockResult = { data: { id: 'project-1', latitude: -31.4, longitude: -64.2 } };
const noTimes = { drive_minutes: null, walk_minutes: null, bike_minutes: null };

// Respuesta de Routes computeRouteMatrix: un elemento por destino, en
// cualquier orden (por eso se mapea por destinationIndex).
function matrix(elements: { destinationIndex: number; seconds?: number; condition?: string }[]) {
  return new Response(JSON.stringify(elements.map(e => ({
    originIndex: 0,
    destinationIndex: e.destinationIndex,
    status: {},
    condition: e.condition ?? 'ROUTE_EXISTS',
    ...(e.seconds != null ? { duration: `${e.seconds}s` } : {}),
  }))), { status: 200 });
}

/** fetch que responde según travelMode (DRIVE 600s, WALK 1200s, BICYCLE 300s,
 *  multiplicado por destino), con los elementos en orden inverso. */
function routesFetch(destCount: number) {
  const secs: Record<string, number> = { DRIVE: 600, WALK: 1200, BICYCLE: 300 };
  return vi.fn((_url: string, init: RequestInit) => {
    const mode = JSON.parse(init.body as string).travelMode as string;
    const els = Array.from({ length: destCount }, (_, i) => {
      const idx = destCount - 1 - i;
      return { destinationIndex: idx, seconds: secs[mode] * (idx + 1) };
    });
    return Promise.resolve(matrix(els));
  });
}

async function setup(results: MockResult[]) {
  process.env.GOOGLE_MAPS_API_KEY = 'test-key';
  const route = await loadRoute();
  vi.mocked(route.rateLimitOrRespond).mockResolvedValue(null);
  const supabase = mockSupabase({ results: results as never });
  vi.mocked(route.requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'user-1' } } as never);
  return { ...route, supabase };
}

describe('POST /api/admin/calculate-travel-times (Routes API)', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    if (ORIGINAL_KEY === undefined) delete process.env.GOOGLE_MAPS_API_KEY;
    else process.env.GOOGLE_MAPS_API_KEY = ORIGINAL_KEY;
    vi.unstubAllGlobals();
  });

  it('sin GOOGLE_MAPS_API_KEY configurada: 500 inmediato, sin llegar a chequear auth', async () => {
    delete process.env.GOOGLE_MAPS_API_KEY;
    const { POST, requireProjectAccess } = await loadRoute();
    const res = await POST(req({ projectId: 'project-1' }));
    expect(res.status).toBe(500);
    expect(requireProjectAccess).not.toHaveBeenCalled();
  });

  it('falta projectId: 400', async () => {
    process.env.GOOGLE_MAPS_API_KEY = 'test-key';
    const { POST } = await loadRoute();
    expect((await POST(req({}))).status).toBe(400);
  });

  it('sin acceso al proyecto: 401', async () => {
    process.env.GOOGLE_MAPS_API_KEY = 'test-key';
    const { POST, requireProjectAccess } = await loadRoute();
    vi.mocked(requireProjectAccess).mockResolvedValue(null);
    expect((await POST(req({ projectId: 'project-1' }))).status).toBe(401);
  });

  it('rate-limit del modo proyecto: devuelve el 429 tal cual, sin consultar la base', async () => {
    process.env.GOOGLE_MAPS_API_KEY = 'test-key';
    const { POST, requireProjectAccess, rateLimitOrRespond } = await loadRoute();
    const supabase = mockSupabase({ results: [] });
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'user-1' } } as never);
    const { NextResponse } = await import('next/server');
    vi.mocked(rateLimitOrRespond).mockResolvedValue(NextResponse.json({ error: 'x' }, { status: 429 }));

    const res = await POST(req({ projectId: 'project-1' }));
    expect(res.status).toBe(429);
    expect(vi.mocked(rateLimitOrRespond).mock.lastCall?.[0]).toEqual({
      key: 'calculate-travel-times:user:user-1', windowSeconds: 300, max: 10,
    });
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('proyecto no encontrado: 404', async () => {
    const { POST } = await setup([{ data: null, error: null }]);
    expect((await POST(req({ projectId: 'project-1' }))).status).toBe(404);
  });

  it('proyecto sin coordenadas: 422', async () => {
    const { POST } = await setup([{ data: { id: 'project-1', latitude: null, longitude: null } }]);
    expect((await POST(req({ projectId: 'project-1' }))).status).toBe(422);
  });

  it('error al leer POIs: 500', async () => {
    const { POST } = await setup([PROJECT, { data: null, error: { message: 'db down' } }]);
    const res = await POST(req({ projectId: 'project-1' }));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe('Error al leer POIs.');
  });

  it('modo proyecto: completa solo los ubicados sin tiempos, con Routes API en los 3 modos', async () => {
    const { POST } = await setup([
      PROJECT,
      {
        data: [
          { id: 'poi-1', latitude: -31.41, longitude: -64.21, ...noTimes },
          { id: 'poi-manual', latitude: -31.42, longitude: -64.22, drive_minutes: 7, walk_minutes: null, bike_minutes: null },
          { id: 'poi-sin-ubicar', latitude: null, longitude: null, ...noTimes },
          { id: 'poi-2', latitude: -31.43, longitude: -64.23, ...noTimes },
        ],
      },
      { error: null }, // update poi-1
      { error: null }, // update poi-2
    ]);
    const fetchMock = routesFetch(2);
    vi.stubGlobal('fetch', fetchMock);

    const res = await POST(req({ projectId: 'project-1' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      updated: 2,
      times: [
        { id: 'poi-1', drive_minutes: 10, walk_minutes: 20, bike_minutes: 5 },
        { id: 'poi-2', drive_minutes: 20, walk_minutes: 40, bike_minutes: 10 },
      ],
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    const calls = fetchMock.mock.calls.map(([url, init]) => ({ url, init, body: JSON.parse((init as RequestInit).body as string) }));
    expect(calls.every(c => c.url === 'https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix')).toBe(true);
    expect(calls.map(c => c.body.travelMode).sort()).toEqual(['BICYCLE', 'DRIVE', 'WALK']);
    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers['X-Goog-Api-Key']).toBe('test-key');
    expect(headers['X-Goog-FieldMask']).toBe('originIndex,destinationIndex,duration,condition,status');
    expect(calls[0].body.origins).toEqual([{ waypoint: { location: { latLng: { latitude: -31.4, longitude: -64.2 } } } }]);
    expect(calls[0].body.destinations).toEqual([
      { waypoint: { location: { latLng: { latitude: -31.41, longitude: -64.21 } } } },
      { waypoint: { location: { latLng: { latitude: -31.43, longitude: -64.23 } } } },
    ]);
  });

  it('nada para calcular: 200 updated 0 con times [], sin llamar a Google', async () => {
    const { POST } = await setup([
      PROJECT,
      { data: [{ id: 'poi-manual', latitude: -31.42, longitude: -64.22, drive_minutes: 7, walk_minutes: 9, bike_minutes: 3 }] },
    ]);
    const res = await POST(req({ projectId: 'project-1' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ updated: 0, times: [] });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('Google rechaza (403): 502 con el error y NO guarda nada', async () => {
    const { POST, supabase } = await setup([
      PROJECT,
      { data: [{ id: 'poi-1', latitude: -31.41, longitude: -64.21, ...noTimes }] },
    ]);
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() =>
      Promise.resolve(new Response('{"error":{"code":403}}', { status: 403 }))));

    const res = await POST(req({ projectId: 'project-1' }));
    expect(res.status).toBe(502);
    expect((await res.json()).error).toBe(
      'Google Routes respondió un error (403). Revisá que Routes API esté habilitada en GOOGLE_MAPS_API_KEY.'
    );
    expect(supabase.from).toHaveBeenCalledTimes(2); // proyecto + POIs, ningún update
  });

  it('sin conexión con Google: 502 y no guarda nada', async () => {
    const { POST, supabase } = await setup([
      PROJECT,
      { data: [{ id: 'poi-1', latitude: -31.41, longitude: -64.21, ...noTimes }] },
    ]);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')));

    const res = await POST(req({ projectId: 'project-1' }));
    expect(res.status).toBe(502);
    expect((await res.json()).error).toBe('No se pudo conectar con Google Routes. Probá de nuevo en un momento.');
    expect(supabase.from).toHaveBeenCalledTimes(2);
  });

  it('ruta inexistente en un modo (ej. bici): ese tiempo queda null y el resto se guarda', async () => {
    const { POST } = await setup([
      PROJECT,
      { data: [{ id: 'poi-1', latitude: -31.41, longitude: -64.21, ...noTimes }] },
      { error: null },
    ]);
    vi.stubGlobal('fetch', vi.fn((_u: string, init: RequestInit) => {
      const mode = JSON.parse(init.body as string).travelMode;
      return Promise.resolve(mode === 'BICYCLE'
        ? matrix([{ destinationIndex: 0, condition: 'ROUTE_NOT_FOUND' }])
        : matrix([{ destinationIndex: 0, seconds: 90 }]));
    }));

    const res = await POST(req({ projectId: 'project-1' }));
    expect(await res.json()).toEqual({
      updated: 1,
      times: [{ id: 'poi-1', drive_minutes: 2, walk_minutes: 2, bike_minutes: null }],
    });
  });

  it('falla el update de algún POI: 500', async () => {
    const { POST } = await setup([
      PROJECT,
      { data: [{ id: 'poi-1', latitude: -31.41, longitude: -64.21, ...noTimes }] },
      { error: { message: 'update failed' } },
    ]);
    vi.stubGlobal('fetch', routesFetch(1));
    expect((await POST(req({ projectId: 'project-1' }))).status).toBe(500);
  });

  describe('con poiIds', () => {
    it('sin overwrite: solo esos y no los que ya tienen tiempos', async () => {
      const { POST } = await setup([
        PROJECT,
        {
          data: [
            { id: 'poi-new', latitude: -31.41, longitude: -64.21, ...noTimes },
            { id: 'poi-manual', latitude: -31.42, longitude: -64.22, drive_minutes: 7, walk_minutes: null, bike_minutes: null },
            { id: 'poi-other', latitude: -31.43, longitude: -64.23, ...noTimes },
          ],
        },
        { error: null },
      ]);
      vi.stubGlobal('fetch', routesFetch(1));

      const res = await POST(req({ projectId: 'project-1', poiIds: ['poi-new', 'poi-manual'] }));
      expect(await res.json()).toEqual({
        updated: 1,
        times: [{ id: 'poi-new', drive_minutes: 10, walk_minutes: 20, bike_minutes: 5 }],
      });
    });

    it('con overwrite: recalcula aunque ya tenga tiempos (pin movido)', async () => {
      const { POST } = await setup([
        PROJECT,
        { data: [{ id: 'poi-manual', latitude: -31.42, longitude: -64.22, drive_minutes: 7, walk_minutes: 9, bike_minutes: 3 }] },
        { error: null },
      ]);
      vi.stubGlobal('fetch', routesFetch(1));

      const res = await POST(req({ projectId: 'project-1', poiIds: ['poi-manual'], overwrite: true }));
      expect(await res.json()).toEqual({
        updated: 1,
        times: [{ id: 'poi-manual', drive_minutes: 10, walk_minutes: 20, bike_minutes: 5 }],
      });
    });

    it('usa el rate limit por POI', async () => {
      process.env.GOOGLE_MAPS_API_KEY = 'test-key';
      const { POST, requireProjectAccess, rateLimitOrRespond } = await loadRoute();
      const { NextResponse } = await import('next/server');
      vi.mocked(rateLimitOrRespond).mockResolvedValue(NextResponse.json({ error: 'x' }, { status: 429 }));
      vi.mocked(requireProjectAccess).mockResolvedValue({ supabase: mockSupabase(), user: { id: 'user-1' } } as never);

      expect((await POST(req({ projectId: 'project-1', poiIds: ['poi-new'] }))).status).toBe(429);
      expect(vi.mocked(rateLimitOrRespond).mock.lastCall?.[0]).toEqual({
        key: 'calculate-travel-times-poi:user:user-1', windowSeconds: 300, max: 60,
      });
    });

    it('poiIds u overwrite inválidos: 400', async () => {
      process.env.GOOGLE_MAPS_API_KEY = 'test-key';
      const { POST } = await loadRoute();
      expect((await POST(req({ projectId: 'project-1', poiIds: 'poi-new' }))).status).toBe(400);
      expect((await POST(req({ projectId: 'project-1', poiIds: [] }))).status).toBe(400);
      expect((await POST(req({ projectId: 'project-1', poiIds: [3] }))).status).toBe(400);
      expect((await POST(req({ projectId: 'project-1', poiIds: ['a', 'b', 'c', 'd', 'e', 'f'] }))).status).toBe(400);
      // overwrite solo tiene sentido para puntos puntuales: nunca pisa todo el proyecto.
      expect((await POST(req({ projectId: 'project-1', overwrite: true }))).status).toBe(400);
      expect((await POST(req({ projectId: 'project-1', poiIds: ['a'], overwrite: 'si' }))).status).toBe(400);
    });
  });
});
