import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@supabase/ssr', () => ({ createServerClient: vi.fn() }));
vi.mock('@/lib/rate-limit', () => ({ rateLimitOrRespond: vi.fn().mockResolvedValue(null) }));
vi.mock('@/lib/project-host', async () => {
  const actual = await vi.importActual<typeof import('@/lib/project-host')>('@/lib/project-host');
  return {
    isPlatformHost: actual.isPlatformHost,
    normalizeHost: actual.normalizeHost,
    resolveHostProject: vi.fn(),
    canonicalDomainForSlug: vi.fn(),
    isActiveCustomDomainOrigin: vi.fn(),
    isCustomDomainWithoutSite: vi.fn(),
  };
});

import { resolveHostProject, canonicalDomainForSlug, isActiveCustomDomainOrigin, isCustomDomainWithoutSite } from '@/lib/project-host';
import { proxy } from './proxy';

const get = (url: string, init: { method?: string; headers?: Record<string, string> } = {}) =>
  new NextRequest(url, { method: init.method ?? 'GET', headers: init.headers });

beforeEach(() => {
  vi.mocked(resolveHostProject).mockReset().mockResolvedValue(null);
  vi.mocked(canonicalDomainForSlug).mockReset().mockResolvedValue(null);
  vi.mocked(isActiveCustomDomainOrigin).mockReset().mockResolvedValue(false);
  vi.mocked(isCustomDomainWithoutSite).mockReset().mockResolvedValue(false);
});

describe('proxy: dominios por proyecto', () => {
  it('dominio propio: reescribe por dentro a /proyecto/[slug] sin redirigir', async () => {
    vi.mocked(resolveHostProject).mockResolvedValue({ slug: 'torre', kind: 'custom' });
    const res = await proxy(get('https://www.torre.com/unidades', { headers: { host: 'www.torre.com' } }));
    expect(res.headers.get('x-middleware-rewrite')).toContain('/proyecto/torre/unidades');
    expect(res.status).toBe(200);
    expect(canonicalDomainForSlug).not.toHaveBeenCalled(); // nada de bucles
  });

  it('subdominio de un proyecto con dominio propio: 308 al dominio propio, conservando path y query', async () => {
    vi.mocked(resolveHostProject).mockResolvedValue({ slug: 'torre', kind: 'subdomain' });
    vi.mocked(canonicalDomainForSlug).mockResolvedValue('www.torre.com');
    const res = await proxy(get('https://torre.plataforma.com/unidades?piso=3', { headers: { host: 'torre.plataforma.com' } }));
    expect(res.status).toBe(308);
    expect(res.headers.get('location')).toBe('https://www.torre.com/unidades?piso=3');
  });

  it('/proyecto/[slug]/... en el dominio de la plataforma: 308 al dominio propio sin el prefijo', async () => {
    vi.mocked(canonicalDomainForSlug).mockResolvedValue('www.torre.com');
    const res = await proxy(get('https://app.plataforma.com/proyecto/torre/masterplan', { headers: { host: 'app.plataforma.com' } }));
    expect(res.status).toBe(308);
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

describe('proxy: redirección y dominio sin sitio', () => {
  it('la redirección al dominio propio se cachea una hora, no para siempre', async () => {
    vi.mocked(canonicalDomainForSlug).mockResolvedValue('www.torre.com');
    const res = await proxy(get('https://app.plataforma.com/proyecto/torre', { headers: { host: 'app.plataforma.com' } }));
    expect(res.status).toBe(308);
    expect(res.headers.get('cache-control')).toBe('public, max-age=3600');
  });

  it('dominio propio de un proyecto despublicado: "sitio no disponible", no la home de la plataforma', async () => {
    vi.mocked(isCustomDomainWithoutSite).mockResolvedValue(true);
    const res = await proxy(get('https://www.torre.com/', { headers: { host: 'www.torre.com' } }));
    expect(res.headers.get('x-middleware-rewrite')).toContain('/proyecto/_sin-sitio');
  });

  it('un host de la plataforma sin proyecto sigue de largo (la home)', async () => {
    const res = await proxy(get('https://app.plataforma.com/', { headers: { host: 'app.plataforma.com' } }));
    expect(res.headers.get('x-middleware-rewrite')).toBeNull();
    expect(res.status).toBe(200);
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

describe('proxy: el panel no se sirve en el dominio de un cliente', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://app.plataforma.com');
    vi.stubEnv('NEXT_PUBLIC_ROOT_DOMAIN', '');
  });
  afterEach(() => vi.unstubAllEnvs());

  it('/admin en un dominio propio: 307 al mismo path en la plataforma, sin tocar la base', async () => {
    const res = await proxy(get('https://www.torre.com/admin/leads?tab=chats', { headers: { host: 'www.torre.com' } }));
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe('https://app.plataforma.com/admin/leads?tab=chats');
    expect(resolveHostProject).not.toHaveBeenCalled();
  });

  it('también el login (si no, la sesión quedaría en cookies del dominio del cliente)', async () => {
    const res = await proxy(get('https://www.torre.com/admin/login', { headers: { host: 'www.torre.com' } }));
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe('https://app.plataforma.com/admin/login');
  });

  it('/api/admin en un dominio propio: 404', async () => {
    vi.mocked(isActiveCustomDomainOrigin).mockResolvedValue(true);
    const res = await proxy(get('https://www.torre.com/api/admin/leads', { headers: { host: 'www.torre.com', origin: 'https://www.torre.com' } }));
    expect(res.status).toBe(404);
  });

  it('en la plataforma, /admin sigue su camino normal', async () => {
    const res = await proxy(get('https://app.plataforma.com/admin/login', { headers: { host: 'app.plataforma.com' } }));
    expect(res.status).not.toBe(307);
    expect(res.headers.get('location')).toBeNull();
  });

  it('sin NEXT_PUBLIC_SITE_URL no hay a dónde mandarlo: 404', async () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', '');
    const res = await proxy(get('https://www.torre.com/admin', { headers: { host: 'www.torre.com' } }));
    expect(res.status).toBe(404);
  });
});

describe('proxy: idioma en la dirección', () => {
  const idioma = (res: Response) => res.headers.get('x-middleware-request-x-atrium-lang');

  it('subdominio con /en: reescribe a la ruta de siempre en inglés, con la query', async () => {
    vi.mocked(resolveHostProject).mockResolvedValue({ slug: 'torre', kind: 'subdomain' });
    const res = await proxy(get('https://torre.plataforma.com/en/unidades?ref=perez', { headers: { host: 'torre.plataforma.com' } }));
    expect(res.headers.get('x-middleware-rewrite')).toBe('https://torre.plataforma.com/proyecto/torre/unidades?ref=perez');
    expect(idioma(res)).toBe('en');
  });

  it('subdominio con /en solo: la portada en inglés', async () => {
    vi.mocked(resolveHostProject).mockResolvedValue({ slug: 'torre', kind: 'subdomain' });
    const res = await proxy(get('https://torre.plataforma.com/en', { headers: { host: 'torre.plataforma.com' } }));
    expect(res.headers.get('x-middleware-rewrite')).toBe('https://torre.plataforma.com/proyecto/torre');
    expect(idioma(res)).toBe('en');
  });

  it('dominio de la plataforma: /proyecto/torre/en/unidades se reescribe en inglés', async () => {
    const res = await proxy(get('https://app.plataforma.com/proyecto/torre/en/unidades', { headers: { host: 'app.plataforma.com' } }));
    expect(res.headers.get('x-middleware-rewrite')).toBe('https://app.plataforma.com/proyecto/torre/unidades');
    expect(idioma(res)).toBe('en');
  });

  it('sin /en todo sigue igual, en castellano (y un header de afuera se pisa)', async () => {
    const res = await proxy(get('https://app.plataforma.com/proyecto/torre/unidades?ref=perez', { headers: { host: 'app.plataforma.com', 'x-atrium-lang': 'en' } }));
    expect(res.headers.get('x-middleware-rewrite')).toBeNull();
    expect(res.headers.get('location')).toBeNull();
    expect(idioma(res)).toBe('es');
  });

  it('/es/... redirige a la dirección sin prefijo', async () => {
    const res = await proxy(get('https://app.plataforma.com/proyecto/torre/es/unidades?ref=x', { headers: { host: 'app.plataforma.com' } }));
    expect(res.status).toBe(308);
    expect(res.headers.get('location')).toBe('https://app.plataforma.com/proyecto/torre/unidades?ref=x');
    vi.mocked(resolveHostProject).mockResolvedValue({ slug: 'torre', kind: 'subdomain' });
    const r2 = await proxy(get('https://torre.plataforma.com/es', { headers: { host: 'torre.plataforma.com' } }));
    expect(r2.status).toBe(308);
    expect(r2.headers.get('location')).toBe('https://torre.plataforma.com/');
  });

  it('la redirección al dominio propio conserva /en y la query', async () => {
    vi.mocked(canonicalDomainForSlug).mockResolvedValue('www.torre.com');
    const res = await proxy(get('https://app.plataforma.com/proyecto/torre/en/unidades?ref=x', { headers: { host: 'app.plataforma.com' } }));
    expect(res.status).toBe(308);
    expect(res.headers.get('location')).toBe('https://www.torre.com/en/unidades?ref=x');
  });

  it('en el dominio propio, /en se reescribe en inglés', async () => {
    vi.mocked(resolveHostProject).mockResolvedValue({ slug: 'torre', kind: 'custom' });
    const res = await proxy(get('https://www.torre.com/en/amenities', { headers: { host: 'www.torre.com' } }));
    expect(res.headers.get('x-middleware-rewrite')).toBe('https://www.torre.com/proyecto/torre/amenities');
    expect(idioma(res)).toBe('en');
  });
});
