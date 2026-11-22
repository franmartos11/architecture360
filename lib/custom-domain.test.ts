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

describe('isExpiredPending', () => {
  it('pendiente con más de 7 días: vencido; con menos, o activo, no', async () => {
    const { isExpiredPending } = await import('./custom-domain');
    const ahora = new Date('2026-11-22T12:00:00Z');
    expect(isExpiredPending({ status: 'pending', created_at: '2026-11-14T11:00:00Z' }, ahora)).toBe(true);
    expect(isExpiredPending({ status: 'pending', created_at: '2026-11-16T12:00:00Z' }, ahora)).toBe(false);
    expect(isExpiredPending({ status: 'active', created_at: '2020-01-01T00:00:00Z' }, ahora)).toBe(false);
    expect(isExpiredPending({ status: 'verified', created_at: '2020-01-01T00:00:00Z' }, ahora)).toBe(false);
  });
});
