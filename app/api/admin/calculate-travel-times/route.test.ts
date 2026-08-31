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

// GMAPS_KEY se lee a nivel de módulo (`const GMAPS_KEY = process.env...`), así
// que hay que setear la env var ANTES de importar el route y forzar un
// módulo fresco por test con resetModules() — si no, el valor quedaría
// pegado al de la primera importación para todo el archivo. Se re-importan
// también los mocks (no solo la ruta): tras resetModules() cualquier import
// nuevo de un módulo mockeado corre de nuevo su factory y crea un vi.fn()
// nuevo, desacoplado de una referencia estática tomada antes del reset.
//
// Importante: estos imports van SECUENCIALES, no en Promise.all. Si el
// import del route (que internamente importa require-project-access) y el
// import directo de require-project-access se disparan en paralelo justo
// después de resetModules(), quedan en una carrera donde el route termina
// enlazado a una instancia real (no mockeada) del módulo — el mock que
// devuelve esta función queda desacoplado del que usa el handler. Importar
// primero los mocks y recién después el route evita la carrera.
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

describe('POST /api/admin/calculate-travel-times', () => {
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

    const res = await POST(req({}));
    expect(res.status).toBe(400);
  });

  it('sin acceso al proyecto: 401', async () => {
    process.env.GOOGLE_MAPS_API_KEY = 'test-key';
    const { POST, requireProjectAccess } = await loadRoute();
    vi.mocked(requireProjectAccess).mockResolvedValue(null);

    const res = await POST(req({ projectId: 'project-1' }));
    expect(res.status).toBe(401);
  });

  it('rate-limit alcanzado: devuelve el 429 tal cual, sin consultar la base', async () => {
    process.env.GOOGLE_MAPS_API_KEY = 'test-key';
    const { POST, requireProjectAccess, rateLimitOrRespond } = await loadRoute();
    const supabase = mockSupabase({ results: [] });
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'user-1' } } as never);
    const { NextResponse } = await import('next/server');
    vi.mocked(rateLimitOrRespond).mockResolvedValue(
      NextResponse.json({ error: 'Ya calculaste los tiempos hace poco' }, { status: 429 })
    );

    const res = await POST(req({ projectId: 'project-1' }));
    expect(res.status).toBe(429);
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('proyecto no encontrado: 404', async () => {
    process.env.GOOGLE_MAPS_API_KEY = 'test-key';
    const { POST, requireProjectAccess, rateLimitOrRespond } = await loadRoute();
    vi.mocked(rateLimitOrRespond).mockResolvedValue(null);
    const supabase = mockSupabase({ results: [{ data: null, error: null }] });
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'user-1' } } as never);

    const res = await POST(req({ projectId: 'project-1' }));
    expect(res.status).toBe(404);
  });

  it('proyecto sin coordenadas: 422', async () => {
    process.env.GOOGLE_MAPS_API_KEY = 'test-key';
    const { POST, requireProjectAccess, rateLimitOrRespond } = await loadRoute();
    vi.mocked(rateLimitOrRespond).mockResolvedValue(null);
    const supabase = mockSupabase({ results: [{ data: { id: 'project-1', latitude: null, longitude: null } }] });
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'user-1' } } as never);

    const res = await POST(req({ projectId: 'project-1' }));
    expect(res.status).toBe(422);
  });

  it('error al leer POIs: 500', async () => {
    process.env.GOOGLE_MAPS_API_KEY = 'test-key';
    const { POST, requireProjectAccess, rateLimitOrRespond } = await loadRoute();
    vi.mocked(rateLimitOrRespond).mockResolvedValue(null);
    const supabase = mockSupabase({
      results: [
        { data: { id: 'project-1', latitude: -31.4, longitude: -64.2 } },
        { data: null, error: { message: 'db down' } },
      ],
    });
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'user-1' } } as never);

    const res = await POST(req({ projectId: 'project-1' }));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe('Error al leer POIs.');
  });

  it('ningún POI con coordenadas: 200 con updated:0, sin llamar a la Distance Matrix API', async () => {
    process.env.GOOGLE_MAPS_API_KEY = 'test-key';
    const { POST, requireProjectAccess, rateLimitOrRespond } = await loadRoute();
    vi.mocked(rateLimitOrRespond).mockResolvedValue(null);
    const supabase = mockSupabase({
      results: [
        { data: { id: 'project-1', latitude: -31.4, longitude: -64.2 } },
        { data: [{ id: 'poi-1', latitude: null, longitude: null }] },
      ],
    });
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'user-1' } } as never);

    const res = await POST(req({ projectId: 'project-1' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ updated: 0, message: 'Ningún POI tiene coordenadas para calcular.' });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('camino feliz: llama a la Distance Matrix API en los 3 modos y actualiza cada POI', async () => {
    process.env.GOOGLE_MAPS_API_KEY = 'test-key';
    const { POST, requireProjectAccess, rateLimitOrRespond } = await loadRoute();
    vi.mocked(rateLimitOrRespond).mockResolvedValue(null);
    const supabase = mockSupabase({
      results: [
        { data: { id: 'project-1', latitude: -31.4, longitude: -64.2 } },
        {
          data: [
            { id: 'poi-1', latitude: -31.41, longitude: -64.21 },
            { id: 'poi-2', latitude: -31.42, longitude: -64.22 },
          ],
        },
        { error: null }, // update poi-1
        { error: null }, // update poi-2
      ],
    });
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'user-1' } } as never);

    const fetchMock = vi.fn().mockResolvedValue({
      json: () =>
        Promise.resolve({
          status: 'OK',
          rows: [
            {
              elements: [
                { status: 'OK', duration: { value: 600, text: '10 mins' } },
                { status: 'OK', duration: { value: 1200, text: '20 mins' } },
              ],
            },
          ],
        }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const res = await POST(req({ projectId: 'project-1' }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ updated: 2 });
    expect(fetchMock).toHaveBeenCalledTimes(3); // driving, walking, bicycling en paralelo
    const urls = fetchMock.mock.calls.map((c) => c[0] as string);
    expect(urls.some((u) => u.includes('mode=driving'))).toBe(true);
    expect(urls.some((u) => u.includes('mode=walking'))).toBe(true);
    expect(urls.some((u) => u.includes('mode=bicycling'))).toBe(true);
    expect(urls.every((u) => u.includes('key=test-key'))).toBe(true);
  });

  it('Google devuelve status != OK: trata los destinos como sin dato, igual responde 200', async () => {
    process.env.GOOGLE_MAPS_API_KEY = 'test-key';
    const { POST, requireProjectAccess, rateLimitOrRespond } = await loadRoute();
    vi.mocked(rateLimitOrRespond).mockResolvedValue(null);
    const supabase = mockSupabase({
      results: [
        { data: { id: 'project-1', latitude: -31.4, longitude: -64.2 } },
        { data: [{ id: 'poi-1', latitude: -31.41, longitude: -64.21 }] },
        { error: null },
      ],
    });
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'user-1' } } as never);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ json: () => Promise.resolve({ status: 'REQUEST_DENIED', rows: [] }) })
    );

    const res = await POST(req({ projectId: 'project-1' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ updated: 1 });
  });

  it('falla el update de algún POI: 500', async () => {
    process.env.GOOGLE_MAPS_API_KEY = 'test-key';
    const { POST, requireProjectAccess, rateLimitOrRespond } = await loadRoute();
    vi.mocked(rateLimitOrRespond).mockResolvedValue(null);
    const supabase = mockSupabase({
      results: [
        { data: { id: 'project-1', latitude: -31.4, longitude: -64.2 } },
        { data: [{ id: 'poi-1', latitude: -31.41, longitude: -64.21 }] },
        { error: { message: 'update failed' } },
      ],
    });
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'user-1' } } as never);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        json: () =>
          Promise.resolve({
            status: 'OK',
            rows: [{ elements: [{ status: 'OK', duration: { value: 600, text: '10 mins' } }] }],
          }),
      })
    );

    const res = await POST(req({ projectId: 'project-1' }));
    expect(res.status).toBe(500);
  });
});
