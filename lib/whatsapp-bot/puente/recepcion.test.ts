import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type * as Repo from '../repo';
import { extensionDeMime, procesarMensaje, rutaMedio, type DepsRecepcion } from './recepcion';
import { crearSerie } from './serie';
import { botPrueba, convPrueba, entrantePrueba } from './prueba-fixtures';

const AHORA = new Date('2026-11-20T15:00:00.000Z');
const HORA = 60 * 60 * 1000;

function deps(p: Omit<Partial<DepsRecepcion>, 'repo'> = {}) {
  const repo = {
    obtenerOCrearConversacion: vi.fn<typeof Repo.obtenerOCrearConversacion>(async () => convPrueba()),
    guardarMensaje: vi.fn<typeof Repo.guardarMensaje>(async () => 'nuevo'),
    ponerModoHumano: vi.fn(async () => {}),
  };
  const d = {
    repo,
    sb: {} as SupabaseClient,
    bot: botPrueba(),
    subirMedio: vi.fn(async (convId: string, waId: string) => `proj1/${convId}/${waId}.ogg`),
    esDeLaCola: vi.fn<(waId: string) => boolean>(() => false),
    esEnvioEnCurso: vi.fn(() => false),
    agrupador: { avisar: vi.fn() },
    ahora: () => AHORA,
    log: vi.fn(),
    ...p,
  };
  return d;
}

describe('procesarMensaje', () => {
  it('un grupo no guarda nada', async () => {
    const d = deps();
    await procesarMensaje(d, entrantePrueba({ esGrupo: true, wid: '1203@g.us', numero: null }));
    expect(d.repo.obtenerOCrearConversacion).not.toHaveBeenCalled();
    expect(d.repo.guardarMensaje).not.toHaveBeenCalled();
    expect(d.agrupador.avisar).not.toHaveBeenCalled();
  });

  it('un estado no guarda nada', async () => {
    const d = deps();
    await procesarMensaje(d, entrantePrueba({ esEstado: true, wid: 'status@broadcast', numero: null }));
    expect(d.repo.obtenerOCrearConversacion).not.toHaveBeenCalled();
    expect(d.repo.guardarMensaje).not.toHaveBeenCalled();
  });

  it('deMi con un waId que mandó la cola: no hace nada', async () => {
    const d = deps({ esDeLaCola: vi.fn(() => true) });
    await procesarMensaje(d, entrantePrueba({ deMi: true, waId: 'true_x_1' }));
    expect(d.esDeLaCola).toHaveBeenCalledWith('true_x_1');
    expect(d.repo.obtenerOCrearConversacion).not.toHaveBeenCalled();
    expect(d.repo.guardarMensaje).not.toHaveBeenCalled();
    expect(d.repo.ponerModoHumano).not.toHaveBeenCalled();
  });

  it('deMi que coincide con un envío en curso (eco antes de saber el waId): no hace nada', async () => {
    const d = deps({ esEnvioEnCurso: vi.fn(() => true) });
    const m = entrantePrueba({ deMi: true, waId: 'true_x_1' });
    await procesarMensaje(d, m);
    expect(d.esEnvioEnCurso).toHaveBeenCalledWith(m);
    expect(d.repo.guardarMensaje).not.toHaveBeenCalled();
    expect(d.repo.ponerModoHumano).not.toHaveBeenCalled();
  });

  it('deMi que no es de la cola: lo escribieron desde el teléfono → autor telefono y modo humano 12 h', async () => {
    const d = deps();
    await procesarMensaje(d, entrantePrueba({ deMi: true, nombre: null, waId: 'true_x_9', cuerpo: 'Te llamo' }));
    expect(d.repo.guardarMensaje).toHaveBeenCalledWith(d.sb, {
      conversacion_id: 'conv1',
      wa_id: 'true_x_9',
      direccion: 'saliente',
      autor: 'telefono',
      tipo: 'texto',
      cuerpo: 'Te llamo',
      media_path: null,
      enviado_at: '2026-11-20T14:57:00.000Z',
      ack: null,
    });
    expect(d.repo.ponerModoHumano).toHaveBeenCalledWith(d.sb, 'conv1', new Date(AHORA.getTime() + 12 * HORA));
    expect(d.agrupador.avisar).not.toHaveBeenCalled();
  });

  it('entrante normal: busca/crea la conversación, guarda y avisa al agrupador', async () => {
    const d = deps();
    await procesarMensaje(d, entrantePrueba());
    expect(d.repo.obtenerOCrearConversacion).toHaveBeenCalledWith(
      d.sb,
      d.bot,
      { numero: '5491155551234', wid: '5491155551234@c.us', nombre: 'Ana' },
      new Date('2026-11-20T14:57:00.000Z'),
      {},
    );
    expect(d.repo.guardarMensaje).toHaveBeenCalledWith(d.sb, {
      conversacion_id: 'conv1',
      wa_id: 'false_5491155551234@c.us_ABC',
      direccion: 'entrante',
      autor: 'cliente',
      tipo: 'texto',
      cuerpo: 'Hola, ¿qué unidades tienen?',
      media_path: null,
      enviado_at: '2026-11-20T14:57:00.000Z',
      ack: null,
    });
    expect(d.agrupador.avisar).toHaveBeenCalledWith('conv1');
    expect(d.repo.ponerModoHumano).not.toHaveBeenCalled();
  });

  it('la clave de la conversación es el número normalizado; un @lid sin resolver usa el wid', async () => {
    const d = deps();
    await procesarMensaje(d, entrantePrueba({ wid: '5491155551234@c.us', numero: '541155551234' }));
    expect(d.repo.obtenerOCrearConversacion.mock.calls[0][2]).toMatchObject({ numero: '5491155551234' });

    const d2 = deps();
    await procesarMensaje(d2, entrantePrueba({ wid: '12345678901234@lid', numero: null }));
    expect(d2.repo.obtenerOCrearConversacion.mock.calls[0][2]).toEqual({
      numero: '12345678901234@lid',
      wid: '12345678901234@lid',
      nombre: 'Ana',
    });
  });

  it('entrante duplicado: no avisa', async () => {
    const d = deps();
    d.repo.guardarMensaje.mockResolvedValueOnce('duplicado');
    await procesarMensaje(d, entrantePrueba());
    expect(d.agrupador.avisar).not.toHaveBeenCalled();
  });

  it('audio: sube el medio, guarda tipo audio con media_path y avisa', async () => {
    const audio = { mime: 'audio/ogg; codecs=opus', data: Buffer.from('ogg') };
    const d = deps();
    await procesarMensaje(d, entrantePrueba({ tipo: 'audio', cuerpo: '', descargarMedio: async () => audio }));
    expect(d.subirMedio).toHaveBeenCalledWith('conv1', 'false_5491155551234@c.us_ABC', audio);
    expect(d.repo.guardarMensaje.mock.calls[0][1]).toMatchObject({
      tipo: 'audio',
      cuerpo: null,
      media_path: 'proj1/conv1/false_5491155551234@c.us_ABC.ogg',
    });
    expect(d.agrupador.avisar).toHaveBeenCalledWith('conv1');
  });

  it('si el medio no se pudo bajar o subir, guarda el mensaje igual sin media_path', async () => {
    const d = deps({ subirMedio: vi.fn(async () => Promise.reject(new Error('storage caído'))) });
    await procesarMensaje(
      d,
      entrantePrueba({ tipo: 'imagen', cuerpo: 'esta', descargarMedio: async () => ({ mime: 'image/jpeg', data: Buffer.from('x') }) }),
    );
    expect(d.repo.guardarMensaje.mock.calls[0][1]).toMatchObject({ tipo: 'imagen', cuerpo: 'esta', media_path: null });
    expect(d.agrupador.avisar).toHaveBeenCalled();

    const d2 = deps();
    await procesarMensaje(d2, entrantePrueba({ tipo: 'audio', cuerpo: '', descargarMedio: async () => null }));
    expect(d2.subirMedio).not.toHaveBeenCalled();
    expect(d2.repo.guardarMensaje.mock.calls[0][1]).toMatchObject({ tipo: 'audio', media_path: null });
  });

  it('con enSerie, dos mensajes de la misma conversación se guardan de a uno', async () => {
    const d = deps({ enSerie: crearSerie() });
    let enCurso = 0;
    let max = 0;
    d.repo.guardarMensaje.mockImplementation(async () => {
      enCurso++;
      max = Math.max(max, enCurso);
      await new Promise((r) => setTimeout(r, 5));
      enCurso--;
      return 'nuevo';
    });
    await Promise.all([
      procesarMensaje(d, entrantePrueba({ waId: 'a' })),
      procesarMensaje(d, entrantePrueba({ waId: 'b' })),
    ]);
    expect(d.repo.guardarMensaje).toHaveBeenCalledTimes(2);
    expect(max).toBe(1);
  });
});

describe('rutaMedio / extensionDeMime', () => {
  it('arma <project_id>/<conv_id>/<waId>.<ext>', () => {
    expect(rutaMedio('proj1', 'conv1', 'false_549@c.us_3EB0', 'image/jpeg')).toBe('proj1/conv1/false_549@c.us_3EB0.jpg');
  });

  it('limpia caracteres raros del waId', () => {
    expect(rutaMedio('p', 'c', 'false_549@c.us_A/B?C', 'audio/ogg')).toBe('p/c/false_549@c.us_A_B_C.ogg');
  });

  it('extensiones comunes y desconocidas', () => {
    expect(extensionDeMime('audio/ogg; codecs=opus')).toBe('ogg');
    expect(extensionDeMime('image/png')).toBe('png');
    expect(extensionDeMime('application/pdf')).toBe('pdf');
    expect(extensionDeMime('audio/mpeg')).toBe('mp3');
    expect(extensionDeMime('application/x-raro')).toBe('bin');
    expect(extensionDeMime('')).toBe('bin');
  });

  it('al crear la conversación le pregunta a WhatsApp Web por historial previo de ese chat', async () => {
    const historialPrevio = vi.fn(async () => true);
    const d = deps({ historialPrevio });
    await procesarMensaje(d, entrantePrueba());
    const opciones = d.repo.obtenerOCrearConversacion.mock.calls[0][4];
    expect(historialPrevio).not.toHaveBeenCalled();
    const vinculo = new Date('2026-11-10T12:00:00.000Z');
    expect(await opciones?.tieneHistorialPrevio?.(vinculo)).toBe(true);
    expect(historialPrevio).toHaveBeenCalledWith('5491155551234@c.us', vinculo);
  });
});
