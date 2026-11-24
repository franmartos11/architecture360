import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/require-admin', () => ({ requireAdminUser: vi.fn() }));
vi.mock('@/lib/rate-limit', () => ({ rateLimitOrRespond: vi.fn().mockResolvedValue(null) }));

import { requireAdminUser } from '@/lib/supabase/require-admin';
import { rateLimitOrRespond } from '@/lib/rate-limit';
import { GET } from './route';

const URL_BASE = 'http://localhost/api/admin/places-search';
const ORIGINAL_KEY = process.env.GOOGLE_MAPS_API_KEY;

function sentBody() {
  const init = vi.mocked(fetch).mock.calls[0][1] as RequestInit;
  return JSON.parse(init.body as string);
}

describe('GET /api/admin/places-search', () => {
  beforeEach(() => {
    process.env.GOOGLE_MAPS_API_KEY = 'test-key';
    vi.mocked(requireAdminUser).mockReset().mockResolvedValue({ id: 'user-1' } as never);
    vi.mocked(rateLimitOrRespond).mockReset().mockResolvedValue(null);
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    process.env.GOOGLE_MAPS_API_KEY = ORIGINAL_KEY;
  });

  it('sin sesión: 401', async () => {
    vi.mocked(requireAdminUser).mockResolvedValue(null as never);
    const res = await GET(new Request(`${URL_BASE}?q=colegio`));
    expect(res.status).toBe(401);
  });

  it('q vacío: [] sin rate-limit ni fetch', async () => {
    const res = await GET(new Request(`${URL_BASE}?q=%20`));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ results: [] });
    expect(rateLimitOrRespond).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('rate-limit: devuelve su 429 sin fetch', async () => {
    const { NextResponse } = await import('next/server');
    vi.mocked(rateLimitOrRespond).mockResolvedValue(NextResponse.json({ error: 'muchas' }, { status: 429 }));
    const res = await GET(new Request(`${URL_BASE}?q=colegio`));
    expect(res.status).toBe(429);
    expect(rateLimitOrRespond).toHaveBeenCalledWith({ key: 'places-search:user:user-1', windowSeconds: 60, max: 30 });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('sin GOOGLE_MAPS_API_KEY: 500', async () => {
    delete process.env.GOOGLE_MAPS_API_KEY;
    const res = await GET(new Request(`${URL_BASE}?q=colegio`));
    expect(res.status).toBe(500);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('mapea la respuesta y descarta places sin location', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({
      places: [
        {
          id: 'abc',
          displayName: { text: 'Colegio del Huerto' },
          formattedAddress: 'Belgrano 269, Córdoba',
          location: { latitude: -31.4178, longitude: -64.1893 },
          types: ['school', 'establishment'],
        },
        { id: 'sin-loc', displayName: { text: 'Fantasma' }, types: ['school'] },
      ],
    }), { status: 200 }));

    const res = await GET(new Request(`${URL_BASE}?q=colegio`));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      results: [{
        placeId: 'abc', name: 'Colegio del Huerto', address: 'Belgrano 269, Córdoba',
        lat: -31.4178, lng: -64.1893, category: 'colegio',
      }],
    });
    const init = vi.mocked(fetch).mock.calls[0][1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers['X-Goog-Api-Key']).toBe('test-key');
    expect(headers['X-Goog-FieldMask']).toBe('places.id,places.displayName,places.formattedAddress,places.location,places.types');
  });

  it('con lat/lng manda locationBias radius 5000', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }));
    await GET(new Request(`${URL_BASE}?q=colegio&lat=-31.42&lng=-64.19`));
    const body = sentBody();
    expect(body).toMatchObject({ textQuery: 'colegio', pageSize: 10, languageCode: 'es', regionCode: 'AR' });
    expect(body.locationBias).toEqual({ circle: { center: { latitude: -31.42, longitude: -64.19 }, radius: 5000 } });
  });

  it('sin lat/lng o con lat=abc: sin locationBias', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }));
    await GET(new Request(`${URL_BASE}?q=colegio`));
    expect(sentBody().locationBias).toBeUndefined();

    vi.mocked(fetch).mockClear();
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }));
    await GET(new Request(`${URL_BASE}?q=colegio&lat=abc&lng=-64.19`));
    expect(sentBody().locationBias).toBeUndefined();
  });

  it('Google 429 (cuota): mensaje de cuota, no de API deshabilitada', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response('{}', { status: 429 }));
    const res = await GET(new Request(`${URL_BASE}?q=colegio`));
    expect(res.status).toBe(502);
    const { error } = await res.json();
    expect(error).toContain('cuota');
    expect(error).not.toContain('habilitada');
  });

  it('sin conexión con Google: mensaje de conexión', async () => {
    vi.mocked(fetch).mockRejectedValue(new TypeError('fetch failed'));
    const res = await GET(new Request(`${URL_BASE}?q=colegio`));
    expect(res.status).toBe(502);
    const { error } = await res.json();
    expect(error).toBe('No se pudo conectar con Google Places. Probá de nuevo en un momento.');
  });

  it('Google 500: mensaje genérico con el código', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response('{}', { status: 500 }));
    const { error } = await (await GET(new Request(`${URL_BASE}?q=colegio`))).json();
    expect(error).toBe('Google Places respondió un error (500). Probá de nuevo en un momento.');
  });

  it('Google 403: 502 con mensaje y results []', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response('{"error":{}}', { status: 403 }));
    const res = await GET(new Request(`${URL_BASE}?q=colegio`));
    expect(res.status).toBe(502);
    const data = await res.json();
    expect(data.results).toEqual([]);
    expect(data.error).toContain('403');
    expect(data.error).toContain('Places API (New)');
  });
});
