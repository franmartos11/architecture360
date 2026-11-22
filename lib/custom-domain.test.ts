import { describe, it, expect, vi, beforeEach } from 'vitest';

beforeEach(() => {
  vi.resetModules();
  vi.unstubAllEnvs();
  vi.stubEnv('NEXT_PUBLIC_ROOT_DOMAIN', 'plataforma.com');
});

describe('parseCustomHostname', () => {
  it('limpia protocolo, path, puerto, mayúsculas y punto final', async () => {
    const { parseCustomHostname } = await import('./custom-domain');
    expect(parseCustomHostname('  HTTPS://WWW.Torre.com:443/inicio?x=1 ')).toEqual({ hostname: 'www.torre.com' });
    expect(parseCustomHostname('torre.com.')).toEqual({ hostname: 'torre.com' });
  });

  it.each(['', 'sin-punto', 'a..b.com', '-torre.com', 'torre_x.com', 'torre .com', 'localhost', '192.168.0.1'])(
    'rechaza %j',
    async input => {
      const { parseCustomHostname } = await import('./custom-domain');
      expect('error' in parseCustomHostname(input)).toBe(true);
    }
  );

  it('rechaza los dominios de la plataforma y *.vercel.app', async () => {
    const { parseCustomHostname } = await import('./custom-domain');
    expect('error' in parseCustomHostname('torre.plataforma.com')).toBe(true);
    expect('error' in parseCustomHostname('plataforma.com')).toBe(true);
    expect('error' in parseCustomHostname('mi-app.vercel.app')).toBe(true);
  });

  it('sin NEXT_PUBLIC_ROOT_DOMAIN: rechaza el dominio del sitio con y sin www y sus subdominios', async () => {
    vi.unstubAllEnvs();
    vi.stubEnv('NEXT_PUBLIC_ROOT_DOMAIN', '');
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://www.plataforma.com');
    const { parseCustomHostname } = await import('./custom-domain');
    for (const host of ['plataforma.com', 'www.plataforma.com', 'torre.plataforma.com']) {
      expect('error' in parseCustomHostname(host)).toBe(true);
    }
    expect(parseCustomHostname('www.torre.com')).toEqual({ hostname: 'www.torre.com' });
    // Que termine igual no alcanza: tiene que ser un subdominio.
    expect(parseCustomHostname('miplataforma.com')).toEqual({ hostname: 'miplataforma.com' });
  });

  it('rechaza una etiqueta de más de 63 caracteres', async () => {
    const { parseCustomHostname } = await import('./custom-domain');
    expect('error' in parseCustomHostname(`${'a'.repeat(64)}.com`)).toBe(true);
  });
});
