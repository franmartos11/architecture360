import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { WaBot, WaConversacion, WaMensaje, WaSalida } from '@/types/whatsapp-bot';
import type { DatosAviso } from './aviso';

const { enviarEmail, ResendFalso } = vi.hoisted(() => {
  const enviarEmail = vi.fn<(arg: unknown) => Promise<{ data: { id: string }; error: null }>>(
    async () => ({ data: { id: 'e1' }, error: null }),
  );
  const ResendFalso = vi.fn(function (this: unknown) {
    return { emails: { send: enviarEmail } };
  });
  return { enviarEmail, ResendFalso };
});
vi.mock('resend', () => ({ Resend: ResendFalso }));

import {
  agendarVisita,
  cancelarVisitasDeConversacion,
  conversacionesParaSeguimiento,
  contarRespuestasBotUltimaHora,
  encolar,
  fechaBuenosAires,
  guardarAck,
  guardarEstado,
  guardarMensaje,
  historial,
  leerBot,
  leerConversacion,
  marcarFallo,
  obtenerOCrearConversacion,
  pausarIa,
  registrarAviso,
  registrarUsoIa,
  registrarSalidaEnviada,
  subirMedio,
  sumarMensajeDelDia,
  tomarBots,
  tomarSiguienteSalida,
} from './repo';

// ─── Supabase falso: registra cada consulta y responde con `responder` ───

type Op = 'select' | 'insert' | 'update' | 'upsert' | 'delete';
interface Consulta {
  tabla: string;
  op: Op;
  valores?: unknown;
  opciones?: unknown;
  columnas?: string;
  selectOpts?: unknown;
  filtros: unknown[][];
  orden: unknown[][];
  limite?: number;
  unico?: 'single' | 'maybeSingle';
}
interface Respuesta {
  data?: unknown;
  error?: { message: string; code?: string } | null;
  count?: number | null;
}

function sbFalso(responder: (q: Consulta) => Respuesta | undefined = () => undefined) {
  const consultas: Consulta[] = [];
  const getUserById = vi.fn<(id: string) => Promise<unknown>>(async () => ({
    data: { user: { id: 'owner1', email: 'duenio@ejemplo.com' } },
    error: null,
  }));
  const sb = {
    from(tabla: string) {
      const q: Consulta = { tabla, op: 'select', filtros: [], orden: [] };
      consultas.push(q);
      const filtro =
        (nombre: string) =>
        (...args: unknown[]) => {
          q.filtros.push([nombre, ...args]);
          return b;
        };
      const b: Record<string, unknown> = {
        select(cols?: string, opts?: unknown) {
          q.columnas = cols;
          q.selectOpts = opts;
          return b;
        },
        insert(v: unknown, o?: unknown) {
          Object.assign(q, { op: 'insert', valores: v, opciones: o });
          return b;
        },
        upsert(v: unknown, o?: unknown) {
          Object.assign(q, { op: 'upsert', valores: v, opciones: o });
          return b;
        },
        update(v: unknown, o?: unknown) {
          Object.assign(q, { op: 'update', valores: v, opciones: o });
          return b;
        },
        delete() {
          q.op = 'delete';
          return b;
        },
        eq: filtro('eq'),
        neq: filtro('neq'),
        is: filtro('is'),
        in: filtro('in'),
        or: filtro('or'),
        lt: filtro('lt'),
        lte: filtro('lte'),
        gt: filtro('gt'),
        gte: filtro('gte'),
        order(...args: unknown[]) {
          q.orden.push(args);
          return b;
        },
        limit(n: number) {
          q.limite = n;
          return b;
        },
        single() {
          q.unico = 'single';
          return b;
        },
        maybeSingle() {
          q.unico = 'maybeSingle';
          return b;
        },
        then(ok: (r: unknown) => unknown, mal?: (e: unknown) => unknown) {
          const r = responder(q) ?? {};
          return Promise.resolve({
            data: r.data ?? null,
            error: r.error ?? null,
            count: r.count ?? null,
          }).then(ok, mal);
        },
      };
      return b;
    },
    auth: { admin: { getUserById } },
  };
  const escrituras = () => consultas.filter((c) => c.op !== 'select');
  return { sb: sb as unknown as SupabaseClient, consultas, escrituras, getUserById };
}

const tiene = (q: Consulta, ...filtro: unknown[]) =>
  q.filtros.some((f) => JSON.stringify(f) === JSON.stringify(filtro));

// ─── Fixtures ───

const AHORA = new Date('2026-11-20T15:00:00.000Z');
const iso = (ms: number) => new Date(ms).toISOString();
const DIA = 24 * 60 * 60 * 1000;

function bot(p: Partial<WaBot> = {}): WaBot {
  return {
    id: 'bot1',
    project_id: 'proj1',
    estado: 'conectado',
    numero: '5491100000000',
    qr: null,
    qr_at: null,
    vinculado_at: '2026-11-10T12:00:00.000Z',
    heartbeat_at: null,
    puente_host: 'srv1',
    puente_hasta: null,
    host_permitido: 'srv1',
    ultimo_error: null,
    pedido: null,
    pedido_at: null,
    activo: true,
    nombre_bot: 'Sofía',
    vendedor_nombre: 'Juan',
    vendedor_whatsapp: null,
    vendedor_user_id: null,
    conocimiento: null,
    criterio_aviso: null,
    mensajes_hoy: 0,
    mensajes_hoy_fecha: null,
    created_at: '2026-11-01T00:00:00.000Z',
    updated_at: '2026-11-01T00:00:00.000Z',
    ...p,
  };
}

function conv(p: Partial<WaConversacion> = {}): WaConversacion {
  return {
    id: 'conv1',
    bot_id: 'bot1',
    project_id: 'proj1',
    contacto_numero: '5491155551234',
    contacto_wid: '5491155551234@c.us',
    contacto_nombre: 'Ana',
    creada_post_vinculo: true,
    modo: 'bot',
    humano_hasta: null,
    avisado_at: null,
    lead_id: null,
    resumen: null,
    ultimo_mensaje: null,
    ultimo_mensaje_at: null,
    ultimo_entrante_at: null,
    no_leidos: 0,
    ia_pausada_motivo: null,
    ia_visto_hasta: null,
    created_at: '2026-11-15T00:00:00.000Z',
    ...p,
  };
}

function salida(p: Partial<WaSalida> = {}): WaSalida {
  return {
    id: 's1',
    bot_id: 'bot1',
    conversacion_id: 'conv1',
    destino: '5491155551234',
    cuerpo: 'Hola, te cuento',
    adjunto_url: null,
    origen: 'bot',
    autor_id: null,
    estado: 'enviando',
    intentos: 0,
    proximo_intento_at: null,
    tomado_at: '2026-11-20T14:59:00.000Z',
    error: null,
    wa_id: null,
    created_at: '2026-11-20T14:58:00.000Z',
    enviado_at: null,
    orden_at: '2026-11-20T14:57:00.001Z',
    ...p,
  };
}

function mensaje(p: Partial<WaMensaje> = {}): WaMensaje {
  return {
    id: 'm1',
    conversacion_id: 'conv1',
    wa_id: 'w1',
    direccion: 'entrante',
    autor: 'cliente',
    tipo: 'texto',
    cuerpo: 'Hola',
    media_path: null,
    enviado_at: '2026-11-20T14:57:00.000Z',
    ack: null,
    created_at: '2026-11-20T14:57:00.000Z',
    orden_at: null,
    salida_id: null,
    ...p,
  };
}

const datos: DatosAviso = {
  telefono: '5491155551234',
  nombre: 'Ana',
  unidades: ['2B'],
  resumen: 'Quiere visitar el 2B el sábado.',
  conversacionId: 'conv1',
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(AHORA);
  delete process.env.RESEND_API_KEY;
  enviarEmail.mockClear();
  ResendFalso.mockClear();
});
afterEach(() => {
  vi.useRealTimers();
  delete process.env.RESEND_API_KEY;
});

// ─── registrarAviso ───

/** Responder base para registrarAviso: conversación sin avisar, sin leads previos. */
function responderAviso(extra: (q: Consulta) => Respuesta | undefined = () => undefined) {
  return (q: Consulta): Respuesta | undefined => {
    const r = extra(q);
    if (r) return r;
    if (q.tabla === 'wa_conversaciones' && q.op === 'select') return { data: { avisado_at: null } };
    if (q.tabla === 'leads' && q.op === 'select') return { data: [] };
    if (q.tabla === 'leads' && q.op === 'insert') return { data: { id: 'lead1' } };
    if (q.tabla === 'projects' && q.op === 'select') return { data: { owner_id: 'owner1' } };
    if (q.tabla === 'wa_salida' && q.op === 'insert') return { data: salida({ origen: 'aviso' }) };
    return undefined;
  };
}

describe('registrarUsoIa', () => {
  const uso = { modelo: 'claude-opus-5-5', llamadas: 1, inputTokens: 5, outputTokens: 7, cacheReadTokens: 100, cacheWriteTokens: 0 };

  it('inserta una fila en wa_uso_ia con los tokens', async () => {
    const f = sbFalso();
    await registrarUsoIa(f.sb, { projectId: 'proj1', botId: 'bot1', conversacionId: 'conv1', origen: 'respuesta', uso });
    expect(f.escrituras()).toEqual([
      expect.objectContaining({
        tabla: 'wa_uso_ia',
        op: 'insert',
        valores: expect.objectContaining({ project_id: 'proj1', origen: 'respuesta', input_tokens: 5, output_tokens: 7, cache_read_tokens: 100 }),
      }),
    ]);
  });

  it('si falla (p. ej. la tabla no existe) no rechaza: lo anota y sigue', async () => {
    const f = sbFalso(() => ({ error: { message: 'relation "wa_uso_ia" does not exist', code: '42P01' } }));
    const log = vi.fn();
    await expect(registrarUsoIa(f.sb, { projectId: 'proj1', botId: null, conversacionId: null, origen: 'simulador', uso }, log)).resolves.toBeUndefined();
    expect(log).toHaveBeenCalledWith(expect.stringContaining('wa_uso_ia'));
  });

  it('un turno sin llamadas a la API no se guarda', async () => {
    const f = sbFalso();
    await registrarUsoIa(f.sb, { projectId: 'proj1', botId: null, conversacionId: null, origen: 'respuesta', uso: { ...uso, llamadas: 0 } });
    expect(f.consultas).toHaveLength(0);
  });
});

describe('registrarAviso', () => {
  it('busca el lead solo entre los que terminan en los mismos 6 dígitos, sin bajar todos ni ip_address', async () => {
    const f = sbFalso(responderAviso());
    await registrarAviso(f.sb, conv(), datos, bot({ vendedor_whatsapp: null }), { name: 'Torre Sol' }, 'https://app.ejemplo.com');

    const busquedas = f.consultas.filter((q) => q.tabla === 'leads' && q.op === 'select');
    expect(busquedas).toHaveLength(1);
    expect(busquedas[0].filtros).toContainEqual(['eq', 'phone_tail', '551234']); // 5491155551234
    expect(busquedas[0].columnas).not.toContain('*');
    expect(busquedas[0].columnas).not.toContain('ip_address');
  });

  it('si la columna phone_tail todavía no existe (schema sin aplicar), trae los leads del proyecto como antes', async () => {
    const f = sbFalso(
      responderAviso((q) =>
        q.tabla === 'leads' && q.op === 'select' && q.filtros.some((x) => x[1] === 'phone_tail')
          ? { error: { message: 'column leads.phone_tail does not exist', code: '42703' } }
          : undefined,
      ),
    );
    const r = await registrarAviso(f.sb, conv(), datos, bot({ vendedor_whatsapp: null }), { name: 'Torre Sol' }, 'https://app.ejemplo.com');

    expect(r).toBe('avisado');
    const busquedas = f.consultas.filter((q) => q.tabla === 'leads' && q.op === 'select');
    expect(busquedas).toHaveLength(2);
    expect(busquedas[1].filtros).toEqual([['eq', 'project_id', 'proj1']]);
  });

  it('sin vendedor_whatsapp crea el lead y no encola aviso', async () => {
    const f = sbFalso(responderAviso());
    const r = await registrarAviso(f.sb, conv(), datos, bot({ vendedor_whatsapp: null }), { name: 'Torre Sol' }, 'https://app.ejemplo.com');
    expect(r).toBe('avisado');

    const insertLead = f.escrituras().find((q) => q.tabla === 'leads');
    expect(insertLead?.op).toBe('insert');
    expect(insertLead?.valores).toMatchObject({
      project_id: 'proj1',
      status: 'nuevo',
      source: 'whatsapp_bot',
      phone: '5491155551234',
      wa_conversacion_id: 'conv1',
    });
    expect(f.escrituras().some((q) => q.tabla === 'wa_salida')).toBe(false);

    const upd = f.escrituras().find((q) => q.tabla === 'wa_conversaciones');
    expect(upd?.op).toBe('update');
    expect(upd?.valores).toEqual({
      avisado_at: AHORA.toISOString(),
      resumen: datos.resumen,
      lead_id: 'lead1',
    });
    expect(tiene(upd!, 'eq', 'id', 'conv1')).toBe(true);
  });

  it('vendedor_whatsapp en blanco tampoco encola un aviso con destino vacío', async () => {
    const f = sbFalso(responderAviso());
    await registrarAviso(f.sb, conv(), datos, bot({ vendedor_whatsapp: '   ' }), { name: 'Torre Sol' }, 'https://app.ejemplo.com');
    expect(f.escrituras().some((q) => q.tabla === 'wa_salida')).toBe(false);
  });

  it('con vendedor_whatsapp encola el aviso al número normalizado con el link al chat', async () => {
    const f = sbFalso(responderAviso());
    await registrarAviso(
      f.sb,
      conv(),
      datos,
      bot({ vendedor_whatsapp: '+54 9 11 4444-0000' }),
      { name: 'Torre Sol' },
      'https://app.ejemplo.com/',
    );
    const aviso = f.escrituras().find((q) => q.tabla === 'wa_salida');
    expect(aviso?.op).toBe('insert');
    const v = aviso?.valores as Record<string, unknown>;
    expect(v).toMatchObject({
      bot_id: 'bot1',
      conversacion_id: null,
      destino: '5491144440000',
      origen: 'aviso',
      adjunto_url: null,
    });
    expect(v.cuerpo).toContain('Torre Sol');
    expect(v.cuerpo).toContain('Ver chat: https://app.ejemplo.com/admin/leads?c=conv1');
  });

  it('el aviso lista las unidades descriptas (unidadesTexto); el lead guarda los códigos', async () => {
    const f = sbFalso(responderAviso());
    await registrarAviso(
      f.sb,
      conv(),
      { ...datos, unidadesTexto: ['2B (Torre A, 2) · Departamento · 3 amb · 70 m² · USD 120.000 · Disponible'] },
      bot({ vendedor_whatsapp: '5491144440000' }),
      { name: 'Torre Sol' },
      'https://app.ejemplo.com',
    );
    const v = f.escrituras().find((q) => q.tabla === 'wa_salida')?.valores as Record<string, string>;
    expect(v.cuerpo).toContain('Le interesa: 2B (Torre A, 2) · Departamento · 3 amb · 70 m² · USD 120.000 · Disponible');
    expect(f.escrituras().find((q) => q.tabla === 'leads')?.valores).toMatchObject({ unit_name: '2B' });
  });

  it('contacto @lid sin resolver: aviso con "número oculto", sin wa.me, y el lead sin teléfono', async () => {
    const f = sbFalso(responderAviso());
    await registrarAviso(
      f.sb,
      conv({ contacto_numero: '123456789012345@lid', contacto_wid: '123456789012345@lid' }),
      { ...datos, telefono: '123456789012345@lid' },
      bot({ vendedor_whatsapp: '5491144440000' }),
      { name: 'Torre Sol' },
      'https://app.ejemplo.com',
    );
    const v = f.escrituras().find((q) => q.tabla === 'wa_salida')?.valores as Record<string, string>;
    expect(v.cuerpo).toContain('Ana · número oculto');
    expect(v.cuerpo).not.toContain('wa.me');
    expect(v.cuerpo).not.toContain('@lid');
    expect(f.escrituras().find((q) => q.tabla === 'leads')?.valores).toMatchObject({ phone: null });
  });

  it('avisado hace 1 día y el cliente no se fue ≥ 7 días → ya_avisado sin escribir nada', async () => {
    const avisado = new Date(AHORA.getTime() - DIA).toISOString();
    const f = sbFalso((q) => {
      if (q.tabla === 'wa_conversaciones' && q.op === 'select') return { data: { avisado_at: avisado } };
      if (q.tabla === 'wa_mensajes' && q.unico === 'maybeSingle')
        return { data: { enviado_at: new Date(AHORA.getTime() - DIA - 60_000).toISOString() } };
      if (q.tabla === 'wa_mensajes')
        return {
          data: [
            { enviado_at: new Date(AHORA.getTime() - DIA - 60_000).toISOString() },
            { enviado_at: new Date(AHORA.getTime() - 60_000).toISOString() },
          ],
        };
      return undefined;
    });
    const r = await registrarAviso(f.sb, conv({ avisado_at: avisado }), datos, bot({ vendedor_whatsapp: '5491144440000' }), { name: 'Torre Sol' }, 'https://app.ejemplo.com');
    expect(r).toBe('ya_avisado');
    expect(f.escrituras()).toEqual([]);
  });

  it('ya avisado con calificación nueva: no repite el aviso pero la suma al lead', async () => {
    const avisado = new Date(AHORA.getTime() - DIA).toISOString();
    const f = sbFalso((q) => {
      if (q.tabla === 'wa_conversaciones' && q.op === 'select') return { data: { avisado_at: avisado, lead_id: 'lead9' } };
      if (q.tabla === 'wa_mensajes' && q.unico === 'maybeSingle')
        return { data: { enviado_at: new Date(AHORA.getTime() - DIA - 60_000).toISOString() } };
      if (q.tabla === 'wa_mensajes') return { data: [{ enviado_at: new Date(AHORA.getTime() - 60_000).toISOString() }] };
      if (q.tabla === 'leads' && q.op === 'select')
        return { data: { calificacion: { temperatura: 'tibio', presupuesto: 'USD 90.000', ambientes: null, plazo: null, proposito: null, financiacion: null, actualizada_at: avisado } } };
      return undefined;
    });
    const calificacion = { temperatura: 'caliente' as const, presupuesto: null, ambientes: 3, plazo: null, proposito: null, financiacion: null, actualizada_at: AHORA.toISOString() };
    const r = await registrarAviso(f.sb, conv({ avisado_at: avisado }), { ...datos, calificacion }, bot({ vendedor_whatsapp: '5491144440000' }), { name: 'Torre Sol' }, 'https://app.ejemplo.com');
    expect(r).toBe('ya_avisado');
    const escrituras = f.escrituras();
    expect(escrituras).toHaveLength(1);
    expect(escrituras[0].tabla).toBe('leads');
    expect(escrituras[0].valores).toEqual({ calificacion: { ...calificacion, presupuesto: 'USD 90.000' } });
    expect(tiene(escrituras[0], 'eq', 'id', 'lead9')).toBe(true);
  });

  it('el aviso nuevo lleva la calificación en el lead y en el mensaje al vendedor', async () => {
    const f = sbFalso(responderAviso());
    const calificacion = { temperatura: 'caliente' as const, presupuesto: 'USD 120.000', ambientes: 3, plazo: null, proposito: 'vivir' as const, financiacion: null, actualizada_at: AHORA.toISOString() };
    await registrarAviso(f.sb, conv(), { ...datos, calificacion }, bot({ vendedor_whatsapp: '5491144440000' }), { name: 'Torre Sol' }, 'https://app.ejemplo.com');
    const lead = f.escrituras().find((q) => q.tabla === 'leads');
    expect((lead?.valores as Record<string, unknown>).calificacion).toEqual(calificacion);
    const aviso = f.escrituras().find((q) => q.tabla === 'wa_salida');
    expect((aviso?.valores as { cuerpo: string }).cuerpo).toContain('Caliente · presupuesto USD 120.000 · 3 amb · para vivir');
  });

  it('lee avisado_at fresco de la base (una segunda llamada en el mismo turno no avisa dos veces)', async () => {
    const avisado = new Date(AHORA.getTime() - 1000).toISOString();
    const f = sbFalso((q) => {
      if (q.tabla === 'wa_conversaciones' && q.op === 'select') return { data: { avisado_at: avisado } };
      if (q.tabla === 'wa_mensajes' && q.unico === 'maybeSingle') return { data: { enviado_at: avisado } };
      if (q.tabla === 'wa_mensajes') return { data: [{ enviado_at: avisado }] };
      return undefined;
    });
    // El objeto conv en memoria todavía dice avisado_at: null.
    const r = await registrarAviso(f.sb, conv({ avisado_at: null }), datos, bot(), { name: 'Torre Sol' }, 'https://app.ejemplo.com');
    expect(r).toBe('ya_avisado');
  });

  it('el cliente volvió tras ≥ 7 días: rearma, consulta los entrantes desde el último ≤ avisado_at y actualiza el lead existente sin tocar status', async () => {
    const avisado = new Date(AHORA.getTime() - 10 * DIA).toISOString();
    const base = new Date(AHORA.getTime() - 10 * DIA - 60_000).toISOString();
    const leadExistente = {
      id: 'lead9',
      project_id: 'proj1',
      unit_id: null,
      unit_name: null,
      name: 'Ana',
      email: null,
      phone: '+54 9 11 5555-1234',
      method: 'form',
      message: 'Desde la web',
      source: 'web',
      status: 'contactado',
      wa_conversacion_id: null,
      created_at: '2026-10-01T00:00:00.000Z',
    };
    const f = sbFalso(
      responderAviso((q) => {
        if (q.tabla === 'wa_conversaciones' && q.op === 'select') return { data: { avisado_at: avisado } };
        if (q.tabla === 'wa_mensajes' && q.unico === 'maybeSingle') return { data: { enviado_at: base } };
        if (q.tabla === 'wa_mensajes')
          return { data: [{ enviado_at: base }, { enviado_at: new Date(AHORA.getTime() - 60_000).toISOString() }] };
        if (q.tabla === 'leads' && q.op === 'select') return { data: [leadExistente] };
        if (q.tabla === 'leads' && q.op === 'update') return { data: null };
        return undefined;
      }),
    );
    const r = await registrarAviso(f.sb, conv({ avisado_at: avisado }), datos, bot(), { name: 'Torre Sol' }, 'https://app.ejemplo.com');
    expect(r).toBe('avisado');

    const [ultimo, desde] = f.consultas.filter((q) => q.tabla === 'wa_mensajes');
    expect(tiene(ultimo, 'eq', 'conversacion_id', 'conv1')).toBe(true);
    expect(tiene(ultimo, 'eq', 'autor', 'cliente')).toBe(true);
    expect(tiene(ultimo, 'lte', 'enviado_at', avisado)).toBe(true);
    expect(ultimo.orden).toEqual([['enviado_at', { ascending: false }]]);
    expect(tiene(desde, 'eq', 'autor', 'cliente')).toBe(true);
    expect(tiene(desde, 'gte', 'enviado_at', base)).toBe(true);
    expect(desde.orden).toEqual([['enviado_at', { ascending: true }]]);

    const upLead = f.escrituras().find((q) => q.tabla === 'leads');
    expect(upLead?.op).toBe('update');
    expect(tiene(upLead!, 'eq', 'id', 'lead9')).toBe(true);
    expect(upLead?.valores).not.toHaveProperty('status');
    const upConv = f.escrituras().find((q) => q.tabla === 'wa_conversaciones');
    expect(upConv?.valores).toMatchObject({ lead_id: 'lead9' });
  });

  it('sin RESEND_API_KEY no manda email ni busca al dueño', async () => {
    const f = sbFalso(responderAviso());
    await registrarAviso(f.sb, conv(), datos, bot(), { name: 'Torre Sol' }, 'https://app.ejemplo.com');
    await new Promise((r) => setTimeout(r, 0));
    expect(ResendFalso).not.toHaveBeenCalled();
    expect(f.getUserById).not.toHaveBeenCalled();
  });

  it('con RESEND_API_KEY manda el email de nuevo lead al dueño del proyecto', async () => {
    process.env.RESEND_API_KEY = 're_test';
    const f = sbFalso(responderAviso());
    await registrarAviso(f.sb, conv(), datos, bot(), { name: 'Torre <Sol>' }, 'https://app.ejemplo.com');
    // El email va sin await (después de marcar la conversación): se espera a que salga.
    await vi.waitFor(() => expect(enviarEmail).toHaveBeenCalledTimes(1));
    expect(f.getUserById).toHaveBeenCalledWith('owner1');
    const arg = enviarEmail.mock.calls[0][0] as { to: string; subject: string; html: string };
    expect(arg.to).toBe('duenio@ejemplo.com');
    expect(arg.subject).toBe('Nuevo lead en Torre <Sol>');
    expect(arg.html).toContain('Torre &lt;Sol&gt;');
    expect(arg.html).toContain('5491155551234');
  });

  it('el email de nuevo lead también le llega al equipo comercial (gestores y administradores aceptados)', async () => {
    process.env.RESEND_API_KEY = 're_test';
    const f = sbFalso(
      responderAviso((q) =>
        q.tabla === 'project_members' && q.op === 'select'
          ? {
              data: [
                { user_id: 'gestor1', role: 'gestor', status: 'accepted' },
                { user_id: 'admin1', role: 'administrador', status: 'accepted' },
                { user_id: 'editor1', role: 'editor', status: 'accepted' },
                { user_id: 'pend1', role: 'gestor', status: 'pending' },
              ],
            }
          : undefined,
      ),
    );
    f.getUserById.mockImplementation(async (id: string) => ({
      data: { user: { id, email: `${id}@ejemplo.com` } },
      error: null,
    }));
    await registrarAviso(f.sb, conv(), datos, bot(), { name: 'Torre Sol' }, 'https://app.ejemplo.com');
    await vi.waitFor(() => expect(enviarEmail).toHaveBeenCalledTimes(3));
    const miembros = f.consultas.find((q) => q.tabla === 'project_members');
    expect(miembros && tiene(miembros, 'eq', 'project_id', 'proj1')).toBe(true);
    const destinos = enviarEmail.mock.calls.map((c) => (c[0] as { to: string }).to);
    expect(destinos).toEqual(['owner1@ejemplo.com', 'gestor1@ejemplo.com', 'admin1@ejemplo.com']);
  });

  it('si no se pueden leer los miembros, igual avisa al dueño', async () => {
    process.env.RESEND_API_KEY = 're_test';
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const f = sbFalso(
      responderAviso((q) =>
        q.tabla === 'project_members' ? { error: { message: 'caído' } } : undefined,
      ),
    );
    await registrarAviso(f.sb, conv(), datos, bot(), { name: 'Torre Sol' }, 'https://app.ejemplo.com');
    await vi.waitFor(() => expect(enviarEmail).toHaveBeenCalledTimes(1));
    expect((enviarEmail.mock.calls[0][0] as { to: string }).to).toBe('duenio@ejemplo.com');
    err.mockRestore();
  });

  it('si el email falla, el aviso igual queda registrado', async () => {
    process.env.RESEND_API_KEY = 're_test';
    enviarEmail.mockRejectedValueOnce(new Error('caído'));
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const f = sbFalso(responderAviso());
    const r = await registrarAviso(f.sb, conv(), datos, bot(), { name: 'Torre Sol' }, 'https://app.ejemplo.com');
    expect(r).toBe('avisado');
    await vi.waitFor(() => expect(err).toHaveBeenCalled());
    expect(JSON.stringify(err.mock.calls)).not.toContain('duenio@ejemplo.com');
    err.mockRestore();
  });

  it('no espera los emails: registrarAviso resuelve aunque el envío siga colgado', async () => {
    process.env.RESEND_API_KEY = 're_test';
    let soltar: (v: { data: { id: string }; error: null }) => void = () => {};
    enviarEmail.mockImplementationOnce(() => new Promise((ok) => { soltar = ok; }));
    const f = sbFalso(responderAviso());
    const r = await registrarAviso(f.sb, conv(), datos, bot(), { name: 'Torre Sol' }, 'https://app.ejemplo.com');
    expect(r).toBe('avisado');
    // La conversación ya quedó marcada antes de que el email termine.
    expect(f.escrituras().some((q) => q.tabla === 'wa_conversaciones' && q.op === 'update')).toBe(true);
    await vi.waitFor(() => expect(enviarEmail).toHaveBeenCalledTimes(1));
    soltar({ data: { id: 'e1' }, error: null });
  });

  it('si encolar el aviso falla, no marca avisado_at (prefiere un aviso doble a uno perdido)', async () => {
    const f = sbFalso(
      responderAviso((q) =>
        q.tabla === 'wa_salida' && q.op === 'insert' ? { error: { message: 'timeout' } } : undefined,
      ),
    );
    await expect(
      registrarAviso(f.sb, conv(), datos, bot({ vendedor_whatsapp: '5491144440000' }), { name: 'Torre Sol' }, 'https://app.ejemplo.com'),
    ).rejects.toThrow(/wa_salida/);
    expect(f.escrituras().some((q) => q.tabla === 'wa_conversaciones')).toBe(false);
  });

  it('escribe el lead y encola el aviso antes de marcar avisado_at', async () => {
    const f = sbFalso(responderAviso());
    await registrarAviso(f.sb, conv(), datos, bot({ vendedor_whatsapp: '5491144440000' }), { name: 'Torre Sol' }, 'https://app.ejemplo.com');
    expect(f.escrituras().map((q) => q.tabla)).toEqual(['leads', 'wa_salida', 'wa_conversaciones']);
  });

  it('un error de Supabase se propaga como Error con contexto', async () => {
    const f = sbFalso(
      responderAviso((q) =>
        q.tabla === 'leads' && q.op === 'insert' ? { error: { message: 'violates check' } } : undefined,
      ),
    );
    await expect(
      registrarAviso(f.sb, conv(), datos, bot(), { name: 'Torre Sol' }, 'https://app.ejemplo.com'),
    ).rejects.toThrow(/leads/);
  });
});

// ─── Conversaciones y mensajes ───

describe('obtenerOCrearConversacion', () => {
  const contacto = { numero: '+54 9 11 5555-1234', wid: '5491155551234@c.us', nombre: 'Ana' };

  function f2() {
    return sbFalso((q) => {
      if (q.tabla === 'wa_conversaciones' && q.op === 'select') return { data: null };
      if (q.tabla === 'wa_conversaciones' && q.op === 'insert')
        return { data: { ...conv(), ...(q.valores as object) } };
      return undefined;
    });
  }

  it('primer mensaje anterior a vinculado_at → creada_post_vinculo: false', async () => {
    const f = f2();
    const c = await obtenerOCrearConversacion(f.sb, bot(), contacto, new Date('2026-11-09T00:00:00.000Z'));
    expect(c.creada_post_vinculo).toBe(false);
    const ins = f.escrituras().find((q) => q.tabla === 'wa_conversaciones');
    expect(ins?.valores).toMatchObject({
      bot_id: 'bot1',
      project_id: 'proj1',
      contacto_numero: '5491155551234',
      contacto_wid: '5491155551234@c.us',
      contacto_nombre: 'Ana',
      creada_post_vinculo: false,
      // Spec §6: los chats previos al vínculo quedan en humano para siempre.
      modo: 'humano',
      humano_hasta: null,
    });
    expect(c.modo).toBe('humano');
  });

  it('primer mensaje posterior a vinculado_at → creada_post_vinculo: true', async () => {
    const f = f2();
    const c = await obtenerOCrearConversacion(f.sb, bot(), contacto, new Date('2026-11-11T00:00:00.000Z'));
    expect(c.creada_post_vinculo).toBe(true);
    const ins = f.escrituras().find((q) => q.tabla === 'wa_conversaciones');
    expect(ins?.valores).toMatchObject({ creada_post_vinculo: true, modo: 'bot', humano_hasta: null });
  });

  it('primer mensaje nuevo pero WhatsApp tiene historial previo al vínculo → pre-vínculo y modo humano', async () => {
    const f = f2();
    const tieneHistorialPrevio = vi.fn(async () => true);
    const c = await obtenerOCrearConversacion(f.sb, bot(), contacto, new Date('2026-11-11T00:00:00.000Z'), {
      tieneHistorialPrevio,
    });
    expect(tieneHistorialPrevio).toHaveBeenCalledWith(new Date(bot().vinculado_at as string));
    expect(c.creada_post_vinculo).toBe(false);
    const ins = f.escrituras().find((q) => q.tabla === 'wa_conversaciones');
    expect(ins?.valores).toMatchObject({ creada_post_vinculo: false, modo: 'humano', humano_hasta: null });
  });

  it('sin historial previo en WhatsApp → post-vínculo', async () => {
    const f = f2();
    const c = await obtenerOCrearConversacion(f.sb, bot(), contacto, new Date('2026-11-11T00:00:00.000Z'), {
      tieneHistorialPrevio: async () => false,
    });
    expect(c.creada_post_vinculo).toBe(true);
    expect(c.modo).toBe('bot');
  });

  it('el historial previo solo se consulta al crear (no si ya existe ni si el mensaje ya es previo)', async () => {
    const tieneHistorialPrevio = vi.fn(async () => true);
    const existe = sbFalso((q) => (q.tabla === 'wa_conversaciones' ? { data: conv({ id: 'vieja' }) } : undefined));
    await obtenerOCrearConversacion(existe.sb, bot(), contacto, AHORA, { tieneHistorialPrevio });
    await obtenerOCrearConversacion(f2().sb, bot(), contacto, new Date('2026-11-09T00:00:00.000Z'), { tieneHistorialPrevio });
    expect(tieneHistorialPrevio).not.toHaveBeenCalled();
  });

  it('si ya existe la devuelve sin insertar', async () => {
    const f = sbFalso((q) => (q.tabla === 'wa_conversaciones' ? { data: conv({ id: 'vieja' }) } : undefined));
    const c = await obtenerOCrearConversacion(f.sb, bot(), contacto, AHORA);
    expect(c.id).toBe('vieja');
    expect(f.escrituras()).toEqual([]);
    const sel = f.consultas[0];
    expect(tiene(sel, 'eq', 'bot_id', 'bot1')).toBe(true);
    expect(tiene(sel, 'eq', 'contacto_numero', '5491155551234')).toBe(true);
  });

  it('si otro proceso la creó en el medio (23505) la vuelve a leer', async () => {
    let lecturas = 0;
    const f = sbFalso((q) => {
      if (q.tabla !== 'wa_conversaciones') return undefined;
      if (q.op === 'select') return { data: lecturas++ === 0 ? null : conv({ id: 'ganadora' }) };
      return { error: { message: 'duplicate key', code: '23505' } };
    });
    const c = await obtenerOCrearConversacion(f.sb, bot(), contacto, AHORA);
    expect(c.id).toBe('ganadora');
  });
});

describe('guardarMensaje', () => {
  const nuevo = {
    conversacion_id: 'conv1',
    wa_id: 'w9',
    direccion: 'entrante' as const,
    autor: 'cliente' as const,
    tipo: 'texto' as const,
    cuerpo: 'Hola',
    media_path: null,
    enviado_at: AHORA.toISOString(),
    ack: null,
  };

  it('duplicado (upsert ignorado) → "duplicado" y no toca la conversación', async () => {
    const f = sbFalso((q) => (q.tabla === 'wa_mensajes' ? { data: [] } : undefined));
    expect(await guardarMensaje(f.sb, nuevo)).toBe('duplicado');
    const up = f.consultas[0];
    expect(up.op).toBe('upsert');
    expect(up.opciones).toEqual({ onConflict: 'wa_id', ignoreDuplicates: true });
    expect(f.escrituras().filter((q) => q.tabla === 'wa_conversaciones')).toEqual([]);
  });

  it('entrante nuevo → actualiza último mensaje, último entrante y suma no_leidos', async () => {
    const f = sbFalso((q) => {
      if (q.tabla === 'wa_mensajes') return { data: [{ id: 'm9' }] };
      if (q.tabla === 'wa_conversaciones' && q.op === 'select')
        return { data: { no_leidos: 2, ultimo_mensaje_at: '2026-11-20T14:00:00.000Z' } };
      return undefined;
    });
    expect(await guardarMensaje(f.sb, nuevo)).toBe('nuevo');
    const up = f.escrituras().find((q) => q.tabla === 'wa_conversaciones');
    expect(up?.valores).toEqual({
      ultimo_mensaje: 'Hola',
      ultimo_mensaje_at: AHORA.toISOString(),
      ultimo_entrante_at: AHORA.toISOString(),
      no_leidos: 3,
    });
  });

  it('saliente nuevo → no suma no_leidos', async () => {
    const f = sbFalso((q) => {
      if (q.tabla === 'wa_mensajes') return { data: [{ id: 'm9' }] };
      if (q.tabla === 'wa_conversaciones' && q.op === 'select') return { data: { no_leidos: 2, ultimo_mensaje_at: null } };
      return undefined;
    });
    await guardarMensaje(f.sb, { ...nuevo, direccion: 'saliente', autor: 'bot' });
    const up = f.escrituras().find((q) => q.tabla === 'wa_conversaciones');
    expect(up?.valores).toEqual({ ultimo_mensaje: 'Hola', ultimo_mensaje_at: AHORA.toISOString() });
  });
});

describe('historial', () => {
  it('suma las respuestas del bot todavía en la cola y ordena por (orden_at ?? enviado_at)', async () => {
    const m1 = mensaje({ id: 'm1', cuerpo: 'M1', enviado_at: '2026-11-20T14:57:00.000Z' });
    const m2 = mensaje({ id: 'm2', cuerpo: 'M2', enviado_at: '2026-11-20T14:57:05.000Z' });
    const pendiente = salida({
      id: 's1',
      estado: 'pendiente',
      cuerpo: 'Respuesta a M1',
      created_at: '2026-11-20T14:57:09.000Z',
      orden_at: '2026-11-20T14:57:00.001Z',
    });
    const f = sbFalso((q) => {
      if (q.tabla === 'wa_mensajes') return { data: [m2, m1] };
      if (q.tabla === 'wa_salida') return { data: [pendiente] };
      return undefined;
    });
    const h = await historial(f.sb, 'conv1');
    expect(h.map((m) => m.cuerpo)).toEqual(['M1', 'Respuesta a M1', 'M2']);
    expect(h[1]).toMatchObject({
      id: 's1',
      conversacion_id: 'conv1',
      autor: 'bot',
      direccion: 'saliente',
      tipo: 'texto',
      enviado_at: '2026-11-20T14:57:09.000Z',
      orden_at: '2026-11-20T14:57:00.001Z',
      wa_id: null,
      salida_id: 's1',
    });

    const qs = f.consultas.find((q) => q.tabla === 'wa_salida')!;
    expect(tiene(qs, 'eq', 'conversacion_id', 'conv1')).toBe(true);
    expect(tiene(qs, 'eq', 'origen', 'bot')).toBe(true);
    expect(tiene(qs, 'in', 'estado', ['pendiente', 'enviando'])).toBe(true);
    const qm = f.consultas.find((q) => q.tabla === 'wa_mensajes')!;
    expect(tiene(qm, 'eq', 'conversacion_id', 'conv1')).toBe(true);
    expect(qm.limite).toBe(40);
  });

  it('una imagen en cola se ve como tipo imagen', async () => {
    const f = sbFalso((q) =>
      q.tabla === 'wa_salida'
        ? { data: [salida({ estado: 'enviando', cuerpo: null, adjunto_url: 'https://x/1.jpg' })] }
        : { data: [] },
    );
    const [m] = await historial(f.sb, 'conv1');
    expect(m.tipo).toBe('imagen');
  });

  it('no duplica una salida que ya quedó registrada en wa_mensajes (por salida_id) entre las dos lecturas', async () => {
    const s = salida({ id: 's1', estado: 'enviando', cuerpo: 'Hola!', orden_at: '2026-11-20T14:57:00.001Z' });
    const registrada = mensaje({
      id: 'm5',
      autor: 'bot',
      direccion: 'saliente',
      cuerpo: 'Hola!',
      enviado_at: '2026-11-20T14:58:30.000Z',
      orden_at: '2026-11-20T14:57:00.001Z',
      salida_id: 's1',
    });
    const f = sbFalso((q) => (q.tabla === 'wa_salida' ? { data: [s] } : { data: [registrada] }));
    const h = await historial(f.sb, 'conv1');
    expect(h).toHaveLength(1);
    expect(h[0].id).toBe('m5');
  });

  it('las partes de una respuesta (algunas enviadas, otras en cola) salen p1, p2, p3', async () => {
    const base = Date.parse('2026-11-20T14:57:00.001Z');
    const m1 = mensaje({ id: 'm1', cuerpo: 'M1', enviado_at: '2026-11-20T14:57:00.000Z' });
    const p1 = mensaje({
      id: 'mp1', autor: 'bot', direccion: 'saliente', cuerpo: 'p1', salida_id: 'sp1',
      enviado_at: '2026-11-20T14:57:20.000Z', orden_at: iso(base),
    });
    const p2 = mensaje({
      id: 'mp2', autor: 'bot', direccion: 'saliente', cuerpo: 'p2', salida_id: 'sp2',
      enviado_at: '2026-11-20T14:57:25.000Z', orden_at: iso(base + 1),
    });
    const p3 = salida({ id: 'sp3', estado: 'pendiente', cuerpo: 'p3', orden_at: iso(base + 2) });
    const f = sbFalso((q) =>
      // wa_mensajes llega del más nuevo al más viejo, como lo pide la consulta.
      q.tabla === 'wa_salida' ? { data: [p3] } : { data: [p2, p1, m1] },
    );
    const h = await historial(f.sb, 'conv1');
    expect(h.map((m) => m.cuerpo)).toEqual(['M1', 'p1', 'p2', 'p3']);
  });

  it('mensajes con el mismo orden_at conservan el orden de envío aunque se lean del más nuevo al más viejo', async () => {
    const o = '2026-11-20T14:57:00.001Z';
    const a = mensaje({ id: 'a', autor: 'bot', direccion: 'saliente', cuerpo: 'a', orden_at: o, enviado_at: '2026-11-20T14:57:20.000Z' });
    const b = mensaje({ id: 'b', autor: 'bot', direccion: 'saliente', cuerpo: 'b', orden_at: o, enviado_at: '2026-11-20T14:57:25.000Z' });
    const f = sbFalso((q) => (q.tabla === 'wa_salida' ? { data: [] } : { data: [b, a] }));
    expect((await historial(f.sb, 'conv1')).map((m) => m.cuerpo)).toEqual(['a', 'b']);
  });

  it('imágenes sin texto del mismo turno no se deduplican entre sí', async () => {
    const base = Date.parse('2026-11-20T14:57:00.001Z');
    const i1 = mensaje({
      id: 'mi1', autor: 'bot', direccion: 'saliente', tipo: 'imagen', cuerpo: null, salida_id: 'si1',
      enviado_at: '2026-11-20T14:57:20.000Z', orden_at: iso(base),
    });
    const i2 = salida({ id: 'si2', estado: 'enviando', cuerpo: null, adjunto_url: 'https://x/2.jpg', orden_at: iso(base + 1) });
    const i3 = salida({ id: 'si3', estado: 'pendiente', cuerpo: null, adjunto_url: 'https://x/3.jpg', orden_at: iso(base + 2) });
    const f = sbFalso((q) => (q.tabla === 'wa_salida' ? { data: [i2, i3] } : { data: [i1] }));
    const h = await historial(f.sb, 'conv1');
    expect(h.map((m) => m.id)).toEqual(['mi1', 'si2', 'si3']);
  });

  it('devuelve como mucho los últimos n', async () => {
    const ms = Array.from({ length: 5 }, (_, i) =>
      mensaje({ id: `m${i}`, cuerpo: `M${i}`, enviado_at: new Date(AHORA.getTime() - (5 - i) * 1000).toISOString() }),
    );
    const f = sbFalso((q) =>
      q.tabla === 'wa_salida'
        ? { data: [salida({ estado: 'pendiente', cuerpo: 'R', created_at: AHORA.toISOString(), orden_at: AHORA.toISOString() })] }
        : { data: [...ms].reverse() },
    );
    const h = await historial(f.sb, 'conv1', 3);
    expect(h.map((m) => m.cuerpo)).toEqual(['M3', 'M4', 'R']);
  });
});

describe('contarRespuestasBotUltimaHora', () => {
  it('cuenta mensajes del bot de la última hora', async () => {
    const f = sbFalso(() => ({ count: 7 }));
    expect(await contarRespuestasBotUltimaHora(f.sb, 'conv1')).toBe(7);
    const q = f.consultas[0];
    expect(q.tabla).toBe('wa_mensajes');
    expect(q.selectOpts).toEqual({ count: 'exact', head: true });
    expect(tiene(q, 'eq', 'autor', 'bot')).toBe(true);
    expect(tiene(q, 'gte', 'enviado_at', new Date(AHORA.getTime() - 3_600_000).toISOString())).toBe(true);
  });
});

// ─── Cola de salida ───

describe('encolar', () => {
  it('inserta pendiente y pasa orden_at si viene', async () => {
    const f = sbFalso((q) => ({ data: { ...salida(), ...(q.valores as object) } }));
    await encolar(f.sb, {
      bot_id: 'bot1',
      conversacion_id: 'conv1',
      destino: '5491155551234@c.us',
      cuerpo: 'Hola',
      adjunto_url: null,
      origen: 'bot',
      autor_id: null,
      orden_at: '2026-11-20T14:57:00.001Z',
    });
    expect(f.consultas[0].op).toBe('insert');
    expect(f.consultas[0].valores).toMatchObject({ orden_at: '2026-11-20T14:57:00.001Z', origen: 'bot' });
  });

  it('con parte suma parte ms a la base (cada parte de un turno tiene su orden_at) y no la guarda', async () => {
    const f = sbFalso((q) => ({ data: { ...salida(), ...(q.valores as object) } }));
    await encolar(f.sb, {
      bot_id: 'bot1',
      conversacion_id: 'conv1',
      destino: '5491155551234@c.us',
      cuerpo: 'p3',
      adjunto_url: null,
      origen: 'bot',
      autor_id: null,
      orden_at: '2026-11-20T14:57:00.001Z',
      parte: 2,
    });
    const v = f.consultas[0].valores as Record<string, unknown>;
    expect(v.orden_at).toBe('2026-11-20T14:57:00.003Z');
    expect(v).not.toHaveProperty('parte');
  });

  it('sin orden_at lo deja en null', async () => {
    const f = sbFalso((q) => ({ data: { ...salida(), ...(q.valores as object) } }));
    await encolar(f.sb, {
      bot_id: 'bot1',
      conversacion_id: null,
      destino: '5491144440000',
      cuerpo: 'aviso',
      adjunto_url: null,
      origen: 'aviso',
      autor_id: null,
    });
    expect(f.consultas[0].valores).toMatchObject({ orden_at: null });
  });
});

describe('tomarSiguienteSalida', () => {
  it('sin candidatos → null y no actualiza', async () => {
    const f = sbFalso(() => ({ data: null }));
    expect(await tomarSiguienteSalida(f.sb, 'bot1')).toBeNull();
    expect(f.escrituras()).toEqual([]);
  });

  it('toma la pendiente con update condicionado al estado leído', async () => {
    const leida = salida({ estado: 'pendiente', tomado_at: null });
    const f = sbFalso((q) =>
      q.op === 'select'
        ? { data: leida }
        : { data: [{ ...leida, ...(q.valores as object) }] },
    );
    const s = await tomarSiguienteSalida(f.sb, 'bot1');
    expect(s?.estado).toBe('enviando');
    const sel = f.consultas[0];
    expect(tiene(sel, 'eq', 'bot_id', 'bot1')).toBe(true);
    expect(sel.limite).toBe(1);
    const up = f.escrituras()[0];
    expect(up.valores).toEqual({ estado: 'enviando', tomado_at: AHORA.toISOString() });
    expect(tiene(up, 'eq', 'id', 's1')).toBe(true);
    expect(tiene(up, 'eq', 'estado', 'pendiente')).toBe(true);
  });

  it('si otro proceso la tomó primero (update afecta 0 filas) → null', async () => {
    const f = sbFalso((q) => (q.op === 'select' ? { data: salida({ estado: 'pendiente' }) } : { data: [] }));
    expect(await tomarSiguienteSalida(f.sb, 'bot1')).toBeNull();
  });

  /** La primera lectura de wa_salida devuelve `candidatas[0]`, la segunda `candidatas[1]`, … */
  function colaFalsa(candidatas: WaSalida[], registrado: Partial<WaMensaje> | null = null) {
    let k = 0;
    return sbFalso((q) => {
      if (q.tabla === 'wa_mensajes') return { data: registrado };
      if (q.op === 'select') return { data: candidatas[k++] ?? null };
      const leida = candidatas[k - 1];
      return { data: [{ ...leida, ...(q.valores as object) }] };
    });
  }

  it('una enviando colgada se retoma sumando un intento y condicionando también tomado_at', async () => {
    const leida = salida({ estado: 'enviando', tomado_at: '2026-11-20T14:50:00.000Z', intentos: 1 });
    const f = colaFalsa([leida]);
    const s = await tomarSiguienteSalida(f.sb, 'bot1');
    expect(s?.intentos).toBe(2);
    const chequeo = f.consultas.find((q) => q.tabla === 'wa_mensajes')!;
    expect(tiene(chequeo, 'eq', 'salida_id', 's1')).toBe(true);
    const up = f.escrituras()[0];
    expect(up.valores).toEqual({ estado: 'enviando', tomado_at: AHORA.toISOString(), intentos: 2 });
    expect(tiene(up, 'eq', 'estado', 'enviando')).toBe(true);
    expect(tiene(up, 'eq', 'tomado_at', '2026-11-20T14:50:00.000Z')).toBe(true);
  });

  it('una enviando colgada que agota los intentos pasa a error y no se retoma', async () => {
    const leida = salida({ estado: 'enviando', tomado_at: '2026-11-20T14:50:00.000Z', intentos: 4 });
    const f = colaFalsa([leida]);
    expect(await tomarSiguienteSalida(f.sb, 'bot1')).toBeNull();
    const up = f.escrituras()[0];
    expect(up.valores).toMatchObject({ estado: 'error', intentos: 5, tomado_at: null });
    expect(tiene(up, 'eq', 'estado', 'enviando')).toBe(true);
    expect(tiene(up, 'eq', 'tomado_at', '2026-11-20T14:50:00.000Z')).toBe(true);
    expect(f.escrituras()).toHaveLength(1);
  });

  it('una enviando colgada que ya quedó registrada en wa_mensajes se marca enviada, no se reenvía', async () => {
    const leida = salida({ estado: 'enviando', tomado_at: '2026-11-20T14:50:00.000Z' });
    const f = colaFalsa([leida], { wa_id: 'wa-9', enviado_at: '2026-11-20T14:50:05.000Z' });
    expect(await tomarSiguienteSalida(f.sb, 'bot1')).toBeNull();
    const ups = f.escrituras();
    expect(ups).toHaveLength(1);
    expect(ups[0].valores).toEqual({ estado: 'enviado', wa_id: 'wa-9', enviado_at: '2026-11-20T14:50:05.000Z', error: null });
    expect(tiene(ups[0], 'eq', 'estado', 'enviando')).toBe(true);
  });

  it('después de resolver una colgada sigue con la próxima candidata', async () => {
    const colgada = salida({ id: 's1', estado: 'enviando', tomado_at: '2026-11-20T14:50:00.000Z', intentos: 4 });
    const pendiente = salida({ id: 's2', estado: 'pendiente', tomado_at: null });
    const f = colaFalsa([colgada, pendiente]);
    const s = await tomarSiguienteSalida(f.sb, 'bot1');
    expect(s?.id).toBe('s2');
    expect(s?.estado).toBe('enviando');
  });

  it('el filtro de candidatos usa ahora y ahora-2min calculados en JS', async () => {
    const f = sbFalso(() => ({ data: null }));
    await tomarSiguienteSalida(f.sb, 'bot1');
    const or = f.consultas[0].filtros.find((x) => x[0] === 'or')?.[1] as string;
    expect(or).toContain('estado.eq.pendiente');
    expect(or).toContain(`proximo_intento_at.lte."${AHORA.toISOString()}"`);
    expect(or).toContain('estado.eq.enviando');
    expect(or).toContain(`tomado_at.lt."${new Date(AHORA.getTime() - 120_000).toISOString()}"`);
  });
});

describe('registrarSalidaEnviada', () => {
  it('registra el mensaje saliente con el orden_at de la salida y marca la salida enviada', async () => {
    const f = sbFalso((q) => {
      if (q.tabla === 'wa_mensajes') return { data: [{ id: 'm1' }] };
      if (q.tabla === 'wa_conversaciones' && q.op === 'select') return { data: { no_leidos: 0, ultimo_mensaje_at: null } };
      return undefined;
    });
    await registrarSalidaEnviada(f.sb, salida(), 'wa-123', 'bot');
    const [ins] = f.escrituras().filter((q) => q.tabla === 'wa_mensajes');
    expect(ins.valores).toEqual({
      conversacion_id: 'conv1',
      wa_id: 'wa-123',
      direccion: 'saliente',
      autor: 'bot',
      tipo: 'texto',
      cuerpo: 'Hola, te cuento',
      media_path: null,
      enviado_at: AHORA.toISOString(),
      ack: null,
      orden_at: '2026-11-20T14:57:00.001Z',
      salida_id: 's1',
    });
    const upd = f.escrituras().filter((q) => q.tabla === 'wa_salida');
    expect(upd).toHaveLength(1);
    expect(upd[0].valores).toMatchObject({ estado: 'enviado', wa_id: 'wa-123', enviado_at: AHORA.toISOString() });
    expect(tiene(upd[0], 'eq', 'id', 's1')).toBe(true);
    // Primero el mensaje, después la salida: el historial nunca pierde la respuesta.
    expect(f.consultas.indexOf(ins)).toBeLessThan(f.consultas.indexOf(upd[0]));
  });

  it('sin orden_at en la salida usa ahora; imagen queda como tipo imagen', async () => {
    const f = sbFalso((q) => (q.tabla === 'wa_mensajes' ? { data: [{ id: 'm1' }] } : { data: { no_leidos: 0 } }));
    await registrarSalidaEnviada(f.sb, salida({ orden_at: null, adjunto_url: 'https://x/1.jpg', cuerpo: null }), 'wa-1', 'vendedor');
    const [ins] = f.escrituras().filter((q) => q.tabla === 'wa_mensajes');
    expect(ins.valores).toMatchObject({ orden_at: AHORA.toISOString(), tipo: 'imagen', autor: 'vendedor' });
  });

  it('un PDF (el brief) queda como tipo documento, no imagen', async () => {
    const f = sbFalso((q) => (q.tabla === 'wa_mensajes' ? { data: [{ id: 'm1' }] } : { data: { no_leidos: 0 } }));
    await registrarSalidaEnviada(f.sb, salida({ adjunto_url: 'https://x/brief/1-a/brief-torre.PDF', cuerpo: null }), 'wa-1', 'bot');
    const [ins] = f.escrituras().filter((q) => q.tabla === 'wa_mensajes');
    expect(ins.valores).toMatchObject({ tipo: 'documento' });
  });

  it('un aviso (sin conversación) solo se marca enviado', async () => {
    const f = sbFalso();
    await registrarSalidaEnviada(f.sb, salida({ conversacion_id: null, origen: 'aviso' }), 'wa-1', 'bot');
    expect(f.escrituras().map((q) => q.tabla)).toEqual(['wa_salida']);
  });
});

describe('marcarFallo', () => {
  it('al 5º intento queda en error', async () => {
    const f = sbFalso();
    await marcarFallo(f.sb, 's1', 5, 'timeout');
    expect(f.consultas[0].valores).toMatchObject({ estado: 'error', intentos: 5, error: 'timeout' });
  });

  it('antes del 5º vuelve a pendiente con espera 2^intentos × 30 s', async () => {
    const f = sbFalso();
    await marcarFallo(f.sb, 's1', 2, 'timeout');
    expect(f.consultas[0].valores).toEqual({
      estado: 'pendiente',
      intentos: 2,
      error: 'timeout',
      tomado_at: null,
      proximo_intento_at: new Date(AHORA.getTime() + 4 * 30_000).toISOString(),
    });
  });
});

// ─── Bots ───

describe('tomarBots', () => {
  it('update único condicionado a host_permitido y lease vencido/propio', async () => {
    const f = sbFalso(() => ({ data: [bot()] }));
    const r = await tomarBots(f.sb, 'srv1');
    expect(r).toHaveLength(1);
    const q = f.consultas[0];
    expect(q.op).toBe('update');
    expect(q.valores).toEqual({ puente_host: 'srv1', puente_hasta: new Date(AHORA.getTime() + 90_000).toISOString() });
    expect(tiene(q, 'eq', 'host_permitido', 'srv1')).toBe(true);
    const or = q.filtros.find((x) => x[0] === 'or')?.[1] as string;
    expect(or).toBe(`puente_hasta.is.null,puente_hasta.lt."${AHORA.toISOString()}",puente_host.eq."srv1"`);
  });

  it('si otro puente los tiene → []', async () => {
    const f = sbFalso(() => ({ data: [] }));
    expect(await tomarBots(f.sb, 'srv1')).toEqual([]);
  });
});

describe('guardarEstado', () => {
  it('error de Supabase → Error con contexto', async () => {
    const f = sbFalso(() => ({ error: { message: 'boom' } }));
    await expect(guardarEstado(f.sb, 'bot1', { estado: 'error' })).rejects.toThrow(/wa_bots.*boom/);
  });
});

describe('sumarMensajeDelDia', () => {
  it('día nuevo (zona Buenos Aires) reinicia el contador en 1', async () => {
    // 02:00 UTC del 21 = 23:00 del 20 en Buenos Aires.
    vi.setSystemTime(new Date('2026-11-21T02:00:00.000Z'));
    const f = sbFalso((q) =>
      q.op === 'select'
        ? { data: { mensajes_hoy: 250, mensajes_hoy_fecha: '2026-11-19' } }
        : { data: [{ id: 'bot1' }] },
    );
    expect(await sumarMensajeDelDia(f.sb, bot())).toBe(1);
    expect(f.escrituras()[0].valores).toEqual({ mensajes_hoy: 1, mensajes_hoy_fecha: '2026-11-20' });
  });

  it('mismo día suma 1, condicionado al valor leído', async () => {
    vi.setSystemTime(new Date('2026-11-21T02:00:00.000Z'));
    const f = sbFalso((q) =>
      q.op === 'select'
        ? { data: { mensajes_hoy: 7, mensajes_hoy_fecha: '2026-11-20' } }
        : { data: [{ id: 'bot1' }] },
    );
    expect(await sumarMensajeDelDia(f.sb, bot())).toBe(8);
    const up = f.escrituras()[0];
    expect(up.valores).toEqual({ mensajes_hoy: 8, mensajes_hoy_fecha: '2026-11-20' });
    expect(tiene(up, 'eq', 'mensajes_hoy', 7)).toBe(true);
  });
});

// ─── Lecturas y escrituras del puente (Task 8) ───

describe('leerBot / leerConversacion', () => {
  it('leen por id; null si no existe', async () => {
    const f = sbFalso((q) => (q.tabla === 'wa_bots' ? { data: bot() } : { data: null }));
    expect(await leerBot(f.sb, 'bot1')).toMatchObject({ id: 'bot1' });
    expect(tiene(f.consultas[0], 'eq', 'id', 'bot1')).toBe(true);
    expect(await leerConversacion(f.sb, 'conv1')).toBeNull();
    expect(f.consultas[1].tabla).toBe('wa_conversaciones');
  });
});

describe('pausarIa', () => {
  it('guarda (o limpia) ia_pausada_motivo', async () => {
    const f = sbFalso();
    await pausarIa(f.sb, 'conv1', 'refusal');
    await pausarIa(f.sb, 'conv1', null);
    expect(f.consultas.map((q) => q.valores)).toEqual([{ ia_pausada_motivo: 'refusal' }, { ia_pausada_motivo: null }]);
    expect(tiene(f.consultas[0], 'eq', 'id', 'conv1')).toBe(true);
  });

  it('con vistoHasta también corre la marca ia_visto_hasta', async () => {
    const f = sbFalso();
    await pausarIa(f.sb, 'conv1', 'contestador', '2026-11-20T14:57:00.000Z');
    expect(f.consultas[0].valores).toEqual({ ia_pausada_motivo: 'contestador', ia_visto_hasta: '2026-11-20T14:57:00.000Z' });
  });
});

describe('guardarAck', () => {
  it('actualiza el ack del mensaje por wa_id, sin bajarlo', async () => {
    const f = sbFalso();
    await guardarAck(f.sb, 'true_x_1', 3);
    const q = f.consultas[0];
    expect(q).toMatchObject({ tabla: 'wa_mensajes', op: 'update', valores: { ack: 3 } });
    expect(tiene(q, 'eq', 'wa_id', 'true_x_1')).toBe(true);
    expect(q.filtros.find((x) => x[0] === 'or')?.[1]).toBe('ack.is.null,ack.lt.3');
  });
});

describe('subirMedio', () => {
  it("sube al bucket 'wa-medios' con su tipo y devuelve la ruta", async () => {
    const upload = vi.fn(async () => ({ data: { path: 'p/c/w.ogg' }, error: null }));
    const from = vi.fn(() => ({ upload }));
    const sb = { storage: { from } } as unknown as SupabaseClient;
    const data = Buffer.from('ogg');
    expect(await subirMedio(sb, 'p/c/w.ogg', { mime: 'audio/ogg; codecs=opus', data })).toBe('p/c/w.ogg');
    expect(from).toHaveBeenCalledWith('wa-medios');
    expect(upload).toHaveBeenCalledWith('p/c/w.ogg', data, { contentType: 'audio/ogg; codecs=opus', upsert: true });
  });

  it('error de Storage → Error con contexto', async () => {
    const sb = {
      storage: { from: () => ({ upload: async () => ({ data: null, error: { message: 'quota' } }) }) },
    } as unknown as SupabaseClient;
    await expect(subirMedio(sb, 'p/c/w.ogg', { mime: 'audio/ogg', data: Buffer.from('') })).rejects.toThrow(/wa-medios.*quota/);
  });
});

describe('registrarSalidaEnviada sin wa_id', () => {
  it('WhatsApp no devolvió id: guarda wa_id null en el mensaje y en la salida', async () => {
    const f = sbFalso((q) => (q.tabla === 'wa_mensajes' ? { data: [{ id: 'm1' }] } : { data: { no_leidos: 0 } }));
    await registrarSalidaEnviada(f.sb, salida(), null, 'bot');
    const [ins] = f.escrituras().filter((q) => q.tabla === 'wa_mensajes');
    expect(ins.valores).toMatchObject({ wa_id: null, salida_id: 's1' });
    const [upd] = f.escrituras().filter((q) => q.tabla === 'wa_salida');
    expect(upd.valores).toMatchObject({ estado: 'enviado', wa_id: null });
  });
});

describe('fechaBuenosAires', () => {
  it('fecha local de Buenos Aires (UTC-3)', () => {
    expect(fechaBuenosAires(new Date('2026-11-21T02:00:00.000Z'))).toBe('2026-11-20');
    expect(fechaBuenosAires(new Date('2026-11-21T03:00:00.000Z'))).toBe('2026-11-21');
  });
});

describe('visitas', () => {
  const inicio = new Date('2026-11-20T14:00:00.000Z');
  const fin = new Date('2026-11-20T15:00:00.000Z');
  const base = (b = bot({ vendedor_whatsapp: '5491144440000' })) => ({
    bot: b, conv: conv(), inicio, fin, nombre: 'Ana', proyecto: { name: 'Torre Sol' }, urlAdmin: 'https://app.ejemplo.com',
  });

  it('agendarVisita: inserta con el lead de la conversación y avisa al vendedor', async () => {
    const f = sbFalso((q) => (q.tabla === 'wa_conversaciones' ? { data: { lead_id: 'lead7' } } : q.tabla === 'wa_salida' ? { data: salida() } : undefined));
    expect(await agendarVisita(f.sb, base())).toBe('agendada');
    const ins = f.escrituras().find((q) => q.tabla === 'wa_visitas');
    expect(ins?.valores).toMatchObject({ project_id: 'proj1', conversacion_id: 'conv1', lead_id: 'lead7', inicio: inicio.toISOString(), fin: fin.toISOString(), nombre: 'Ana' });
    const aviso = f.escrituras().find((q) => q.tabla === 'wa_salida');
    expect((aviso?.valores as { cuerpo: string }).cuerpo).toContain('📅 Visita agendada – Torre Sol');
    expect((aviso?.valores as { cuerpo: string }).cuerpo).toContain('vie 20/11 11:00 (60 min)');
  });

  it('agendarVisita: turno tomado por otra (índice único) → ocupado, sin aviso', async () => {
    const f = sbFalso((q) =>
      q.tabla === 'wa_visitas' ? { error: { message: 'dup', code: '23505' } } : q.tabla === 'wa_conversaciones' ? { data: { lead_id: null } } : undefined,
    );
    expect(await agendarVisita(f.sb, base())).toBe('ocupado');
    expect(f.escrituras().some((q) => q.tabla === 'wa_salida')).toBe(false);
  });

  it('cancelarVisitasDeConversacion: solo futuras de esta charla y avisa por cada una', async () => {
    const f = sbFalso((q) =>
      q.tabla === 'wa_visitas'
        ? { data: [{ id: 'v1', inicio: inicio.toISOString(), fin: fin.toISOString(), nombre: 'Ana' }] }
        : q.tabla === 'wa_salida' ? { data: salida() } : undefined,
    );
    const r = await cancelarVisitasDeConversacion(f.sb, { bot: bot({ vendedor_whatsapp: '5491144440000' }), conv: conv(), ahora: AHORA, proyecto: { name: 'Torre Sol' }, urlAdmin: 'https://app.ejemplo.com' });
    expect(r).toHaveLength(1);
    const upd = f.escrituras().find((q) => q.tabla === 'wa_visitas')!;
    expect(upd.valores).toEqual({ estado: 'cancelada' });
    expect(tiene(upd, 'eq', 'conversacion_id', 'conv1')).toBe(true);
    expect(tiene(upd, 'gt', 'inicio', AHORA.toISOString())).toBe(true);
    expect((f.escrituras().find((q) => q.tabla === 'wa_salida')?.valores as { cuerpo: string }).cuerpo).toContain('❌ Visita cancelada');
  });
});

describe('conversacionesParaSeguimiento', () => {
  it('filtra por bot, modo, sin aviso y deja solo las que el último mensaje es posterior al del cliente', async () => {
    const f = sbFalso(() => ({
      data: [
        { id: 'a', ultimo_mensaje_at: '2026-11-15T10:05:00+00:00', ultimo_entrante_at: '2026-11-15T10:00:00+00:00' },
        { id: 'b', ultimo_mensaje_at: '2026-11-15T10:00:00+00:00', ultimo_entrante_at: '2026-11-15T10:00:00+00:00' },
      ],
    }));
    expect(await conversacionesParaSeguimiento(f.sb, 'bot1', AHORA, 72, 14)).toEqual(['a']);
    const q = f.consultas[0];
    expect(tiene(q, 'eq', 'bot_id', 'bot1')).toBe(true);
    expect(tiene(q, 'eq', 'modo', 'bot')).toBe(true);
    expect(tiene(q, 'is', 'avisado_at', null)).toBe(true);
  });
});

