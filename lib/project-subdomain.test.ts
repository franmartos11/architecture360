import { describe, it, expect, afterEach, vi } from 'vitest';

// ROOT_DOMAIN se lee de process.env al importar el módulo (una sola vez),
// no en cada llamada — así que cada test necesita su propio import fresco
// después de fijar (o borrar) la env var, si no todos comparten el valor
// que haya quedado cacheado del primer import.
async function loadWithRootDomain(rootDomain: string | undefined) {
  vi.resetModules();
  if (rootDomain === undefined) vi.unstubAllEnvs();
  else vi.stubEnv('NEXT_PUBLIC_ROOT_DOMAIN', rootDomain);
  return import('./project-subdomain');
}

describe('resolveProjectSlugFromHost', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('sin NEXT_PUBLIC_ROOT_DOMAIN configurado, siempre devuelve null', async () => {
    const { resolveProjectSlugFromHost } = await loadWithRootDomain(undefined);
    expect(resolveProjectSlugFromHost('mi-proyecto.midominio.com')).toBeNull();
  });

  describe('con NEXT_PUBLIC_ROOT_DOMAIN=midominio.com', () => {
    it('el dominio raíz mismo no es un subdominio de proyecto', async () => {
      const { resolveProjectSlugFromHost } = await loadWithRootDomain('midominio.com');
      expect(resolveProjectSlugFromHost('midominio.com')).toBeNull();
    });

    it('"www" no es un subdominio de proyecto', async () => {
      const { resolveProjectSlugFromHost } = await loadWithRootDomain('midominio.com');
      expect(resolveProjectSlugFromHost('www.midominio.com')).toBeNull();
    });

    it('un subdominio de un nivel es el slug del proyecto', async () => {
      const { resolveProjectSlugFromHost } = await loadWithRootDomain('midominio.com');
      expect(resolveProjectSlugFromHost('mi-proyecto.midominio.com')).toBe('mi-proyecto');
    });

    it('ignora el puerto y normaliza a minúsculas', async () => {
      const { resolveProjectSlugFromHost } = await loadWithRootDomain('midominio.com');
      expect(resolveProjectSlugFromHost('Mi-Proyecto.midominio.com:3000')).toBe('mi-proyecto');
    });

    it('un subdominio de dos niveles no se trata como slug', async () => {
      const { resolveProjectSlugFromHost } = await loadWithRootDomain('midominio.com');
      expect(resolveProjectSlugFromHost('a.b.midominio.com')).toBeNull();
    });

    it('un host de otro dominio (o preview de vercel.app) no matchea', async () => {
      const { resolveProjectSlugFromHost } = await loadWithRootDomain('midominio.com');
      expect(resolveProjectSlugFromHost('my-app-abc123.vercel.app')).toBeNull();
      expect(resolveProjectSlugFromHost('otrodominio.com')).toBeNull();
    });
  });
});
