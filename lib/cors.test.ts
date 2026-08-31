import { describe, it, expect, afterEach, vi } from 'vitest';

// ROOT_DOMAIN se lee una sola vez al importar el módulo (igual que en
// project-subdomain.ts/project-url.ts) — se reimporta fresco por escenario.
async function load(env: { rootDomain?: string; vercelUrl?: string; nodeEnv?: string }) {
  vi.resetModules();
  vi.unstubAllEnvs();
  if (env.rootDomain) vi.stubEnv('NEXT_PUBLIC_ROOT_DOMAIN', env.rootDomain);
  if (env.vercelUrl) vi.stubEnv('VERCEL_URL', env.vercelUrl);
  if (env.nodeEnv) vi.stubEnv('NODE_ENV', env.nodeEnv);
  return import('./cors');
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('isAllowedOrigin', () => {
  it('sin Origin (curl, server-to-server) siempre se deja pasar', async () => {
    const { isAllowedOrigin } = await load({});
    expect(isAllowedOrigin(null)).toBe(true);
  });

  it('localhost está permitido fuera de producción', async () => {
    const { isAllowedOrigin } = await load({ nodeEnv: 'development' });
    expect(isAllowedOrigin('http://localhost:3000')).toBe(true);
    expect(isAllowedOrigin('http://127.0.0.1:3000')).toBe(true);
  });

  it('localhost NO está permitido en producción', async () => {
    const { isAllowedOrigin } = await load({ nodeEnv: 'production' });
    expect(isAllowedOrigin('http://localhost:3000')).toBe(false);
  });

  it('el propio deploy de Vercel está permitido', async () => {
    const { isAllowedOrigin } = await load({ vercelUrl: 'my-app-abc123.vercel.app', nodeEnv: 'production' });
    expect(isAllowedOrigin('https://my-app-abc123.vercel.app')).toBe(true);
  });

  it('el dominio propio y sus subdominios están permitidos (solo https)', async () => {
    const { isAllowedOrigin } = await load({ rootDomain: 'midominio.com', nodeEnv: 'production' });
    expect(isAllowedOrigin('https://midominio.com')).toBe(true);
    expect(isAllowedOrigin('https://www.midominio.com')).toBe(true);
    expect(isAllowedOrigin('https://torre-del-mar.midominio.com')).toBe(true);
    expect(isAllowedOrigin('http://midominio.com')).toBe(false);
  });

  it('un origin de otro sitio no está permitido', async () => {
    const { isAllowedOrigin } = await load({ rootDomain: 'midominio.com', nodeEnv: 'production' });
    expect(isAllowedOrigin('https://sitio-malicioso.com')).toBe(false);
  });

  it('un Origin mal formado no rompe, solo se rechaza', async () => {
    const { isAllowedOrigin } = await load({ rootDomain: 'midominio.com', nodeEnv: 'production' });
    expect(isAllowedOrigin('no-es-una-url')).toBe(false);
  });
});

describe('corsHeaders', () => {
  it('sin Origin, sin headers', async () => {
    const { corsHeaders } = await load({});
    expect(corsHeaders(null)).toEqual({});
  });

  it('con Origin, refleja el origin y permite credenciales', async () => {
    const { corsHeaders } = await load({});
    const headers = corsHeaders('https://midominio.com');
    expect(headers['Access-Control-Allow-Origin']).toBe('https://midominio.com');
    expect(headers['Access-Control-Allow-Credentials']).toBe('true');
    expect(headers.Vary).toBe('Origin');
  });
});
