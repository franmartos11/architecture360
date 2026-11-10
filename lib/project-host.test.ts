import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const maybeSingle = vi.fn();
const chain = { select: vi.fn(), eq: vi.fn(), maybeSingle };
chain.select.mockReturnValue(chain);
chain.eq.mockReturnValue(chain);
const from = vi.fn(() => chain);
vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn(() => ({ from })) }));

async function load(env: { rootDomain?: string; siteUrl?: string } = {}) {
  vi.resetModules();
  vi.unstubAllEnvs();
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://x.supabase.co');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon');
  if (env.rootDomain) vi.stubEnv('NEXT_PUBLIC_ROOT_DOMAIN', env.rootDomain);
  if (env.siteUrl) vi.stubEnv('NEXT_PUBLIC_SITE_URL', env.siteUrl);
  return import('./project-host');
}

beforeEach(() => {
  from.mockClear();
  maybeSingle.mockReset();
  chain.select.mockClear();
  chain.eq.mockReset().mockReturnValue(chain); // algunos describe lo redefinen: volver al estado base
});
afterEach(() => vi.unstubAllEnvs());

describe('resolveProjectSlugForHost', () => {
  it('subdominio de la plataforma: resuelve sin tocar la base', async () => {
    const { resolveProjectSlugForHost } = await load({ rootDomain: 'plataforma.com' });
    expect(await resolveProjectSlugForHost('torre.plataforma.com')).toBe('torre');
    expect(from).not.toHaveBeenCalled();
  });

  it('hosts de la plataforma no consultan la base', async () => {
    const { resolveProjectSlugForHost } = await load({ rootDomain: 'plataforma.com', siteUrl: 'https://app.ejemplo.com' });
    for (const h of ['localhost:3000', '127.0.0.1:3000', 'plataforma.com', 'www.plataforma.com', 'mi-app-abc.vercel.app', 'app.ejemplo.com']) {
      expect(await resolveProjectSlugForHost(h)).toBeNull();
    }
    expect(from).not.toHaveBeenCalled();
  });

  it('dominio propio activo: devuelve el slug del proyecto', async () => {
    maybeSingle.mockResolvedValue({ data: { projects: { slug: 'torre-del-mar' } }, error: null });
    const { resolveProjectSlugForHost } = await load({ rootDomain: 'plataforma.com' });
    expect(await resolveProjectSlugForHost('WWW.TorreDelMar.com:443')).toBe('torre-del-mar');
    expect(from).toHaveBeenCalledWith('project_domains');
    expect(chain.eq).toHaveBeenCalledWith('hostname', 'www.torredelmar.com');
    expect(chain.eq).toHaveBeenCalledWith('status', 'active');
  });

  it('acepta el embed como array', async () => {
    maybeSingle.mockResolvedValue({ data: { projects: [{ slug: 'torre' }] }, error: null });
    const { resolveProjectSlugForHost } = await load();
    expect(await resolveProjectSlugForHost('torre.com')).toBe('torre');
  });

  it('dominio desconocido: null, y el resultado (también el negativo) se cachea', async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null });
    const { resolveProjectSlugForHost } = await load();
    expect(await resolveProjectSlugForHost('desconocido.com')).toBeNull();
    expect(await resolveProjectSlugForHost('desconocido.com')).toBeNull();
    expect(from).toHaveBeenCalledTimes(1);
  });

  it('si la consulta falla devuelve null y lo recuerda solo 10 s (no una consulta fallida por pedido)', async () => {
    vi.useFakeTimers();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    maybeSingle.mockResolvedValueOnce({ data: null, error: { message: 'down' } });
    maybeSingle.mockResolvedValueOnce({ data: { projects: { slug: 'torre' } }, error: null });
    const { resolveProjectSlugForHost } = await load();

    expect(await resolveProjectSlugForHost('torre.com')).toBeNull();
    expect(await resolveProjectSlugForHost('torre.com')).toBeNull(); // dentro de los 10 s: sin otra consulta
    expect(from).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(11_000); // se recupera rápido cuando la base vuelve
    expect(await resolveProjectSlugForHost('torre.com')).toBe('torre');
    vi.useRealTimers();
  });

  it('la caché vence a los 60 s', async () => {
    vi.useFakeTimers();
    maybeSingle.mockResolvedValue({ data: { projects: { slug: 'torre' } }, error: null });
    const { resolveProjectSlugForHost } = await load();
    await resolveProjectSlugForHost('torre.com');
    vi.advanceTimersByTime(61_000);
    await resolveProjectSlugForHost('torre.com');
    expect(from).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });
});

describe('canonicalDomainForSlug', () => {
  const order = vi.fn();
  const limit = vi.fn();
  beforeEach(() => {
    order.mockReset().mockReturnValue({ limit });
    limit.mockReset();
    chain.eq.mockReturnValue({ eq: chain.eq, order });
  });

  it('devuelve el dominio activo del proyecto', async () => {
    limit.mockResolvedValue({ data: [{ hostname: 'www.torre.com' }], error: null });
    const { canonicalDomainForSlug } = await load();
    expect(await canonicalDomainForSlug('torre')).toBe('www.torre.com');
  });

  it('sin dominio propio: null, cacheado', async () => {
    limit.mockResolvedValue({ data: [], error: null });
    const { canonicalDomainForSlug } = await load();
    expect(await canonicalDomainForSlug('torre')).toBeNull();
    expect(await canonicalDomainForSlug('torre')).toBeNull();
    expect(from).toHaveBeenCalledTimes(1);
  });

  it('tabla inexistente / base caída: null, y no consulta de nuevo en cada pedido', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    limit.mockResolvedValue({ data: null, error: { message: "Could not find the table 'public.project_domains'" } });
    const { canonicalDomainForSlug } = await load();
    for (let i = 0; i < 5; i++) expect(await canonicalDomainForSlug('torre')).toBeNull();
    expect(from).toHaveBeenCalledTimes(1);
  });
});

describe('isActiveCustomDomainOrigin', () => {
  it('solo https y solo dominios activos', async () => {
    maybeSingle.mockResolvedValue({ data: { projects: { slug: 'torre' } }, error: null });
    const { isActiveCustomDomainOrigin } = await load();
    expect(await isActiveCustomDomainOrigin('https://torre.com')).toBe(true);
    expect(await isActiveCustomDomainOrigin('http://torre.com')).toBe(false);
    expect(await isActiveCustomDomainOrigin(null)).toBe(false);
    expect(await isActiveCustomDomainOrigin('no-es-una-url')).toBe(false);
  });

  it('un dominio no registrado no pasa', async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null });
    const { isActiveCustomDomainOrigin } = await load();
    expect(await isActiveCustomDomainOrigin('https://atacante.com')).toBe(false);
  });
});
