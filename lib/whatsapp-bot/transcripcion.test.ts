import { describe, expect, it, vi } from 'vitest';
import { crearTranscriptor, URL_TRANSCRIPCION_DEFAULT } from './transcripcion';

describe('crearTranscriptor', () => {
  it('sin clave no hay transcriptor', () => {
    expect(crearTranscriptor({})).toBeNull();
  });

  it('manda el audio con modelo, idioma y clave; devuelve el texto', async () => {
    const fetchFn = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ text: ' Hola ' })));
    const t = crearTranscriptor({ TRANSCRIPCION_API_KEY: 'k1' }, fetchFn)!;
    expect(await t({ data: new Uint8Array(3), mime: 'audio/ogg', nombre: 'audio.ogg' })).toBe('Hola');
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe(URL_TRANSCRIPCION_DEFAULT);
    expect((init!.headers as Record<string, string>).Authorization).toBe('Bearer k1');
    const form = init!.body as FormData;
    expect(form.get('model')).toBe('whisper-1');
    expect(form.get('language')).toBe('es');
    expect(form.get('file')).toBeInstanceOf(Blob);
  });

  it('URL y modelo configurables; error HTTP tira con el detalle', async () => {
    const fetchFn = vi.fn<typeof fetch>(async () => new Response('cuota', { status: 429 }));
    const t = crearTranscriptor(
      { TRANSCRIPCION_API_KEY: 'k', TRANSCRIPCION_URL: 'https://otro/v1/audio/transcriptions', TRANSCRIPCION_MODELO: 'm2' },
      fetchFn,
    )!;
    await expect(t({ data: new Uint8Array(1), mime: 'audio/ogg', nombre: 'a.ogg' })).rejects.toThrow(/429.*cuota/);
    expect(fetchFn.mock.calls[0][0]).toBe('https://otro/v1/audio/transcriptions');
  });
});
