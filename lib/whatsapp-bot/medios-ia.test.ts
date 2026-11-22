import { describe, expect, it, vi } from 'vitest';
import type { WaMensaje } from '@/types/whatsapp-bot';
import { MAX_IMAGENES_IA, TOPE_IMAGEN_IA_BYTES, prepararMediosIa } from './medios-ia';

let n = 0;
const msg = (o: Partial<WaMensaje>): WaMensaje => ({
  id: `m${++n}`, conversacion_id: 'c1', wa_id: null, direccion: 'entrante', autor: 'cliente', tipo: 'texto',
  cuerpo: null, media_path: null, enviado_at: `2026-11-20T10:00:${String(n).padStart(2, '0')}.000Z`, ack: null,
  created_at: '2026-11-20T10:00:00.000Z', orden_at: null, salida_id: null, ...o,
});
const bytes = (k: number) => ({ data: new Uint8Array(k).fill(7), mime: 'image/jpeg' });

describe('prepararMediosIa', () => {
  it('baja solo las imágenes más nuevas del cliente, con tipo por extensión', async () => {
    const ms = Array.from({ length: MAX_IMAGENES_IA + 2 }, (_, i) => msg({ tipo: 'imagen', media_path: `p/c/${i}.jpg` }));
    ms.push(msg({ tipo: 'imagen', media_path: 'p/c/x.heic' }), msg({ tipo: 'imagen', autor: 'bot', media_path: 'p/c/b.png' }));
    const bajar = vi.fn(async () => bytes(10));
    const r = await prepararMediosIa(ms, { bajar });
    expect(r.imagenes.size).toBe(MAX_IMAGENES_IA);
    expect([...r.imagenes.keys()]).toEqual(ms.slice(2, MAX_IMAGENES_IA + 2).map(m => m.id).reverse());
    expect(r.imagenes.get(ms[4].id)).toEqual({ mediaType: 'image/jpeg', data: Buffer.from(new Uint8Array(10).fill(7)).toString('base64') });
    expect(bajar).not.toHaveBeenCalledWith('p/c/x.heic');
    expect(bajar).not.toHaveBeenCalledWith('p/c/b.png');
  });

  it('saltea imágenes de más de 5 MB y sigue si una bajada falla', async () => {
    const a = msg({ tipo: 'imagen', media_path: 'a.png' });
    const b = msg({ tipo: 'imagen', media_path: 'b.png' });
    const c = msg({ tipo: 'imagen', media_path: 'c.png' });
    const log = vi.fn();
    const bajar = vi.fn(async (p: string) => {
      if (p === 'c.png') return bytes(TOPE_IMAGEN_IA_BYTES + 1);
      if (p === 'b.png') throw new Error('red');
      return bytes(3);
    });
    const r = await prepararMediosIa([a, b, c], { bajar, log });
    expect([...r.imagenes.keys()]).toEqual([a.id]);
    expect(log).toHaveBeenCalledWith(expect.stringContaining('red'));
  });

  it('transcribe audios sin texto, guarda la transcripción y la pone en el mensaje', async () => {
    const audio = msg({ tipo: 'audio', media_path: 'p/c/a.ogg' });
    const yaHecho = msg({ tipo: 'audio', media_path: 'p/c/b.ogg', transcripcion: 'ya estaba' });
    const transcribir = vi.fn(async () => ' Hola, quiero ver el 2B ');
    const guardarTranscripcion = vi.fn(async () => {});
    const r = await prepararMediosIa([audio, yaHecho], {
      bajar: async () => ({ data: new Uint8Array(5), mime: 'audio/ogg; codecs=opus' }),
      transcribir,
      guardarTranscripcion,
    });
    expect(transcribir).toHaveBeenCalledTimes(1);
    expect(transcribir).toHaveBeenCalledWith(expect.objectContaining({ mime: 'audio/ogg; codecs=opus', nombre: 'audio.ogg' }));
    expect(guardarTranscripcion).toHaveBeenCalledWith(audio.id, 'Hola, quiero ver el 2B');
    expect(r.mensajes.find(m => m.id === audio.id)?.transcripcion).toBe('Hola, quiero ver el 2B');
  });

  it('sin transcriptor no toca los audios', async () => {
    const audio = msg({ tipo: 'audio', media_path: 'a.ogg' });
    const bajar = vi.fn();
    const r = await prepararMediosIa([audio], { bajar });
    expect(bajar).not.toHaveBeenCalled();
    expect(r.mensajes[0]).toBe(audio);
  });
});
