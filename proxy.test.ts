import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@supabase/ssr', () => ({ createServerClient: vi.fn() }));
vi.mock('@/lib/rate-limit', () => ({ rateLimitOrRespond: vi.fn().mockResolvedValue(null) }));
vi.mock('@/lib/project-host', () => ({
  resolveHostProject: vi.fn(),
  canonicalDomainForSlug: vi.fn(),
  isActiveCustomDomainOrigin: vi.fn(),
}));

import { resolveHostProject, canonicalDomainForSlug, isActiveCustomDomainOrigin } from '@/lib/project-host';
import { proxy } from './proxy';

const get = (url: string, init: { method?: string; headers?: Record<string, string> } = {}) =>
  new NextRequest(url, { method: init.method ?? 'GET', headers: init.headers });

beforeEach(() => {
  vi.mocked(resolveHostProject).mockReset().mockResolvedValue(null);
  vi.mocked(canonicalDomainForSlug).mockReset().mockResolvedValue(null);
  vi.mocked(isActiveCustomDomainOrigin).mockReset().mockResolvedValue(false);
});

describe('proxy: dominios por proyecto', () => {
  it('dominio propio: reescribe por dentro a /proyecto/[slug] sin redirigir', async () => {
    vi.mocked(resolveHostProject).mockResolvedValue({ slug: 'torre', kind: 'custom' });
    const res = await proxy(get('https://www.torre.com/unidades', { headers: { host: 'www.torre.com' } }));
    expect(res.headers.get('x-middleware-rewrite')).toContain('/proyecto/torre/unidades');
    expect(res.status).toBe(200);
    expect(canonicalDomainForSlug).not.toHaveBeenCalled(); // nada de bucles
  });

  it('subdominio de un proyecto con dominio propio: 301 al dominio propio, conservando path y query', async () => {
    vi.mocked(resolveHostProject).mockResolvedValue({ slug: 'torre', kind: 'subdomain' });
    vi.mocked(canonicalDomainForSlug).mockResolvedValue('www.torre.com');
    const res = await proxy(get('https://torre.plataforma.com/unidades?piso=3', { headers: { host: 'torre.plataforma.com' } }));
    expect(res.status).toBe(301);
    expect(res.headers.get('location')).toBe('https://www.torre.com/unidades?piso=3');
  });

  it('/proyecto/[slug]/... en el dominio de la plataforma: 301 al dominio propio sin el prefijo', async () => {
    vi.mocked(canonicalDomainForSlug).mockResolvedValue('www.torre.com');
    const res = await proxy(get('https://app.plataforma.com/proyecto/torre/masterplan', { headers: { host: 'app.plataforma.com' } }));
    expect(res.status).toBe(301);
    expect(res.headers.get('location')).toBe('https://www.torre.com/masterplan');
  });

  it('la landing (/proyecto/[slug]) redirige a la raíz del dominio propio', async () => {
    vi.mocked(canonicalDomainForSlug).mockResolvedValue('www.torre.com');
    const res = await proxy(get('https://app.plataforma.com/proyecto/torre', { headers: { host: 'app.plataforma.com' } }));
    expect(res.headers.get('location')).toBe('https://www.torre.com/');
  });

  it('sin dominio propio activo (o borrador): no redirige', async () => {
    const res = await proxy(get('https://app.plataforma.com/proyecto/torre', { headers: { host: 'app.plataforma.com' } }));
    expect(res.status).toBe(200);
    expect(res.headers.get('location')).toBeNull();
  });

  it('un POST no se redirige', async () => {
    vi.mocked(canonicalDomainForSlug).mockResolvedValue('www.torre.com');
    const res = await proxy(get('https://app.plataforma.com/proyecto/torre', { method: 'POST', headers: { host: 'app.plataforma.com' } }));
    expect(res.headers.get('location')).toBeNull();
  });

  it('el resto del sitio de la plataforma no consulta dominios', async () => {
    await proxy(get('https://app.plataforma.com/feed', { headers: { host: 'app.plataforma.com' } }));
    expect(canonicalDomainForSlug).not.toHaveBeenCalled();
  });
});

describe('proxy: CORS de /api con dominio propio', () => {
  const api = (origin: string) =>
    proxy(get('https://www.torre.com/api/leads', { method: 'POST', headers: { origin, host: 'www.torre.com' } }));

  it('deja pasar el Origin de un dominio propio activo', async () => {
    vi.mocked(isActiveCustomDomainOrigin).mockResolvedValue(true);
    const res = await api('https://www.torre.com');
    expect(res.status).toBe(200);
    expect(res.headers.get('access-control-allow-origin')).toBe('https://www.torre.com');
  });

  it('rechaza con 403 un Origin que no es ni propio ni un dominio activo', async () => {
    const res = await api('https://atacante.com');
    expect(res.status).toBe(403);
  });
});
