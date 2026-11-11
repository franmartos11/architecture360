import { describe, it, expect, afterEach, vi } from 'vitest';

// Igual que project-subdomain.test.ts: ROOT_DOMAIN se lee una sola vez al
// importar el módulo, así que cada escenario necesita su propio import.
async function loadWithRootDomain(rootDomain: string | undefined) {
  vi.resetModules();
  if (rootDomain === undefined) vi.unstubAllEnvs();
  else vi.stubEnv('NEXT_PUBLIC_ROOT_DOMAIN', rootDomain);
  return import('./project-url');
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('getProjectHref', () => {
  it('sin dominio propio: ruta relativa /proyecto/[slug]', async () => {
    const { getProjectHref } = await loadWithRootDomain(undefined);
    expect(getProjectHref('torre-del-mar')).toBe('/proyecto/torre-del-mar');
  });

  it('con dominio propio: URL absoluta por subdominio', async () => {
    const { getProjectHref } = await loadWithRootDomain('midominio.com');
    expect(getProjectHref('torre-del-mar')).toBe('https://torre-del-mar.midominio.com');
  });
});

describe('getProjectDisplayUrl', () => {
  it('sin dominio propio: origin + /proyecto/[slug]', async () => {
    const { getProjectDisplayUrl } = await loadWithRootDomain(undefined);
    expect(getProjectDisplayUrl('torre-del-mar', 'https://app.vercel.app')).toBe(
      'https://app.vercel.app/proyecto/torre-del-mar'
    );
  });

  it('con dominio propio y origin https: subdominio https', async () => {
    const { getProjectDisplayUrl } = await loadWithRootDomain('midominio.com');
    expect(getProjectDisplayUrl('torre-del-mar', 'https://panel.midominio.com')).toBe(
      'https://torre-del-mar.midominio.com'
    );
  });

  it('con dominio propio y origin http (dev): subdominio http', async () => {
    const { getProjectDisplayUrl } = await loadWithRootDomain('midominio.com');
    expect(getProjectDisplayUrl('torre-del-mar', 'http://localhost:3000')).toBe(
      'http://torre-del-mar.midominio.com'
    );
  });
});

describe('con dominio propio activo del proyecto', () => {
  it('getProjectHref: gana sobre /proyecto/[slug] y sobre el subdominio', async () => {
    const sin = await loadWithRootDomain(undefined);
    expect(sin.getProjectHref('torre', 'www.torre.com')).toBe('https://www.torre.com');
    const con = await loadWithRootDomain('midominio.com');
    expect(con.getProjectHref('torre', 'www.torre.com')).toBe('https://www.torre.com');
  });

  it('getProjectDisplayUrl: siempre https y sin importar el origin del panel', async () => {
    const { getProjectDisplayUrl } = await loadWithRootDomain(undefined);
    expect(getProjectDisplayUrl('torre', 'http://localhost:3000', 'www.torre.com')).toBe('https://www.torre.com');
  });

  it('null o vacío se comporta como sin dominio propio', async () => {
    const { getProjectHref, getProjectDisplayUrl } = await loadWithRootDomain(undefined);
    expect(getProjectHref('torre', null)).toBe('/proyecto/torre');
    expect(getProjectHref('torre', '')).toBe('/proyecto/torre');
    expect(getProjectDisplayUrl('torre', 'https://app.vercel.app', null)).toBe('https://app.vercel.app/proyecto/torre');
  });
});
