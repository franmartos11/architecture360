import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ProjectRow } from '@/types/database';
import type { WaMensaje } from '@/types/whatsapp-bot';
import type { DatosProyecto, UnidadBot } from '../ficha';
import type { DepsHerramientas } from '../ia/herramientas';
import type { ResultadoTurno } from '../ia/turno';
import { correrTurnoIA, hayContestador, type DepsTurnoBot } from './turno-bot';
import { lineaUnidad } from '../ficha';
import { botPrueba, convPrueba, mensajePrueba, salidaPrueba } from './prueba-fixtures';

const AHORA = new Date('2026-11-20T15:00:00.000Z');
/** enviado_at del último mensaje del cliente en HISTORIAL_BASE: la marca que deja un turno callado. */
const VISTO = '2026-11-20T14:57:00.000Z';

const unidad: UnidadBot = {
  codigo: '2B',
  edificio: 'Torre A',
  piso: '2',
  tipo: 'Departamento',
  categoria: 'departamento',
  ambientes: 3,
  dormitorios: 2,
  banos: 1,
  m2Total: 70,
  m2Cubiertos: 65,
  precio: 120000,
  moneda: 'USD',
  estado: 'available',
  orientacion: null,
  expensas: null,
  cocheras: 0,
  condicion: null,
  features: [],
  fotos: ['https://cdn/2b-1.jpg', 'https://cdn/2b-2.jpg'],
  plano: null,
  plano3d: null,
};

const datosProyecto: DatosProyecto = {
  proyecto: { id: 'proj1', name: 'Torre Sol' } as ProjectRow,
  edificios: [],
  pisos: [],
  unidades: [unidad],
  amenities: [],
  pois: [],
  calculadora: null,
};

/** Cliente escribió a las 14:57; nada más. */
const HISTORIAL_BASE: WaMensaje[] = [mensajePrueba({ enviado_at: '2026-11-20T14:57:00.000Z', cuerpo: 'Hola' })];

type Turno = (i: { system: unknown; mensajes: unknown; deps: DepsHerramientas }) => Promise<ResultadoTurno>;

function deps(p: { historial?: WaMensaje[]; responder?: Turno } & Pick<Partial<DepsTurnoBot>, 'log' | 'urlAdmin'> = {}) {
  const { historial: hist = HISTORIAL_BASE, responder, ...resto } = p;
  let n = 0;
  const repo = {
    leerBot: vi.fn(async () => botPrueba()),
    leerConversacion: vi.fn(async () => convPrueba()),
    historial: vi.fn(async () => hist),
    contarRespuestasBotUltimaHora: vi.fn(async () => 0),
    encolar: vi.fn(async (...a: [unknown, { cuerpo: string | null; adjunto_url: string | null }]) =>
      salidaPrueba({ id: `s${++n}`, cuerpo: a[1].cuerpo, adjunto_url: a[1].adjunto_url }),
    ),
    pausarIa: vi.fn(async () => {}),
    registrarAviso: vi.fn(async (): Promise<'avisado' | 'ya_avisado'> => 'avisado'),
  };
  const d = {
    sb: {} as SupabaseClient,
    repo,
    cargarDatosProyecto: vi.fn(async () => datosProyecto),
    responderTurno: vi.fn<Turno>(responder ?? (async () => ({ texto: 'Hola! Tenemos unidades de 2 y 3 ambientes.' }))),
    ahora: () => AHORA,
    urlAdmin: 'https://admin.ejemplo.com',
    log: vi.fn(),
    ...resto,
  };
  return d;
}

describe('correrTurnoIA', () => {
  it('responde: arma el system con la ficha, llama a la IA y encola la respuesta con origen bot', async () => {
    const d = deps();
    expect(await correrTurnoIA(d, 'bot1', 'conv1')).toBe('respondido');
    expect(d.cargarDatosProyecto).toHaveBeenCalledWith(d.sb, 'proj1');
    const llamada = d.responderTurno.mock.calls[0][0];
    expect(JSON.stringify(llamada.system)).toContain('Torre Sol');
    expect(llamada.mensajes).toEqual([{ role: 'user', content: 'Hola' }]);
    expect(llamada.deps.unidades).toEqual([unidad]);
    expect(d.repo.encolar).toHaveBeenCalledTimes(1);
    expect(d.repo.encolar).toHaveBeenCalledWith(d.sb, {
      bot_id: 'bot1',
      conversacion_id: 'conv1',
      destino: '5491155551234@c.us',
      cuerpo: 'Hola! Tenemos unidades de 2 y 3 ambientes.',
      adjunto_url: null,
      origen: 'bot',
      autor_id: null,
      orden_at: '2026-11-20T14:57:00.001Z',
      parte: 0,
    });
    expect(d.repo.pausarIa).not.toHaveBeenCalled();
  });

  it('historial que termina en un mensaje del bot (nada nuevo del cliente) → se omite en silencio', async () => {
    const d = deps({
      historial: [
        mensajePrueba(),
        mensajePrueba({ id: 's9', direccion: 'saliente', autor: 'bot', cuerpo: 'Hola!', salida_id: 's9', orden_at: '2026-11-20T14:57:00.001Z' }),
      ],
    });
    expect(await correrTurnoIA(d, 'bot1', 'conv1')).toBe('sin_novedad');
    expect(d.responderTurno).not.toHaveBeenCalled();
    expect(d.repo.encolar).not.toHaveBeenCalled();
    expect(d.repo.pausarIa).not.toHaveBeenCalled();
  });

  it('historial vacío → se omite en silencio', async () => {
    const d = deps({ historial: [] });
    expect(await correrTurnoIA(d, 'bot1', 'conv1')).toBe('sin_novedad');
    expect(d.responderTurno).not.toHaveBeenCalled();
  });

  it('debeResponder false (modo humano) → no llama a la IA y guarda el motivo', async () => {
    const d = deps();
    d.repo.leerConversacion.mockResolvedValueOnce(convPrueba({ modo: 'humano', humano_hasta: '2026-11-21T00:00:00.000Z' }));
    expect(await correrTurnoIA(d, 'bot1', 'conv1')).toBe('no_responde');
    expect(d.responderTurno).not.toHaveBeenCalled();
    expect(d.cargarDatosProyecto).not.toHaveBeenCalled();
    expect(d.repo.pausarIa).toHaveBeenCalledWith(d.sb, 'conv1', 'humano', VISTO);
  });

  it('bot inactivo → no llama a la IA', async () => {
    const d = deps();
    d.repo.leerBot.mockResolvedValueOnce(botPrueba({ activo: false }));
    expect(await correrTurnoIA(d, 'bot1', 'conv1')).toBe('no_responde');
    expect(d.responderTurno).not.toHaveBeenCalled();
  });

  it('el motivo no se reescribe si ya estaba guardado', async () => {
    const d = deps();
    d.repo.leerConversacion.mockResolvedValueOnce(
      convPrueba({ creada_post_vinculo: false, ia_pausada_motivo: 'pre_vinculo', ia_visto_hasta: VISTO }),
    );
    expect(await correrTurnoIA(d, 'bot1', 'conv1')).toBe('no_responde');
    expect(d.repo.pausarIa).not.toHaveBeenCalled();
  });

  it('mismo motivo pero hay mensajes nuevos del cliente → solo corre la marca', async () => {
    const d = deps();
    d.repo.leerConversacion.mockResolvedValueOnce(
      convPrueba({ creada_post_vinculo: false, ia_pausada_motivo: 'pre_vinculo', ia_visto_hasta: '2026-11-20T14:00:00.000Z' }),
    );
    expect(await correrTurnoIA(d, 'bot1', 'conv1')).toBe('no_responde');
    expect(d.repo.pausarIa).toHaveBeenCalledWith(d.sb, 'conv1', 'pre_vinculo', VISTO);
  });

  it('tope por conversación: 30 respuestas en la última hora → no responde', async () => {
    const d = deps();
    d.repo.contarRespuestasBotUltimaHora.mockResolvedValueOnce(30);
    expect(await correrTurnoIA(d, 'bot1', 'conv1')).toBe('no_responde');
    expect(d.repo.pausarIa).toHaveBeenCalledWith(d.sb, 'conv1', 'tope_conversacion', VISTO);
  });

  it('tope diario: cuenta mensajes_hoy solo si es de hoy (Buenos Aires)', async () => {
    const d = deps();
    d.repo.leerBot.mockResolvedValueOnce(botPrueba({ mensajes_hoy: 300, mensajes_hoy_fecha: '2026-11-20' }));
    expect(await correrTurnoIA(d, 'bot1', 'conv1')).toBe('no_responde');
    expect(d.repo.pausarIa).toHaveBeenCalledWith(d.sb, 'conv1', 'tope_diario', VISTO);

    const d2 = deps();
    d2.repo.leerBot.mockResolvedValueOnce(botPrueba({ mensajes_hoy: 300, mensajes_hoy_fecha: '2026-11-19' }));
    expect(await correrTurnoIA(d2, 'bot1', 'conv1')).toBe('respondido');
  });

  it('contestador automático (texto largo ≤ 6 s después de nuestro mensaje) → no responde', async () => {
    const d = deps({
      historial: [
        mensajePrueba({ id: 'm0', cuerpo: 'Hola', enviado_at: '2026-11-20T14:50:00.000Z' }),
        mensajePrueba({
          id: 'm1',
          direccion: 'saliente',
          autor: 'bot',
          cuerpo: 'Hola! Soy Sofía.',
          enviado_at: '2026-11-20T14:56:57.000Z',
          orden_at: '2026-11-20T14:50:00.001Z',
          salida_id: 'sx',
        }),
        mensajePrueba({
          id: 'm2',
          cuerpo: 'En este momento no podemos atenderte, te respondemos a la brevedad posible.',
          enviado_at: '2026-11-20T14:57:00.000Z',
        }),
      ],
    });
    expect(await correrTurnoIA(d, 'bot1', 'conv1')).toBe('no_responde');
    expect(d.repo.pausarIa).toHaveBeenCalledWith(d.sb, 'conv1', 'contestador', VISTO);
  });

  it('un comprador que pregunta por el "horario de atención" recibe respuesta de la IA', async () => {
    const d = deps({
      historial: [
        mensajePrueba({ id: 'm0', cuerpo: 'Hola, cuál es el horario de atención?', enviado_at: '2026-11-20T14:56:50.000Z' }),
        mensajePrueba({ id: 'm1', cuerpo: 'tienen 2 ambientes?', enviado_at: '2026-11-20T14:57:00.000Z' }),
      ],
    });
    expect(await correrTurnoIA(d, 'bot1', 'conv1')).toBe('respondido');
    expect(d.responderTurno).toHaveBeenCalled();
  });

  describe('contestador: un mensaje que ya calló un turno no calla los siguientes', () => {
    const NUESTRO = mensajePrueba({
      id: 'b1',
      direccion: 'saliente',
      autor: 'bot',
      cuerpo: 'Hola! Soy Sofía, ¿en qué te ayudo?',
      enviado_at: '2026-11-20T14:50:10.000Z',
      orden_at: '2026-11-20T14:50:00.001Z',
      salida_id: 'sb1',
    });
    const AUTO = mensajePrueba({
      id: 'a1',
      cuerpo: 'Gracias por tu mensaje. En este momento no podemos atenderte, te contactamos a la brevedad.',
      enviado_at: '2026-11-20T14:50:13.000Z',
    });
    const historial = [mensajePrueba({ id: 'm0', enviado_at: '2026-11-20T14:50:00.000Z' }), NUESTRO, AUTO];

    it('la respuesta automática justo después de nuestro mensaje se calla y deja la marca', async () => {
      const d = deps({ historial });
      expect(await correrTurnoIA(d, 'bot1', 'conv1')).toBe('no_responde');
      expect(d.responderTurno).not.toHaveBeenCalled();
      expect(d.repo.pausarIa).toHaveBeenCalledWith(d.sb, 'conv1', 'contestador', AUTO.enviado_at);
    });

    it('un mensaje humano posterior se responde (y se limpia el motivo)', async () => {
      const humano = mensajePrueba({ id: 'h1', cuerpo: 'Perdón, ¿me pasás precios del 2B?', enviado_at: '2026-11-20T14:58:00.000Z' });
      const d = deps({ historial: [...historial, humano] });
      d.repo.leerConversacion.mockResolvedValue(
        convPrueba({ ia_pausada_motivo: 'contestador', ia_visto_hasta: AUTO.enviado_at }),
      );
      expect(await correrTurnoIA(d, 'bot1', 'conv1')).toBe('respondido');
      expect(d.repo.pausarIa).toHaveBeenCalledWith(d.sb, 'conv1', null);
    });
  });

  describe('hayContestador', () => {
    const nuestro = mensajePrueba({ id: 'b', direccion: 'saliente', autor: 'bot', enviado_at: '2026-11-20T14:50:10.000Z', salida_id: 'sb' });
    const largo = 'Gracias por tu mensaje. En este momento no podemos atenderte, te contactamos.';
    it('texto largo ≤ 6 s después de nuestro mensaje enviado → sí', () => {
      expect(hayContestador([nuestro, mensajePrueba({ cuerpo: largo, enviado_at: '2026-11-20T14:50:14.000Z' })], null)).toBe(true);
    });
    it('lo ya evaluado por un turno (≤ ia_visto_hasta) no cuenta', () => {
      const auto = mensajePrueba({ id: 'a', cuerpo: largo, enviado_at: '2026-11-20T14:50:14.000Z' });
      const humano = mensajePrueba({ id: 'h', cuerpo: 'hola?', enviado_at: '2026-11-20T14:55:00.000Z' });
      expect(hayContestador([nuestro, auto, humano], auto.enviado_at)).toBe(false);
    });
    it('una respuesta nuestra todavía en la cola también corta la ventana', () => {
      const auto = mensajePrueba({ id: 'a', cuerpo: 'Respuesta automática', enviado_at: '2026-11-20T14:50:14.000Z' });
      const enCola = mensajePrueba({ id: 'sq', direccion: 'saliente', autor: 'bot', wa_id: null, salida_id: 'sq', enviado_at: '2026-11-20T14:51:00.000Z' });
      expect(hayContestador([nuestro, auto, enCola], null)).toBe(false);
    });
    it('un texto largo escrito mientras el bot "escribía" (antes de que saliera) no es contestador', () => {
      // Nuestra respuesta va ordenada antes (orden_at) pero salió a las 14:50:10; el cliente escribió a las 14:50:08.
      const antes = mensajePrueba({ cuerpo: 'Te escribo porque quería saber si tienen unidades con cochera y balcón', enviado_at: '2026-11-20T14:50:08.000Z' });
      expect(hayContestador([nuestro, antes], null)).toBe(false);
    });
  });

  it("refusal → no encola nada y guarda ia_pausada_motivo 'refusal'", async () => {
    const d = deps({ responder: async () => ({ texto: null, motivoSinRespuesta: 'refusal' }) });
    expect(await correrTurnoIA(d, 'bot1', 'conv1')).toBe('pausado');
    expect(d.repo.encolar).not.toHaveBeenCalled();
    expect(d.repo.pausarIa).toHaveBeenCalledWith(d.sb, 'conv1', 'refusal', VISTO);
  });

  it("error / max_iteraciones → guarda el motivo", async () => {
    for (const motivo of ['error', 'max_iteraciones'] as const) {
      const d = deps({ responder: async () => ({ texto: null, motivoSinRespuesta: motivo }) });
      expect(await correrTurnoIA(d, 'bot1', 'conv1')).toBe('pausado');
      expect(d.repo.pausarIa).toHaveBeenCalledWith(d.sb, 'conv1', motivo, VISTO);
    }
  });

  it('texto null sin motivo → no manda nada; solo corre la marca de lo visto', async () => {
    const d = deps({ responder: async () => ({ texto: null }) });
    expect(await correrTurnoIA(d, 'bot1', 'conv1')).toBe('sin_texto');
    expect(d.repo.encolar).not.toHaveBeenCalled();
    expect(d.repo.pausarIa).toHaveBeenCalledWith(d.sb, 'conv1', null, VISTO);
  });

  it('imágenes de la herramienta y partes del texto comparten la base y llevan parte creciente', async () => {
    const d = deps({
      historial: [
        mensajePrueba({ id: 'm0', cuerpo: 'Hola', enviado_at: '2026-11-20T14:50:00.000Z' }),
        mensajePrueba({ id: 'm1', cuerpo: '¿Tenés fotos del 2B?', enviado_at: '2026-11-20T14:57:00.000Z' }),
      ],
      responder: async (i) => {
        await i.deps.encolarImagenes(['https://cdn/2b-1.jpg', 'https://cdn/2b-2.jpg']);
        return { texto: 'Ahí te mandé las fotos.\n\n¿Querés coordinar una visita?' };
      },
    });
    expect(await correrTurnoIA(d, 'bot1', 'conv1')).toBe('respondido');
    const filas = d.repo.encolar.mock.calls.map((c) => c[1] as Record<string, unknown>);
    expect(filas.map((f) => [f.adjunto_url, f.cuerpo, f.parte])).toEqual([
      ['https://cdn/2b-1.jpg', null, 0],
      ['https://cdn/2b-2.jpg', null, 1],
      [null, 'Ahí te mandé las fotos.', 2],
      [null, '¿Querés coordinar una visita?', 3],
    ]);
    for (const f of filas) {
      expect(f).toMatchObject({ orden_at: '2026-11-20T14:57:00.001Z', origen: 'bot', bot_id: 'bot1', conversacion_id: 'conv1' });
    }
  });

  it('refusal después de que la herramienta pidió imágenes → no se encola nada', async () => {
    const d = deps({
      responder: async (i) => {
        await i.deps.encolarImagenes(['https://cdn/2b-1.jpg']);
        return { texto: null, motivoSinRespuesta: 'refusal' };
      },
    });
    expect(await correrTurnoIA(d, 'bot1', 'conv1')).toBe('pausado');
    expect(d.repo.encolar).not.toHaveBeenCalled();
  });

  it('error / max_iteraciones con imágenes pedidas → no se encola nada', async () => {
    for (const motivo of ['error', 'max_iteraciones'] as const) {
      const d = deps({
        responder: async (i) => {
          await i.deps.encolarImagenes(['https://cdn/2b-1.jpg', 'https://cdn/2b-2.jpg']);
          return { texto: null, motivoSinRespuesta: motivo };
        },
      });
      expect(await correrTurnoIA(d, 'bot1', 'conv1')).toBe('pausado');
      expect(d.repo.encolar).not.toHaveBeenCalled();
    }
  });

  it('el vendedor tomó la charla mientras la IA pensaba → tampoco salen las imágenes', async () => {
    const d = deps({
      responder: async (i) => {
        await i.deps.encolarImagenes(['https://cdn/2b-1.jpg']);
        return { texto: 'Ahí van las fotos.' };
      },
    });
    d.repo.leerConversacion
      .mockResolvedValueOnce(convPrueba())
      .mockResolvedValueOnce(convPrueba({ modo: 'humano', humano_hasta: '2026-11-21T03:00:00.000Z' }));
    expect(await correrTurnoIA(d, 'bot1', 'conv1')).toBe('no_responde');
    expect(d.repo.encolar).not.toHaveBeenCalled();
  });

  it('las imágenes se encolan recién al terminar el turno, antes del texto', async () => {
    let encoladasDuranteElTurno = -1;
    const d = deps({
      responder: async (i) => {
        await i.deps.encolarImagenes(['https://cdn/2b-1.jpg']);
        encoladasDuranteElTurno = d.repo.encolar.mock.calls.length;
        return { texto: 'Listo.' };
      },
    });
    expect(await correrTurnoIA(d, 'bot1', 'conv1')).toBe('respondido');
    expect(encoladasDuranteElTurno).toBe(0);
    const filas = d.repo.encolar.mock.calls.map((c) => c[1] as Record<string, unknown>);
    expect(filas.map((f) => [f.adjunto_url, f.cuerpo, f.parte])).toEqual([
      ['https://cdn/2b-1.jpg', null, 0],
      [null, 'Listo.', 1],
    ]);
  });

  it('solo imágenes, sin texto final → salen las imágenes', async () => {
    const d = deps({
      responder: async (i) => {
        await i.deps.encolarImagenes(['https://cdn/2b-1.jpg', 'https://cdn/2b-2.jpg']);
        return { texto: null };
      },
    });
    expect(await correrTurnoIA(d, 'bot1', 'conv1')).toBe('respondido');
    expect(d.repo.encolar.mock.calls.map((c) => (c[1] as Record<string, unknown>).parte)).toEqual([0, 1]);
  });

  it('la base es el último mensaje del cliente aunque después haya una respuesta del bot en cola', async () => {
    // El cliente escribió A, el bot respondió (en cola) y el cliente escribió B.
    const d = deps({
      historial: [
        mensajePrueba({ id: 'a', cuerpo: 'A', enviado_at: '2026-11-20T14:50:00.000Z' }),
        mensajePrueba({ id: 's1', direccion: 'saliente', autor: 'bot', cuerpo: 'R', wa_id: null, salida_id: 's1', enviado_at: '2026-11-20T14:50:05.000Z', orden_at: '2026-11-20T14:50:00.001Z' }),
        mensajePrueba({ id: 'b', cuerpo: 'B', enviado_at: '2026-11-20T14:58:00.000Z' }),
      ],
    });
    await correrTurnoIA(d, 'bot1', 'conv1');
    expect(d.repo.encolar.mock.calls[0][1]).toMatchObject({ orden_at: '2026-11-20T14:58:00.001Z', parte: 0 });
  });

  it('avisar_vendedor pasa por registrarAviso con el teléfono y la conversación', async () => {
    const d = deps({
      responder: async (i) => {
        await i.deps.avisar({ nombre: 'Ana', unidades: ['2B'], resumen: 'Quiere visitar.' });
        return { texto: 'Listo, te contacta alguien del equipo.' };
      },
    });
    await correrTurnoIA(d, 'bot1', 'conv1');
    const [sb, conv, datos, bot, proyecto, url] = d.repo.registrarAviso.mock.calls[0] as unknown as unknown[];
    expect(sb).toBe(d.sb);
    expect(conv).toMatchObject({ id: 'conv1' });
    expect(datos).toEqual({
      telefono: '5491155551234',
      conversacionId: 'conv1',
      nombre: 'Ana',
      unidades: ['2B'],
      // Spec §7.7: el aviso describe las unidades (amb, m², precio), no solo el código.
      unidadesTexto: [lineaUnidad(unidad)],
      resumen: 'Quiere visitar.',
    });
    expect(bot).toMatchObject({ id: 'bot1' });
    expect(proyecto).toMatchObject({ name: 'Torre Sol' });
    expect(url).toBe('https://admin.ejemplo.com');
  });

  it('si el vendedor tomó la conversación mientras la IA pensaba, no encola el texto', async () => {
    const d = deps();
    d.repo.leerConversacion
      .mockResolvedValueOnce(convPrueba())
      .mockResolvedValueOnce(convPrueba({ modo: 'humano', humano_hasta: '2026-11-21T03:00:00.000Z' }));
    expect(await correrTurnoIA(d, 'bot1', 'conv1')).toBe('no_responde');
    expect(d.repo.encolar).not.toHaveBeenCalled();
  });

  it('responde con éxito → limpia un ia_pausada_motivo anterior', async () => {
    const d = deps();
    d.repo.leerConversacion.mockResolvedValue(convPrueba({ ia_pausada_motivo: 'error' }));
    await correrTurnoIA(d, 'bot1', 'conv1');
    expect(d.repo.pausarIa).toHaveBeenCalledWith(d.sb, 'conv1', null);
  });

  it('bot o conversación inexistentes → no hace nada', async () => {
    const d = deps();
    d.repo.leerConversacion.mockResolvedValueOnce(null as never);
    expect(await correrTurnoIA(d, 'bot1', 'conv1')).toBe('sin_datos');
    expect(d.responderTurno).not.toHaveBeenCalled();
  });

  it('sin contacto_wid responde al número', async () => {
    const d = deps();
    d.repo.leerConversacion.mockResolvedValue(convPrueba({ contacto_wid: null }));
    await correrTurnoIA(d, 'bot1', 'conv1');
    expect(d.repo.encolar.mock.calls[0][1]).toMatchObject({ destino: '5491155551234' });
  });
});
