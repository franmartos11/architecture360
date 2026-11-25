import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ProjectRow } from '@/types/database';
import type { WaBot, WaConversacion, WaMensaje } from '@/types/whatsapp-bot';
import type { DatosProyecto, UnidadBot } from '../ficha';
import { HERRAMIENTAS_WEB } from '../ia/herramientas';
import type { ResultadoTurno } from '../ia/turno';

const repoWeb = vi.hoisted(() => ({
  crearConversacionWeb: vi.fn(),
  conversacionWeb: vi.fn(),
  guardarMensajeWeb: vi.fn(),
  mensajesWeb: vi.fn(),
  contarMensajesCliente: vi.fn(),
  turnosWebHoy: vi.fn(),
  leadDeCharlaWeb: vi.fn(),
  registrarAvisoWeb: vi.fn(),
}));
vi.mock('./repo-web', () => repoWeb);
const repo = vi.hoisted(() => ({
  registrarUsoIa: vi.fn(async () => {}),
  visitasActivas: vi.fn(async () => []),
  agendarVisita: vi.fn(async () => 'agendada'),
  cancelarVisitasDeConversacion: vi.fn(async () => []),
}));
vi.mock('../repo', () => repo);
vi.mock('../preguntas', () => ({ registrarPregunta: vi.fn(async () => 'nueva') }));

import { charlaWeb, LIMITES_CHAT_WEB, turnoChatWeb } from './chat';

const TOKEN = '11111111-1111-4111-8111-111111111111';
const AHORA = new Date('2026-11-20T15:00:00.000Z');
const sb = {} as SupabaseClient;

const unidad = { id: 'u1', edificioId: 'e1', codigo: '2B', edificio: 'Torre A', piso: '2', tipo: 'Depto', categoria: 'vivienda', ambientes: 2, dormitorios: 1, banos: 1, m2Total: 50, m2Cubiertos: 45, precio: 100000, moneda: 'USD', estado: 'available', orientacion: null, expensas: null, cocheras: 0, condicion: null, features: [], fotos: ['/demo/f.jpg'], plano: null, plano3d: null } as UnidadBot;
const datos: DatosProyecto = {
  proyecto: { id: 'proj1', name: 'Torre Sol', slug: 'torre-sol', published: true } as ProjectRow,
  edificios: [], pisos: [], unidades: [unidad], amenities: [], pois: [], calculadora: null, slides: [], avance: null, faq: [],
};
const bot = { id: 'bot1', project_id: 'proj1', nombre_bot: 'Sofía', criterio_aviso: null, conocimiento: null, visitas: null, estado: 'desconectado', vendedor_whatsapp: null } as unknown as WaBot;
const conv = { id: 'cw1', web_token: 'huella', lead_id: null } as unknown as WaConversacion;

const msg = (autor: 'cliente' | 'bot', cuerpo: string, tipo: 'texto' | 'imagen' = 'texto', i = 0) =>
  ({ id: `m${i}`, autor, tipo, cuerpo, direccion: autor === 'cliente' ? 'entrante' : 'saliente', enviado_at: new Date(AHORA.getTime() - 10_000 + i).toISOString(), orden_at: null }) as WaMensaje;

function base(over: Partial<Parameters<typeof turnoChatWeb>[0]> = {}) {
  return {
    sb, bot, projectId: 'proj1', token: null, mensaje: 'Hola', visitorId: 'v1', ref: 'perez',
    sitio: 'https://atrium.app/proyecto/torre-sol', urlAdmin: 'https://atrium.app', ahora: AHORA,
    cargarDatos: async () => datos,
    responder: vi.fn(async (): Promise<ResultadoTurno> => ({ texto: 'Hola, ¿qué buscás?', uso: { modelo: 'claude-opus-5-5', llamadas: 1, inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0 } })),
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  repoWeb.crearConversacionWeb.mockResolvedValue({ conv, token: TOKEN });
  repoWeb.conversacionWeb.mockResolvedValue(conv);
  repoWeb.contarMensajesCliente.mockResolvedValue(0);
  repoWeb.turnosWebHoy.mockResolvedValue(0);
  repoWeb.mensajesWeb.mockResolvedValue([msg('cliente', 'Hola')]);
  repoWeb.leadDeCharlaWeb.mockResolvedValue(null);
  repoWeb.registrarAvisoWeb.mockResolvedValue('avisado');
});

describe('turnoChatWeb', () => {
  it('sin token: crea la charla, guarda el mensaje, responde con las herramientas y el system web', async () => {
    const i = base();
    const r = await turnoChatWeb(i);
    expect(repoWeb.crearConversacionWeb).toHaveBeenCalledWith(sb, bot);
    expect(repoWeb.guardarMensajeWeb.mock.calls[0]).toEqual([sb, 'cw1', { autor: 'cliente', tipo: 'texto', cuerpo: 'Hola' }, AHORA]);
    const x = vi.mocked(i.responder).mock.calls[0][0] as { herramientas: unknown; system: { text: string }[]; deps: { canal?: string } };
    expect(x.herramientas).toBe(HERRAMIENTAS_WEB);
    expect(x.system[0].text).toContain('chat del sitio');
    expect(x.deps.canal).toBe('web');
    expect(r).toEqual({ token: TOKEN, partes: ['Hola, ¿qué buscás?'], imagenes: [], documentos: [] });
    const guardadoBot = repoWeb.guardarMensajeWeb.mock.calls[1];
    expect(guardadoBot[2]).toEqual({ autor: 'bot', tipo: 'texto', cuerpo: 'Hola, ¿qué buscás?' });
    expect((guardadoBot[3] as Date).getTime()).toBeGreaterThan(AHORA.getTime());
  });

  it('token inexistente: null y no guarda nada', async () => {
    repoWeb.conversacionWeb.mockResolvedValue(null);
    expect(await turnoChatWeb(base({ token: TOKEN }))).toBeNull();
    expect(repoWeb.guardarMensajeWeb).not.toHaveBeenCalled();
  });

  it('la historia sale de la base, nunca del navegador', async () => {
    repoWeb.mensajesWeb.mockResolvedValue([msg('cliente', 'Hola', 'texto', 0), msg('bot', 'Hola, ¿qué buscás?', 'texto', 1), msg('cliente', '2 ambientes', 'texto', 2)]);
    const i = base({ token: TOKEN, mensaje: '¿Precio?' });
    await turnoChatWeb(i);
    expect(repoWeb.crearConversacionWeb).not.toHaveBeenCalled();
    const mensajes = (vi.mocked(i.responder).mock.calls[0][0] as { mensajes: unknown }).mensajes;
    expect(mensajes).toEqual([
      { role: 'user', content: 'Hola' },
      { role: 'assistant', content: 'Hola, ¿qué buscás?' },
      { role: 'user', content: '2 ambientes\n¿Precio?' },
    ]);
  });

  it('una imagen que mostró el bot llega a la IA como marca, sin la URL', async () => {
    repoWeb.mensajesWeb.mockResolvedValue([msg('cliente', 'fotos', 'texto', 0), msg('bot', 'https://x/f.jpg', 'imagen', 1), msg('cliente', 'gracias', 'texto', 2)]);
    const i = base({ token: TOKEN });
    await turnoChatWeb(i);
    expect(JSON.stringify((vi.mocked(i.responder).mock.calls[0][0] as { mensajes: unknown }).mensajes)).not.toContain('https://x/f.jpg');
  });

  it('imágenes: rutas del sitio resueltas, devueltas y guardadas antes del texto', async () => {
    const i = base({
      responder: vi.fn(async ({ deps }: { deps: { encolarImagenes(u: string[]): Promise<void> } }) => {
        await deps.encolarImagenes(['/demo/f.jpg', 'https://cdn.x/g.jpg']);
        return { texto: 'Mirá.' };
      }) as never,
    });
    const r = await turnoChatWeb(i);
    expect(r?.imagenes).toEqual(['https://atrium.app/demo/f.jpg', 'https://cdn.x/g.jpg']);
    const guardados = repoWeb.guardarMensajeWeb.mock.calls.slice(1).map((c) => c[2]);
    expect(guardados).toEqual([
      { autor: 'bot', tipo: 'imagen', cuerpo: 'https://atrium.app/demo/f.jpg' },
      { autor: 'bot', tipo: 'imagen', cuerpo: 'https://cdn.x/g.jpg' },
      { autor: 'bot', tipo: 'texto', cuerpo: 'Mirá.' },
    ]);
  });

  it('un PDF (el brief) va como documento, no como imagen', async () => {
    const i = base({
      responder: vi.fn(async ({ deps }: { deps: { encolarImagenes(u: string[]): Promise<void> } }) => {
        await deps.encolarImagenes(['/briefs/torre.pdf?v=2']);
        return { texto: 'Te lo dejo acá.' };
      }) as never,
    });
    const r = await turnoChatWeb(i);
    expect(r?.imagenes).toEqual([]);
    expect(r?.documentos).toEqual(['https://atrium.app/briefs/torre.pdf?v=2']);
    expect(repoWeb.guardarMensajeWeb.mock.calls[1][2]).toEqual({ autor: 'bot', tipo: 'documento', cuerpo: 'https://atrium.app/briefs/torre.pdf?v=2' });
  });

  it(`tope por charla (${LIMITES_CHAT_WEB.mensajesPorCharla}): no guarda ni llama a la IA`, async () => {
    repoWeb.contarMensajesCliente.mockResolvedValue(40);
    const i = base({ token: TOKEN });
    expect(await turnoChatWeb(i)).toEqual({ token: TOKEN, partes: [], imagenes: [], documentos: [], error: 'limite_charla' });
    expect(i.responder).not.toHaveBeenCalled();
    expect(repoWeb.guardarMensajeWeb).not.toHaveBeenCalled();
  });

  it(`tope diario (${LIMITES_CHAT_WEB.turnosPorDia}): no crea charla, no guarda ni llama a la IA`, async () => {
    repoWeb.turnosWebHoy.mockResolvedValue(300);
    const i = base();
    expect(await turnoChatWeb(i)).toEqual({ token: null, partes: [], imagenes: [], documentos: [], error: 'limite_dia' });
    expect(i.responder).not.toHaveBeenCalled();
    expect(repoWeb.crearConversacionWeb).not.toHaveBeenCalled();
    expect(repoWeb.guardarMensajeWeb).not.toHaveBeenCalled();
  });

  it('turno sin respuesta: error claro, queda el mensaje del cliente y ninguna respuesta vacía', async () => {
    const i = base({ responder: vi.fn(async () => ({ texto: null, motivoSinRespuesta: 'error' as const })) as never });
    expect(await turnoChatWeb(i)).toEqual({ token: TOKEN, partes: [], imagenes: [], documentos: [], error: 'sin_respuesta' });
    expect(repoWeb.guardarMensajeWeb).toHaveBeenCalledTimes(1);
    expect(repoWeb.guardarMensajeWeb.mock.calls[0][2]).toMatchObject({ autor: 'cliente' });
  });

  it('Reintentar tras un error: el mismo mensaje recién guardado no se duplica', async () => {
    repoWeb.mensajesWeb.mockResolvedValue([msg('cliente', 'Hola', 'texto', 0), msg('bot', 'Hola, ¿qué buscás?', 'texto', 1), msg('cliente', '¿Precio?', 'texto', 2)]);
    const i = base({ token: TOKEN, mensaje: '¿Precio?' });
    const r = await turnoChatWeb(i);
    expect(repoWeb.guardarMensajeWeb.mock.calls.filter((c) => c[2].autor === 'cliente')).toHaveLength(0);
    expect(r?.partes).toEqual(['Hola, ¿qué buscás?']);
    const mensajes = (vi.mocked(i.responder).mock.calls[0][0] as { mensajes: unknown[] }).mensajes;
    expect(mensajes.at(-1)).toEqual({ role: 'user', content: '¿Precio?' });
  });

  it('el mismo texto un rato después sí es un mensaje nuevo', async () => {
    const viejo = { ...msg('cliente', '¿Precio?', 'texto', 0), enviado_at: new Date(AHORA.getTime() - 10 * 60_000).toISOString() };
    repoWeb.mensajesWeb.mockResolvedValue([viejo, msg('bot', 'USD 100.000', 'texto', 1)]);
    await turnoChatWeb(base({ token: TOKEN, mensaje: '¿Precio?' }));
    expect(repoWeb.guardarMensajeWeb.mock.calls.filter((c) => c[2].autor === 'cliente')).toHaveLength(1);
  });

  it('si algo falla con la charla ya creada: devuelve el token y "sin respuesta" (no queda huérfana)', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const i = base({ cargarDatos: async () => { throw new Error('base caída'); } });
    expect(await turnoChatWeb(i)).toEqual({ token: TOKEN, partes: [], imagenes: [], documentos: [], error: 'sin_respuesta' });
    expect(String(log.mock.calls[0][0])).toContain('[chat web]');
    log.mockRestore();
  });

  it('registra el uso con origen web', async () => {
    await turnoChatWeb(base());
    expect(repo.registrarUsoIa).toHaveBeenCalledWith(sb, expect.objectContaining({ origen: 'web', projectId: 'proj1', botId: 'bot1', conversacionId: 'cw1' }), expect.any(Function));
  });

  it('avisar: pasa el contacto, la atribución del sitio y las unidades descriptas', async () => {
    const i = base({
      responder: vi.fn(async ({ deps }: { deps: { avisar(d: unknown): Promise<string> } }) => {
        expect(await deps.avisar({ nombre: 'Ana', telefono: '1122334455', unidades: ['2B'], resumen: 'Quiere visitar' })).toBe('avisado');
        return { texto: 'Listo.' };
      }) as never,
    });
    await turnoChatWeb(i);
    const [, c, d, b, proyecto, urlAdmin] = repoWeb.registrarAvisoWeb.mock.calls[0];
    expect(c).toBe(conv);
    expect(d).toMatchObject({ telefono: '1122334455', email: null, nombre: 'Ana', unidades: ['2B'], resumen: 'Quiere visitar', conversacionId: 'cw1', visitorId: 'v1', ref: 'perez' });
    expect((d as { unidadesTexto: string[] }).unidadesTexto[0]).toContain('2B');
    expect(b).toBe(bot);
    expect(proyecto).toBe(datos.proyecto);
    expect(urlAdmin).toBe('https://atrium.app');
  });

  it('agendar sin lead en la charla: sin_contacto, sin crear la visita', async () => {
    const conAgenda = { ...bot, visitas: { activo: true, duracion_min: 60, anticipacion_horas: 0, dias_adelante: 3, lugar: null, franjas: { '5': [['10:00', '18:00']] } } } as unknown as WaBot;
    let resultado: string | undefined;
    const i = base({
      bot: conAgenda,
      responder: vi.fn(async ({ deps }: { deps: { visitas?: { agendar(a: Date, b: Date, n: string | null): Promise<string> } } }) => {
        resultado = await deps.visitas!.agendar(new Date('2026-11-20T17:00:00Z'), new Date('2026-11-20T18:00:00Z'), null);
        return { texto: 'ok' };
      }) as never,
    });
    await turnoChatWeb(i);
    expect(resultado).toBe('sin_contacto');
    expect(repo.agendarVisita).not.toHaveBeenCalled();
  });

  it('agendar con lead: usa su teléfono y nombre', async () => {
    repoWeb.leadDeCharlaWeb.mockResolvedValue({ id: 'L1', name: 'Ana', phone: '5491122334455', email: null });
    const conAgenda = { ...bot, visitas: { activo: true, duracion_min: 60, anticipacion_horas: 0, dias_adelante: 3, lugar: null, franjas: { '5': [['10:00', '18:00']] } } } as unknown as WaBot;
    const i = base({
      bot: conAgenda,
      responder: vi.fn(async ({ deps }: { deps: { visitas?: { agendar(a: Date, b: Date, n: string | null): Promise<string> } } }) => {
        await deps.visitas!.agendar(new Date('2026-11-20T17:00:00Z'), new Date('2026-11-20T18:00:00Z'), null);
        return { texto: 'ok' };
      }) as never,
    });
    await turnoChatWeb(i);
    expect(repo.agendarVisita).toHaveBeenCalledWith(sb, expect.objectContaining({ nombre: 'Ana', telefono: '5491122334455', conv }));
  });
});

describe('charlaWeb', () => {
  it('devuelve los mensajes de la charla en el formato del widget', async () => {
    repoWeb.mensajesWeb.mockResolvedValue([msg('cliente', 'Hola', 'texto', 0), msg('bot', 'https://x/f.jpg', 'imagen', 1), msg('bot', 'Hola', 'texto', 2)]);
    expect(await charlaWeb(sb, 'proj1', TOKEN)).toEqual({
      mensajes: [
        { autor: 'cliente', tipo: 'texto', cuerpo: 'Hola' },
        { autor: 'bot', tipo: 'imagen', cuerpo: 'https://x/f.jpg' },
        { autor: 'bot', tipo: 'texto', cuerpo: 'Hola' },
      ],
    });
  });

  it('token ajeno: null', async () => {
    repoWeb.conversacionWeb.mockResolvedValue(null);
    expect(await charlaWeb(sb, 'proj1', TOKEN)).toBeNull();
  });
});

describe('contexto de página', () => {
  it('incluye el contexto de la unidad en el turno sin guardarlo en la base', async () => {
    const responder = vi.fn(async (): Promise<ResultadoTurno> => ({ texto: 'Sale USD 100.000.' }));
    await turnoChatWeb(base({
      mensaje: '¿Cuánto sale?',
      ruta: '/edificio/e1/unidad/u1',
      responder: responder as never,
    }));
    const msgs = (responder.mock.calls[0] as unknown as [{ mensajes: { role: string; content: string }[] }])[0].mensajes;
    expect(msgs[msgs.length - 1].content).toContain('unidad 2B');
    expect(msgs[msgs.length - 1].content).toContain('Torre A');
    expect(msgs[msgs.length - 1].content).toContain('¿Cuánto sale?');
    expect(repoWeb.guardarMensajeWeb).toHaveBeenCalledWith(sb, 'cw1', { autor: 'cliente', tipo: 'texto', cuerpo: '¿Cuánto sale?' }, AHORA);
  });

  it('ignora rutas desconocidas sin romper el turno', async () => {
    const responder = vi.fn(async (): Promise<ResultadoTurno> => ({ texto: 'Hola.' }));
    await turnoChatWeb(base({ mensaje: '¿Cuánto sale?', ruta: '/cualquier-cosa?x=1', responder: responder as never }));
    const msgs = (responder.mock.calls[0] as unknown as [{ mensajes: { role: string; content: string }[] }])[0].mensajes;
    expect(msgs[msgs.length - 1].content).toBe('¿Cuánto sale?');
  });

  it('ficha PDF de la unidad va en documentos con el ref del visitante', async () => {
    const r = await turnoChatWeb(base({
      responder: vi.fn(async ({ deps }: { deps: { fichaUnidadPdf?: (u: UnidadBot) => string | null; encolarImagenes(urls: string[]): Promise<void> } }) => {
        await deps.encolarImagenes([deps.fichaUnidadPdf!(unidad)!]);
        return { texto: 'Ahí va la ficha.' };
      }) as never,
    }));
    expect(r?.documentos).toEqual(['https://atrium.app/api/ficha/torre-sol/u1?ref=perez']);
    expect(r?.imagenes).toEqual([]);
  });

  it('en el comparador (?compare=...) pasa ambas unidades al contexto del bot', async () => {
    const u2: UnidadBot = { ...unidad, id: 'u2', codigo: '3A', piso: '3', precio: 135000 };
    const responder = vi.fn(async (): Promise<ResultadoTurno> => ({ texto: 'La 3A es más grande.' }));
    await turnoChatWeb(base({
      mensaje: '¿Qué diferencias hay?',
      ruta: '/edificio/e1/unidad/u1?compare=u2',
      cargarDatos: async () => ({ ...datos, unidades: [unidad, u2] }),
      responder: responder as never,
    }));
    const msgs = (responder.mock.calls[0] as unknown as [{ mensajes: { role: string; content: string }[] }])[0].mensajes;
    expect(msgs[msgs.length - 1].content).toContain('comparador');
    expect(msgs[msgs.length - 1].content).toContain('unidad 2B');
    expect(msgs[msgs.length - 1].content).toContain('unidad 3A');
  });
});
