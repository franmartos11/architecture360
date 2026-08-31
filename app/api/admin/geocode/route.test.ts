import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/require-admin', () => ({ requireAdminUser: vi.fn() }));
vi.mock('@/lib/rate-limit', () => ({ rateLimitOrRespond: vi.fn().mockResolvedValue(null) }));

import { requireAdminUser } from '@/lib/supabase/require-admin';
import { rateLimitOrRespond } from '@/lib/rate-limit';
import { GET } from './route';

function get(url: string) {
  return new Request(url);
}

describe('GET /api/admin/geocode', () => {
  beforeEach(() => {
    vi.mocked(requireAdminUser).mockReset();
    vi.mocked(rateLimitOrRespond).mockReset().mockResolvedValue(null);
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sin sesión: 401', async () => {
    vi.mocked(requireAdminUser).mockResolvedValue(null as never);
    const res = await GET(get('http://localhost/api/admin/geocode?q=Cordoba'));
    expect(res.status).toBe(401);
  });

  it('sin query: [] sin rate-limitear ni pegarle a Nominatim', async () => {
    vi.mocked(requireAdminUser).mockResolvedValue({ id: 'user-1' } as never);
    const res = await GET(get('http://localhost/api/admin/geocode'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ results: [] });
    expect(rateLimitOrRespond).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('rate-limit alcanzado: devuelve el 429 tal cual, sin llamar a fetch', async () => {
    vi.mocked(requireAdminUser).mockResolvedValue({ id: 'user-1' } as never);
    const { NextResponse } = await import('next/server');
    const limited = NextResponse.json({ error: 'Estás haciendo muchas solicitudes seguidas' }, { status: 429 });
    vi.mocked(rateLimitOrRespond).mockResolvedValue(limited);

    const res = await GET(get('http://localhost/api/admin/geocode?q=Cordoba'));
    expect(res.status).toBe(429);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('Nominatim responde con error HTTP: [] sin romper', async () => {
    vi.mocked(requireAdminUser).mockResolvedValue({ id: 'user-1' } as never);
    vi.mocked(fetch).mockResolvedValue({ ok: false } as never);

    const res = await GET(get('http://localhost/api/admin/geocode?q=Cordoba'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ results: [] });
  });

  it('Nominatim responde con JSON inválido: [] sin romper', async () => {
    vi.mocked(requireAdminUser).mockResolvedValue({ id: 'user-1' } as never);
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.reject(new Error('bad json')),
    } as never);

    const res = await GET(get('http://localhost/api/admin/geocode?q=Cordoba'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ results: [] });
  });

  it('búsqueda válida: mapea display_name/lat/lon a label/lat/lng numéricos', async () => {
    vi.mocked(requireAdminUser).mockResolvedValue({ id: 'user-1' } as never);
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([{ display_name: 'Córdoba, Argentina', lat: '-31.42', lon: '-64.18' }]),
    } as never);

    const res = await GET(get('http://localhost/api/admin/geocode?q=Cordoba'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ results: [{ label: 'Córdoba, Argentina', lat: -31.42, lng: -64.18 }] });

    const calledUrl = vi.mocked(fetch).mock.calls[0][0] as string;
    expect(calledUrl).toContain('nominatim.openstreetmap.org/search');
    expect(calledUrl).toContain('q=Cordoba');
    const calledInit = vi.mocked(fetch).mock.calls[0][1] as RequestInit;
    expect((calledInit.headers as Record<string, string>)['User-Agent']).toBeTruthy();
  });
});
