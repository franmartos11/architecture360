import { describe, it, expect, vi, afterEach } from 'vitest';
import { uploadViaSignedUrl } from './signed-upload';

const SIGNED = 'https://xxx.supabase.co/storage/v1/object/upload/sign/units/a.png?token=t';

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

describe('uploadViaSignedUrl', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('pide la URL con los datos del archivo (no el archivo) y después hace PUT directo a Supabase', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ signedUrl: SIGNED, contentType: 'image/png', url: 'https://pub/a.png', path: 'units/a.png' }))
      .mockResolvedValueOnce(jsonResponse({ Key: 'project-media/units/a.png' }));
    vi.stubGlobal('fetch', fetchMock);
    const file = new File([new Uint8Array(10)], 'render.png', { type: 'image/png' });

    const result = await uploadViaSignedUrl<{ url: string; path: string }>('/api/admin/upload', file, { folder: 'units' });

    expect(result).toEqual({ ok: true, data: { url: 'https://pub/a.png', path: 'units/a.png' } });
    const [endpoint, init] = fetchMock.mock.calls[0];
    expect(endpoint).toBe('/api/admin/upload');
    expect(JSON.parse(init.body)).toEqual({ name: 'render.png', type: 'image/png', size: 10, folder: 'units' });
    const [putUrl, putInit] = fetchMock.mock.calls[1];
    expect(putUrl).toBe(SIGNED);
    expect(putInit.method).toBe('PUT');
    expect(putInit.body).toBe(file);
    expect(putInit.headers['content-type']).toBe('image/png');
  });

  it('la ruta rechaza (tipo/peso): devuelve su error y no intenta subir', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({ error: 'El archivo pesa más de 15MB' }, 400));
    vi.stubGlobal('fetch', fetchMock);

    const result = await uploadViaSignedUrl('/api/admin/upload', new File(['x'], 'a.png', { type: 'image/png' }));

    expect(result).toEqual({ ok: false, error: 'El archivo pesa más de 15MB' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('Supabase rechaza el PUT (ej. 413 por límite del bucket): devuelve el message de Supabase', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(jsonResponse({ signedUrl: SIGNED, url: 'u' }))
      .mockResolvedValueOnce(jsonResponse({ statusCode: '413', error: 'Payload too large', message: 'The object exceeded the maximum allowed size' }, 413)));

    const result = await uploadViaSignedUrl('/api/admin/upload', new File(['x'], 'a.png', { type: 'image/png' }));

    expect(result).toEqual({ ok: false, error: 'The object exceeded the maximum allowed size' });
  });

  it('error de red: mensaje de conexión, sin tirar excepción', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

    const result = await uploadViaSignedUrl('/api/admin/upload', new File(['x'], 'a.png', { type: 'image/png' }));

    expect(result).toEqual({ ok: false, error: 'Error de conexión al subir el archivo' });
  });
});
