import { describe, expect, it, vi } from 'vitest';
import { EnvioImposible } from './tope';
import { bajarAdjunto, esIpPrivada, hostDeSupabase, validarUrlAdjunto, type DepsBajada } from './url-segura';

const SUPA = 'abc123.supabase.co';
const URL_SUPA = `https://${SUPA}/storage/v1/object/public/unidades/2b-1.jpg`;

function depsValidar(ips: Record<string, string[]> = {}) {
  return {
    hostSupabase: SUPA,
    resolver: vi.fn(async (host: string) => {
      if (!(host in ips)) throw new Error('ENOTFOUND');
      return ips[host];
    }),
  };
}

describe('esIpPrivada', () => {
  it.each([
    '127.0.0.1',
    '10.1.2.3',
    '172.16.0.1',
    '172.31.255.255',
    '192.168.1.10',
    '169.254.169.254',
    '100.64.0.1',
    '0.0.0.0',
    '224.0.0.1',
    '255.255.255.255',
    '::',
    '::1',
    'fe80::1',
    'fc00::1',
    'fd00:ec2::254',
    '::ffff:127.0.0.1',
    '::ffff:169.254.169.254',
    '::ffff:7f00:1',
    '64:ff9b::a9fe:a9fe',
    'ff02::1',
    '2001:db8::1',
    'no-es-ip',
  ])('privada / reservada: %s', (ip) => expect(esIpPrivada(ip)).toBe(true));

  it.each(['8.8.8.8', '104.18.1.1', '172.32.0.1', '2606:4700::6810:84e5', '::ffff:8.8.8.8'])('pública: %s', (ip) =>
    expect(esIpPrivada(ip)).toBe(false));
});

describe('hostDeSupabase', () => {
  it('toma el host de la URL; null si falta o no es URL', () => {
    expect(hostDeSupabase('https://ABC123.supabase.co')).toBe(SUPA);
    expect(hostDeSupabase(undefined)).toBeNull();
    expect(hostDeSupabase('nada')).toBeNull();
  });
});

describe('validarUrlAdjunto', () => {
  it('el Storage de Supabase del proyecto pasa sin consultar DNS', async () => {
    const d = depsValidar();
    await expect(validarUrlAdjunto(URL_SUPA, d)).resolves.toBeInstanceOf(URL);
    expect(d.resolver).not.toHaveBeenCalled();
  });

  it('otro host que resuelve a IPs públicas pasa', async () => {
    const d = depsValidar({ 'cdn.ejemplo.com': ['93.184.216.34', '2606:2800:220:1::1'] });
    await expect(validarUrlAdjunto('https://cdn.ejemplo.com/a.jpg', d)).resolves.toBeInstanceOf(URL);
  });

  it.each([
    ['http (no https)', 'http://cdn.ejemplo.com/a.jpg'],
    ['file:', 'file:///etc/passwd'],
    ['con usuario', 'https://user:pass@cdn.ejemplo.com/a.jpg'],
    ['puerto raro', 'https://cdn.ejemplo.com:8443/a.jpg'],
    ['loopback literal', 'https://127.0.0.1/a.jpg'],
    ['metadata literal', 'https://169.254.169.254/latest/meta-data/'],
    ['IPv6 loopback literal', 'https://[::1]/a.jpg'],
    ['IPv4 mapeada en IPv6', 'https://[::ffff:10.0.0.1]/a.jpg'],
    ['no es URL', 'esto no es una url'],
  ])('rechaza (%s) sin reintento', async (_c, url) => {
    await expect(validarUrlAdjunto(url, depsValidar())).rejects.toBeInstanceOf(EnvioImposible);
  });

  it('un nombre que resuelve (aunque sea en parte) a una IP privada se rechaza', async () => {
    const d = depsValidar({ 'interno.ejemplo.com': ['93.184.216.34', '10.0.0.5'] });
    await expect(validarUrlAdjunto('https://interno.ejemplo.com/a.jpg', d)).rejects.toBeInstanceOf(EnvioImposible);
  });

  it('un host del mismo dominio que Supabase pero distinto no tiene pase libre', async () => {
    const d = depsValidar({ 'otro.supabase.co': ['127.0.0.1'] });
    await expect(validarUrlAdjunto('https://otro.supabase.co/a.jpg', d)).rejects.toBeInstanceOf(EnvioImposible);
  });

  it('si el DNS falla es un error común (se puede reintentar)', async () => {
    const e = await validarUrlAdjunto('https://no-existe.ejemplo.com/a.jpg', depsValidar()).catch((x: unknown) => x);
    expect(e).toBeInstanceOf(Error);
    expect(e).not.toBeInstanceOf(EnvioImposible);
  });
});

// ─── bajarAdjunto con un fetch falso ───

function respuesta(cuerpo: Uint8Array | null, headers: Record<string, string>, status = 200): Response {
  return new Response(cuerpo as BodyInit | null, { status, headers });
}

function depsBajada(fetchImpl: DepsBajada['fetch'], extra: Partial<DepsBajada> = {}): DepsBajada {
  return { ...depsValidar(), fetch: vi.fn(fetchImpl), ...extra };
}

describe('bajarAdjunto', () => {
  it('baja una imagen: sin seguir redirecciones, con señal de corte; devuelve base64, mime y nombre', async () => {
    const d = depsBajada(async () => respuesta(new Uint8Array([1, 2, 3]), { 'content-type': 'image/jpeg', 'content-length': '3' }));
    const r = await bajarAdjunto(URL_SUPA, d);
    expect(r).toEqual({ mime: 'image/jpeg', base64: Buffer.from([1, 2, 3]).toString('base64'), nombre: '2b-1.jpg' });
    const [, init] = (d.fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(init.redirect).toBe('error');
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('acepta PDF', async () => {
    const d = depsBajada(async () => respuesta(new Uint8Array([37, 80]), { 'content-type': 'application/pdf' }));
    await expect(bajarAdjunto(`https://${SUPA}/plano.pdf`, d)).resolves.toMatchObject({ mime: 'application/pdf' });
  });

  it('no pide nada si la URL no pasa la validación', async () => {
    const d = depsBajada(async () => respuesta(new Uint8Array([1]), { 'content-type': 'image/png' }));
    await expect(bajarAdjunto('https://127.0.0.1/a.png', d)).rejects.toBeInstanceOf(EnvioImposible);
    expect(d.fetch).not.toHaveBeenCalled();
  });

  it('un tipo que no es imagen ni PDF se rechaza', async () => {
    const d = depsBajada(async () => respuesta(new Uint8Array([60]), { 'content-type': 'text/html' }));
    await expect(bajarAdjunto(URL_SUPA, d)).rejects.toBeInstanceOf(EnvioImposible);
  });

  it('Content-Length por encima del tope se rechaza sin leer el cuerpo', async () => {
    const d = depsBajada(
      async () => respuesta(new Uint8Array([1]), { 'content-type': 'image/png', 'content-length': String(17 * 1024 * 1024) }),
    );
    await expect(bajarAdjunto(URL_SUPA, d)).rejects.toThrow(/16 MB/);
  });

  it('sin Content-Length: corta el stream al pasar el tope', async () => {
    let leidos = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(c) {
        leidos++;
        c.enqueue(new Uint8Array(4));
      },
    });
    const d = depsBajada(async () => new Response(stream, { headers: { 'content-type': 'image/png' } }), { topeBytes: 10 });
    const e = await bajarAdjunto(URL_SUPA, d).catch((x: unknown) => x);
    expect(e).toBeInstanceOf(EnvioImposible);
    expect(leidos).toBeLessThan(10);
  });

  it('una redirección es un rechazo permanente', async () => {
    const d = depsBajada(async () => {
      throw new TypeError('fetch failed', { cause: new Error('unexpected redirect') });
    });
    await expect(bajarAdjunto(URL_SUPA, d)).rejects.toBeInstanceOf(EnvioImposible);
  });

  it('un 404 es permanente; un 503 se puede reintentar', async () => {
    const d404 = depsBajada(async () => respuesta(null, {}, 404));
    await expect(bajarAdjunto(URL_SUPA, d404)).rejects.toBeInstanceOf(EnvioImposible);
    const d503 = depsBajada(async () => respuesta(null, {}, 503));
    const e = await bajarAdjunto(URL_SUPA, d503).catch((x: unknown) => x);
    expect(e).toBeInstanceOf(Error);
    expect(e).not.toBeInstanceOf(EnvioImposible);
  });

  it('se corta a los 45 s (error común: se puede reintentar)', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const d = depsBajada(
        (_url, init) =>
          new Promise<Response>((_, rechazar) => {
            init?.signal?.addEventListener('abort', () => rechazar(new DOMException('aborted', 'AbortError')));
          }),
      );
      const r = bajarAdjunto(URL_SUPA, d).catch((x: unknown) => x);
      await vi.advanceTimersByTimeAsync(45_000);
      const e = await r;
      expect(e).toBeInstanceOf(Error);
      expect(e).not.toBeInstanceOf(EnvioImposible);
      expect((e as Error).message).toMatch(/a tiempo/);
    } finally {
      vi.useRealTimers();
    }
  });
});
