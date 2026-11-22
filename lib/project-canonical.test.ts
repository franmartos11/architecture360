import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/project-host', () => ({ canonicalDomainForSlug: vi.fn() }));

async function load(env: { rootDomain?: string; siteUrl?: string } = {}) {
  vi.resetModules();
  vi.stubEnv('NEXT_PUBLIC_ROOT_DOMAIN', env.rootDomain ?? '');
  vi.stubEnv('NEXT_PUBLIC_SITE_URL', env.siteUrl ?? 'https://app.plataforma.com');
  const host = await import('@/lib/project-host');
  const mod = await import('./project-canonical');
  return { ...mod, canonicalDomainForSlug: vi.mocked(host.canonicalDomainForSlug) };
}

beforeEach(() => vi.unstubAllEnvs());
afterEach(() => vi.unstubAllEnvs());

describe('projectCanonical', () => {
  it('con dominio propio activo: la página en ese dominio', async () => {
    const { projectCanonical, canonicalDomainForSlug } = await load();
    canonicalDomainForSlug.mockResolvedValue('www.torre.com');
    expect(await projectCanonical('torre', '/unidades')).toBe('https://www.torre.com/unidades');
    expect(await projectCanonical('torre')).toBe('https://www.torre.com');
  });

  it('sin dominio propio y sin subdominios: absoluta en el sitio de la plataforma', async () => {
    const { projectCanonical, canonicalDomainForSlug } = await load({ siteUrl: 'https://app.plataforma.com/' });
    canonicalDomainForSlug.mockResolvedValue(null);
    expect(await projectCanonical('torre', '/edificio/b1')).toBe('https://app.plataforma.com/proyecto/torre/edificio/b1');
  });

  it('sin dominio propio y con subdominios de la plataforma: el subdominio', async () => {
    const { projectCanonical, canonicalDomainForSlug } = await load({ rootDomain: 'plataforma.com' });
    canonicalDomainForSlug.mockResolvedValue(null);
    expect(await projectCanonical('torre', '/masterplan')).toBe('https://torre.plataforma.com/masterplan');
  });
});
