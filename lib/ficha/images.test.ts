import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import sharp from 'sharp';

vi.mock('server-only', () => ({}));
import { isAllowedImageUrl, loadPdfImage, resolveImageUrl } from './images';

const URL_OK = 'https://abc.supabase.co/storage/v1/object/public/x.webp';

function respond(body: Buffer | string, init: { status?: number; type?: string; length?: number | null } = {}): Response {
  const headers = new Headers({ 'content-type': init.type ?? 'image/webp' });
  if (init.length !== null) headers.set('content-length', String(init.length ?? Buffer.byteLength(body)));
  return new Response(typeof body === 'string' ? body : new Uint8Array(body), { status: init.status ?? 200, headers });
}

const fetchReturning = (r: Response) => vi.fn(async () => r) as unknown as typeof fetch;

const isJpeg = (b: Buffer | null) => !!b && b[0] === 0xff && b[1] === 0xd8;

describe('isAllowedImageUrl', () => {
  it('acepta https de Supabase y Unsplash', () => {
    expect(isAllowedImageUrl(URL_OK)).toBe(true);
    expect(isAllowedImageUrl('https://images.unsplash.com/p.jpg')).toBe(true);
  });

  it('rechaza http, otros hosts, hosts que solo terminan parecido y basura', () => {
    expect(isAllowedImageUrl('http://abc.supabase.co/x.png')).toBe(false);
    expect(isAllowedImageUrl('https://evil.com/x.png')).toBe(false);
    expect(isAllowedImageUrl('https://supabase.co.evil.com/x.png')).toBe(false);
    expect(isAllowedImageUrl('https://169.254.169.254/')).toBe(false);
    expect(isAllowedImageUrl('not a url')).toBe(false);
  });
});

describe('loadPdfImage', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => { errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {}); });
  afterEach(() => errorSpy.mockRestore());

  const loggedFicha = () => errorSpy.mock.calls.some((c: unknown[]) => String(c[0]).startsWith('[ficha]'));

  it('sin url: null', async () => {
    const f = vi.fn() as unknown as typeof fetch;
    expect(await loadPdfImage(undefined, f)).toBeNull();
    expect(await loadPdfImage('', f)).toBeNull();
    expect(f).not.toHaveBeenCalled();
  });

  it('host no permitido: null, sin pedirla y sin loguear', async () => {
    const f = vi.fn() as unknown as typeof fetch;
    expect(await loadPdfImage('https://evil.com/x.png', f)).toBeNull();
    expect(f).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('convierte WebP a JPEG', async () => {
    const webp = await sharp({ create: { width: 40, height: 20, channels: 4, background: '#f00' } }).webp().toBuffer();
    const out = await loadPdfImage(URL_OK, fetchReturning(respond(webp)));
    expect(isJpeg(out)).toBe(true);
    const meta = await sharp(out!).metadata();
    expect([meta.width, meta.height]).toEqual([40, 20]);
  });

  it('convierte SVG a JPEG', async () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10" fill="red"/></svg>';
    const out = await loadPdfImage(URL_OK, fetchReturning(respond(svg, { type: 'image/svg+xml' })));
    expect(isJpeg(out)).toBe(true);
  });

  it('achica a 1600 px de lado mayor', async () => {
    const big = await sharp({ create: { width: 3000, height: 1000, channels: 3, background: '#0f0' } }).png().toBuffer();
    const out = await loadPdfImage(URL_OK, fetchReturning(respond(big, { type: 'image/png' })));
    expect((await sharp(out!).metadata()).width).toBe(1600);
  });

  it('404: null y log', async () => {
    expect(await loadPdfImage(URL_OK, fetchReturning(respond('no', { status: 404 })))).toBeNull();
    expect(loggedFicha()).toBe(true);
  });

  it('content-length de 16 MB: null sin leer el cuerpo', async () => {
    const r = respond('x', { length: 16 * 1024 * 1024 });
    const spy = vi.spyOn(r, 'arrayBuffer');
    expect(await loadPdfImage(URL_OK, fetchReturning(r))).toBeNull();
    expect(spy).not.toHaveBeenCalled();
    expect(loggedFicha()).toBe(true);
  });

  it('cuerpo de más de 15 MB sin content-length: null', async () => {
    const r = respond(Buffer.alloc(15 * 1024 * 1024 + 1), { length: null });
    expect(await loadPdfImage(URL_OK, fetchReturning(r))).toBeNull();
    expect(loggedFicha()).toBe(true);
  });

  it('fetch que falla (timeout): null', async () => {
    const f = vi.fn(async () => { throw new DOMException('timeout', 'TimeoutError'); }) as unknown as typeof fetch;
    expect(await loadPdfImage(URL_OK, f)).toBeNull();
    expect(loggedFicha()).toBe(true);
  });

  it('no sigue redirecciones (un host permitido no puede mandar a otro)', async () => {
    const webp = await sharp({ create: { width: 4, height: 4, channels: 3, background: '#f00' } }).webp().toBuffer();
    const f = vi.fn(async () => respond(webp)) as unknown as typeof fetch;
    await loadPdfImage(URL_OK, f);
    expect((f as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1]).toMatchObject({ redirect: 'error' });
  });

  it('corta la descarga apenas pasa el tope, sin esperar el final del cuerpo', async () => {
    const chunk = new Uint8Array(1024 * 1024);
    let sent = 0;
    const endless = new ReadableStream<Uint8Array>({ pull(c) { sent++; c.enqueue(chunk); } });
    const r = new Response(endless, { headers: { 'content-type': 'image/webp' } });
    expect(await loadPdfImage(URL_OK, fetchReturning(r))).toBeNull();
    expect(sent).toBeLessThan(40);
    expect(loggedFicha()).toBe(true);
  });

  it('bytes que no son imagen: null', async () => {
    expect(await loadPdfImage(URL_OK, fetchReturning(respond('hola, no soy una imagen')))).toBeNull();
    expect(loggedFicha()).toBe(true);
  });
});

describe('resolveImageUrl (rutas del propio sitio)', () => {
  const ORIGIN = 'https://atrium.app';
  it('una ruta relativa se resuelve contra el origen de la app', () => {
    expect(resolveImageUrl('/units/interior-1.jpg', ORIGIN)).toBe('https://atrium.app/units/interior-1.jpg');
  });
  it('protocol-relative y rutas raras no pasan', () => {
    expect(resolveImageUrl('//evil.com/x.png', ORIGIN)).toBeNull();
    expect(resolveImageUrl('/\\evil.com/x.png', ORIGIN)).toBeNull();
    expect(resolveImageUrl('units/x.png', ORIGIN)).toBeNull();
    expect(resolveImageUrl('/api/ficha/x/y', ORIGIN)).toBeNull();
    expect(resolveImageUrl('/api/foto.png', ORIGIN)).toBeNull();
    expect(resolveImageUrl('/units/sin-extension', ORIGIN)).toBeNull();
    expect(resolveImageUrl('/units/A.JPG', ORIGIN)).toBe('https://atrium.app/units/A.JPG');
  });
  it('absolutas: solo hosts permitidos', () => {
    expect(resolveImageUrl(URL_OK, ORIGIN)).toBe(URL_OK);
    expect(resolveImageUrl('https://evil.com/x.png', ORIGIN)).toBeNull();
  });
  it('loadPdfImage baja la ruta relativa desde el origen', async () => {
    const png = await sharp({ create: { width: 4, height: 4, channels: 3, background: '#00f' } }).png().toBuffer();
    const f = vi.fn(async () => respond(png, { type: 'image/png' })) as unknown as typeof fetch;
    const out = await loadPdfImage('/units/interior-1.jpg', f, ORIGIN);
    expect(isJpeg(out)).toBe(true);
    expect((f as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe('https://atrium.app/units/interior-1.jpg');
  });
});
