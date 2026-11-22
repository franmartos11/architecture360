// Persistencia del puente de WhatsApp en Supabase (service role).
// Sin server-only, next/* ni React: corre con tsx fuera de Next.
// Los errores de Supabase se relanzan como Error con contexto (tabla/operación)
// y sin datos del contacto.
import type { SupabaseClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import type { CalificacionLead, Lead } from '@/types';
import type {
  WaAutor,
  WaBot,
  WaConversacion,
  WaMensaje,
  WaSalida,
  WaVisita,
} from '@/types/whatsapp-bot';
import { escapeHtml } from '@/lib/sanitize';
import { leadRecipientIds } from '@/lib/lead-recipients';
import type { MemberRole } from '@/lib/project-roles';
import {
  buscarLeadPorTelefono,
  NUMERO_OCULTO,
  planearLead,
  telefonoDeContacto,
  textoAviso,
  type DatosAviso,
} from './aviso';
import { MAX_MENSAJES_HISTORIAL, ordenarHistorial } from './ia/historial';
import { debeRearmarAviso, normalizarTelefono } from './reglas';
import { mezclarCalificacion } from './calificacion';
import { textoTurno } from './visitas';

export { createBotClient } from './db';

const MS_TOMA_COLGADA = 2 * 60 * 1000;
const MS_BASE_REINTENTO = 30 * 1000;
export const MAX_INTENTOS_ENVIO = 5;
const MS_HORA = 60 * 60 * 1000;
const MAX_ERROR = 500;
const INTENTOS_CONTADOR = 3;

type ErrorSb = { message: string; code?: string } | null;

function fallar(contexto: string, error: { message: string }): never {
  throw new Error(`[wa repo] ${contexto}: ${error.message}`);
}

function revisar(contexto: string, error: ErrorSb): void {
  if (error) fallar(contexto, error);
}

const iso = (ms: number) => new Date(ms).toISOString();

/** Valor entre comillas para filtros `or()` de PostgREST (admite `,.:()`). */
function citar(v: string): string {
  return `"${v.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

// ─── Bots ────────────────────────────────────────────────────────────

/**
 * Toma o renueva el lease de los bots habilitados para este host, en un único
 * update atómico: `host_permitido = host` y lease libre, vencido o propio.
 * Devuelve solo los que quedaron tomados por este host.
 */
export async function tomarBots(sb: SupabaseClient, host: string, segundos = 90): Promise<WaBot[]> {
  const ahora = Date.now();
  const { data, error } = await sb
    .from('wa_bots')
    .update({ puente_host: host, puente_hasta: iso(ahora + segundos * 1000) })
    .eq('host_permitido', host)
    .or(`puente_hasta.is.null,puente_hasta.lt.${citar(iso(ahora))},puente_host.eq.${citar(host)}`)
    .select('*');
  revisar('tomarBots: update wa_bots', error);
  return (data ?? []) as WaBot[];
}

export async function latir(sb: SupabaseClient, botId: string): Promise<void> {
  const { error } = await sb.from('wa_bots').update({ heartbeat_at: iso(Date.now()) }).eq('id', botId);
  revisar('latir: update wa_bots', error);
}

export async function leerBot(sb: SupabaseClient, botId: string): Promise<WaBot | null> {
  const { data, error } = await sb.from('wa_bots').select('*').eq('id', botId).maybeSingle();
  revisar('leerBot: select wa_bots', error);
  return (data as WaBot | null) ?? null;
}

export async function guardarEstado(
  sb: SupabaseClient,
  botId: string,
  cambios: Partial<Pick<WaBot, 'estado' | 'qr' | 'qr_at' | 'numero' | 'vinculado_at' | 'ultimo_error'>>,
): Promise<void> {
  const { error } = await sb.from('wa_bots').update(cambios).eq('id', botId);
  revisar('guardarEstado: update wa_bots', error);
}

/**
 * Borra el pedido atendido. Con `pedidoAt` solo lo borra si sigue siendo el
 * mismo pedido (no pisa uno nuevo que haya llegado mientras se atendía).
 */
export async function limpiarPedido(
  sb: SupabaseClient,
  botId: string,
  pedidoAt?: string | null,
): Promise<void> {
  let q = sb.from('wa_bots').update({ pedido: null, pedido_at: null }).eq('id', botId);
  if (pedidoAt !== undefined) q = pedidoAt === null ? q.is('pedido_at', null) : q.eq('pedido_at', pedidoAt);
  const { error } = await q;
  revisar('limpiarPedido: update wa_bots', error);
}

/** Fecha (YYYY-MM-DD) en Buenos Aires: el día de `mensajes_hoy_fecha`. */
export function fechaBuenosAires(d: Date): string {
  // en-CA formatea como YYYY-MM-DD (lo que guarda una columna date).
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

/**
 * Suma 1 a `mensajes_hoy` (reinicia en 1 si cambió el día en Buenos Aires).
 * Update condicionado a lo leído; reintenta si otro proceso lo cambió en el medio.
 * Devuelve el valor nuevo.
 */
export async function sumarMensajeDelDia(sb: SupabaseClient, bot: Pick<WaBot, 'id'>): Promise<number> {
  const hoy = fechaBuenosAires(new Date());
  for (let k = 0; k < INTENTOS_CONTADOR; k++) {
    const { data: fila, error } = await sb
      .from('wa_bots')
      .select('mensajes_hoy, mensajes_hoy_fecha')
      .eq('id', bot.id)
      .single();
    revisar('sumarMensajeDelDia: select wa_bots', error);
    const leido = fila as Pick<WaBot, 'mensajes_hoy' | 'mensajes_hoy_fecha'>;
    const nuevo = leido.mensajes_hoy_fecha === hoy ? leido.mensajes_hoy + 1 : 1;
    let q = sb
      .from('wa_bots')
      .update({ mensajes_hoy: nuevo, mensajes_hoy_fecha: hoy })
      .eq('id', bot.id)
      .eq('mensajes_hoy', leido.mensajes_hoy);
    q =
      leido.mensajes_hoy_fecha === null
        ? q.is('mensajes_hoy_fecha', null)
        : q.eq('mensajes_hoy_fecha', leido.mensajes_hoy_fecha);
    const { data, error: e2 } = await q.select('id');
    revisar('sumarMensajeDelDia: update wa_bots', e2);
    if (data?.length) return nuevo;
  }
  throw new Error('[wa repo] sumarMensajeDelDia: wa_bots cambió en cada intento');
}

// ─── Conversaciones y mensajes ───────────────────────────────────────

export type OpcionesConversacion = {
  /**
   * Solo se consulta al crear la conversación: ¿WhatsApp Web tiene mensajes de
   * este chat anteriores a vinculado_at? (spec §6: un teléfono en uso que se
   * vinculó con contactos y charlas previas).
   */
  tieneHistorialPrevio?: (vinculadoAt: Date) => Promise<boolean>;
};

export async function obtenerOCrearConversacion(
  sb: SupabaseClient,
  bot: WaBot,
  contacto: { numero: string; wid: string; nombre: string | null },
  primerMensajeAt: Date,
  opciones: OpcionesConversacion = {},
): Promise<WaConversacion> {
  const numero = normalizarTelefono(contacto.numero) ?? contacto.numero;
  const leer = async () => {
    const { data, error } = await sb
      .from('wa_conversaciones')
      .select('*')
      .eq('bot_id', bot.id)
      .eq('contacto_numero', numero)
      .maybeSingle();
    revisar('obtenerOCrearConversacion: select wa_conversaciones', error);
    return data as WaConversacion | null;
  };

  const existente = await leer();
  if (existente) {
    const cambios: Partial<WaConversacion> = {};
    if (contacto.wid && existente.contacto_wid !== contacto.wid) cambios.contacto_wid = contacto.wid;
    if (contacto.nombre && existente.contacto_nombre !== contacto.nombre) cambios.contacto_nombre = contacto.nombre;
    if (Object.keys(cambios).length === 0) return existente;
    const { error } = await sb.from('wa_conversaciones').update(cambios).eq('id', existente.id);
    revisar('obtenerOCrearConversacion: update wa_conversaciones', error);
    return { ...existente, ...cambios };
  }

  const vinculo = bot.vinculado_at ? new Date(bot.vinculado_at).getTime() : null;
  // Sin vinculado_at no se puede probar que el chat es nuevo: no responde.
  // El primer mensaje que ve el puente puede ser nuevo aunque el contacto ya
  // charlaba con ese número: se le pregunta a WhatsApp Web por mensajes previos.
  let postVinculo = vinculo !== null && primerMensajeAt.getTime() >= vinculo;
  if (postVinculo && opciones.tieneHistorialPrevio) {
    if (await opciones.tieneHistorialPrevio(new Date(vinculo as number))) postVinculo = false;
  }
  const { data, error } = await sb
    .from('wa_conversaciones')
    .insert({
      bot_id: bot.id,
      project_id: bot.project_id,
      contacto_numero: numero,
      contacto_wid: contacto.wid,
      contacto_nombre: contacto.nombre,
      creada_post_vinculo: postVinculo,
      // Spec §6: un chat previo al vínculo lo atiende siempre una persona
      // (humano_hasta null = permanente para estaEnModoHumano).
      modo: postVinculo ? 'bot' : 'humano',
      humano_hasta: null,
    })
    .select('*')
    .single();
  if (error?.code === '23505') {
    // Otro proceso la creó entre la lectura y el insert.
    const ganadora = await leer();
    if (ganadora) return ganadora;
  }
  revisar('obtenerOCrearConversacion: insert wa_conversaciones', error);
  return data as WaConversacion;
}

export type NuevoMensaje = Omit<WaMensaje, 'id' | 'created_at' | 'orden_at' | 'salida_id'> & {
  orden_at?: string | null;
  salida_id?: string | null;
};

const MARCAS_TIPO: Record<WaMensaje['tipo'], string> = {
  texto: '',
  imagen: '📷 Imagen',
  audio: '🎤 Audio',
  documento: '📄 Documento',
  otro: 'Mensaje',
};

function vistaPrevia(m: Pick<WaMensaje, 'cuerpo' | 'tipo'>): string {
  const t = m.cuerpo?.trim() || MARCAS_TIPO[m.tipo];
  return t.length > 200 ? `${t.slice(0, 199)}…` : t;
}

const masNuevo = (a: string, b: string | null | undefined) =>
  !b || new Date(a).getTime() >= new Date(b).getTime();

/**
 * Inserta el mensaje (dedupe por `wa_id`) y, si es nuevo, actualiza el resumen
 * de la conversación. `no_leidos` se lee y reescribe (el puente es el único
 * que lo incrementa; el panel solo lo pone en 0).
 */
export async function guardarMensaje(sb: SupabaseClient, m: NuevoMensaje): Promise<'nuevo' | 'duplicado'> {
  const { data, error } = await sb
    .from('wa_mensajes')
    .upsert(
      { ...m, orden_at: m.orden_at ?? null, salida_id: m.salida_id ?? null },
      { onConflict: 'wa_id', ignoreDuplicates: true },
    )
    .select('id');
  revisar('guardarMensaje: upsert wa_mensajes', error);
  if (!data?.length) return 'duplicado';

  const { data: c, error: e2 } = await sb
    .from('wa_conversaciones')
    .select('no_leidos, ultimo_mensaje_at, ultimo_entrante_at')
    .eq('id', m.conversacion_id)
    .maybeSingle();
  revisar('guardarMensaje: select wa_conversaciones', e2);
  const actual = (c ?? {}) as Partial<Pick<WaConversacion, 'no_leidos' | 'ultimo_mensaje_at' | 'ultimo_entrante_at'>>;

  const cambios: Partial<WaConversacion> = {};
  if (masNuevo(m.enviado_at, actual.ultimo_mensaje_at)) {
    cambios.ultimo_mensaje = vistaPrevia(m);
    cambios.ultimo_mensaje_at = m.enviado_at;
  }
  if (m.direccion === 'entrante') {
    if (masNuevo(m.enviado_at, actual.ultimo_entrante_at)) cambios.ultimo_entrante_at = m.enviado_at;
    cambios.no_leidos = (actual.no_leidos ?? 0) + 1;
  }
  if (Object.keys(cambios).length) {
    const { error: e3 } = await sb.from('wa_conversaciones').update(cambios).eq('id', m.conversacion_id);
    revisar('guardarMensaje: update wa_conversaciones', e3);
  }
  return 'nuevo';
}

export async function leerConversacion(sb: SupabaseClient, convId: string): Promise<WaConversacion | null> {
  const { data, error } = await sb.from('wa_conversaciones').select('*').eq('id', convId).maybeSingle();
  revisar('leerConversacion: select wa_conversaciones', error);
  return (data as WaConversacion | null) ?? null;
}

/**
 * Por qué la IA no respondió el último turno (null = respondió). Se ve en el
 * panel. Con `vistoHasta` también corre la marca ia_visto_hasta (hasta qué
 * mensaje del cliente ya evaluó un turno).
 */
export async function pausarIa(
  sb: SupabaseClient,
  convId: string,
  motivo: string | null,
  vistoHasta?: string,
): Promise<void> {
  const cambios: Partial<WaConversacion> = { ia_pausada_motivo: motivo };
  if (vistoHasta) cambios.ia_visto_hasta = vistoHasta;
  const { error } = await sb.from('wa_conversaciones').update(cambios).eq('id', convId);
  revisar('pausarIa: update wa_conversaciones', error);
}

/** Entregado (2) / leído (3) de un mensaje nuestro. Nunca lo baja (los acks llegan desordenados). */
export async function guardarAck(sb: SupabaseClient, waId: string, ack: number): Promise<void> {
  const { error } = await sb
    .from('wa_mensajes')
    .update({ ack })
    .eq('wa_id', waId)
    .or(`ack.is.null,ack.lt.${ack}`);
  revisar('guardarAck: update wa_mensajes', error);
}

export const BUCKET_MEDIOS = 'wa-medios';

/** Sube un medio entrante al bucket privado `wa-medios`; devuelve la ruta (media_path). */
export async function subirMedio(
  sb: SupabaseClient,
  ruta: string,
  medio: { mime: string; data: Buffer },
): Promise<string> {
  const { error } = await sb.storage
    .from(BUCKET_MEDIOS)
    .upload(ruta, medio.data, { contentType: medio.mime, upsert: true });
  if (error) fallar(`subirMedio: upload ${BUCKET_MEDIOS}`, error);
  return ruta;
}

export async function ponerModoHumano(sb: SupabaseClient, convId: string, hasta: Date | null): Promise<void> {
  const { error } = await sb
    .from('wa_conversaciones')
    .update({ modo: 'humano', humano_hasta: hasta ? hasta.toISOString() : null })
    .eq('id', convId);
  revisar('ponerModoHumano: update wa_conversaciones', error);
}

/** Una respuesta del bot todavía en la cola, con forma de mensaje para el historial. */
function salidaComoMensaje(s: WaSalida): WaMensaje {
  return {
    id: s.id,
    conversacion_id: s.conversacion_id as string,
    wa_id: null,
    direccion: 'saliente',
    autor: 'bot',
    tipo: s.adjunto_url ? 'imagen' : 'texto',
    cuerpo: s.cuerpo,
    media_path: null,
    enviado_at: s.created_at,
    ack: null,
    created_at: s.created_at,
    orden_at: s.orden_at,
    salida_id: s.id,
  };
}

/**
 * Últimos `n` mensajes de la conversación, más las respuestas del bot que
 * siguen en la cola (pendiente/enviando), así la IA ve lo que ya contestó.
 * Ordenados por (orden_at ?? enviado_at).
 */
export async function historial(
  sb: SupabaseClient,
  convId: string,
  n = MAX_MENSAJES_HISTORIAL,
): Promise<WaMensaje[]> {
  // Primero la cola y después los mensajes: si una salida se registra entre
  // las dos lecturas aparece en ambas (se deduplica) en vez de en ninguna.
  const { data: sal, error: e1 } = await sb
    .from('wa_salida')
    .select('*')
    .eq('conversacion_id', convId)
    .eq('origen', 'bot')
    .in('estado', ['pendiente', 'enviando'])
    .order('created_at', { ascending: true });
  revisar('historial: select wa_salida', e1);

  const { data: men, error: e2 } = await sb
    .from('wa_mensajes')
    .select('*')
    .eq('conversacion_id', convId)
    .order('enviado_at', { ascending: false })
    .limit(n);
  revisar('historial: select wa_mensajes', e2);

  // Se leyeron del más nuevo al más viejo (para el limit): se dan vuelta antes
  // del sort estable, así los empates de orden_at quedan en orden de envío.
  const mensajes = ((men ?? []) as WaMensaje[]).slice().reverse();
  const registradas = new Set(mensajes.map((m) => m.salida_id).filter(Boolean));
  const enCola = ((sal ?? []) as WaSalida[])
    .filter((s) => !registradas.has(s.id))
    .map(salidaComoMensaje);

  return ordenarHistorial([...mensajes, ...enCola]).slice(-n);
}

/**
 * Conversaciones candidatas al seguimiento: en modo bot, sin aviso, con el
 * cliente activo en los últimos `diasMax` días y la última actividad hace al
 * menos `horas`. Las reglas finas (debeHacerSeguimiento) se aplican después.
 */
export async function conversacionesParaSeguimiento(
  sb: SupabaseClient,
  botId: string,
  ahora: Date,
  horas: number,
  diasMax: number,
  limite = 20,
): Promise<string[]> {
  const { data, error } = await sb
    .from('wa_conversaciones')
    .select('id, ultimo_mensaje_at, ultimo_entrante_at')
    .eq('bot_id', botId)
    .eq('modo', 'bot')
    .eq('creada_post_vinculo', true)
    .is('avisado_at', null)
    .gte('ultimo_entrante_at', iso(ahora.getTime() - diasMax * 24 * 3_600_000))
    .lte('ultimo_mensaje_at', iso(ahora.getTime() - horas * 3_600_000))
    .order('ultimo_mensaje_at', { ascending: true })
    .limit(limite);
  revisar('conversacionesParaSeguimiento: select wa_conversaciones', error);
  // El último mensaje tiene que ser posterior al del cliente (le contestamos y no volvió).
  return ((data ?? []) as Pick<WaConversacion, 'id' | 'ultimo_mensaje_at' | 'ultimo_entrante_at'>[])
    .filter(
      (c) =>
        !!c.ultimo_mensaje_at &&
        !!c.ultimo_entrante_at &&
        new Date(c.ultimo_mensaje_at).getTime() > new Date(c.ultimo_entrante_at).getTime(),
    )
    .map((c) => c.id);
}

export async function marcarSeguimiento(sb: SupabaseClient, convId: string, ahora: Date): Promise<void> {
  const { error } = await sb.from('wa_conversaciones').update({ seguimiento_at: ahora.toISOString() }).eq('id', convId);
  revisar('marcarSeguimiento: update wa_conversaciones', error);
}

// ─── Visitas ─────────────────────────────────────────────────────────

/** Visitas agendadas o confirmadas del proyecto que todavía no terminaron. */
export async function visitasActivas(sb: SupabaseClient, projectId: string, desde: Date): Promise<WaVisita[]> {
  const { data, error } = await sb
    .from('wa_visitas')
    .select('*')
    .eq('project_id', projectId)
    .in('estado', ['agendada', 'confirmada'])
    .gte('fin', desde.toISOString())
    .order('inicio', { ascending: true });
  revisar('visitasActivas: select wa_visitas', error);
  return (data ?? []) as WaVisita[];
}

/** Aviso al vendedor de una visita agendada o cancelada (si tiene WhatsApp cargado). */
async function avisarVisita(
  sb: SupabaseClient,
  bot: WaBot,
  conv: WaConversacion,
  texto: string,
): Promise<void> {
  const destino = bot.vendedor_whatsapp?.trim() ? normalizarTelefono(bot.vendedor_whatsapp) : null;
  if (!destino) return;
  await encolar(sb, {
    bot_id: bot.id,
    conversacion_id: null,
    destino,
    cuerpo: texto,
    adjunto_url: null,
    origen: 'aviso',
    autor_id: null,
  });
}

function lineasVisita(i: {
  titulo: string;
  proyecto: string;
  conv: WaConversacion;
  nombre: string | null;
  inicio: Date;
  minutos: number;
  urlAdmin: string;
}): string {
  const telefono = telefonoDeContacto(i.conv.contacto_numero);
  return [
    `${i.titulo} – ${i.proyecto}`,
    `${i.nombre?.trim() || i.conv.contacto_nombre?.trim() || 'Sin nombre'} · ${telefono ?? NUMERO_OCULTO}`,
    `${textoTurno(i.inicio)} (${i.minutos} min)`,
    ...(telefono ? [`Escribile: wa.me/${telefono}`] : []),
    `Ver chat: ${i.urlAdmin.replace(/\/+$/, '')}/admin/leads?c=${i.conv.id}`,
  ].join('\n');
}

/**
 * Agenda una visita para esta conversación y avisa al vendedor. 'ocupado' si
 * otra visita tomó ese turno (índice único) entre que se ofreció y se eligió.
 */
export async function agendarVisita(
  sb: SupabaseClient,
  i: {
    bot: WaBot;
    conv: WaConversacion;
    inicio: Date;
    fin: Date;
    nombre: string | null;
    proyecto: { name: string };
    urlAdmin: string;
  },
): Promise<'agendada' | 'ocupado'> {
  // lead_id fresco: la IA puede haber avisado (y creado el lead) en este mismo turno.
  const { data: c, error: e1 } = await sb.from('wa_conversaciones').select('lead_id').eq('id', i.conv.id).maybeSingle();
  revisar('agendarVisita: select wa_conversaciones', e1);
  const { error } = await sb.from('wa_visitas').insert({
    project_id: i.bot.project_id,
    bot_id: i.bot.id,
    conversacion_id: i.conv.id,
    lead_id: (c as { lead_id: string | null } | null)?.lead_id ?? i.conv.lead_id,
    inicio: i.inicio.toISOString(),
    fin: i.fin.toISOString(),
    nombre: i.nombre?.trim().slice(0, 120) || i.conv.contacto_nombre,
    telefono: telefonoDeContacto(i.conv.contacto_numero),
  });
  if (error && (error as { code?: string }).code === '23505') return 'ocupado';
  revisar('agendarVisita: insert wa_visitas', error);
  await avisarVisita(
    sb,
    i.bot,
    i.conv,
    lineasVisita({
      titulo: '📅 Visita agendada',
      proyecto: i.proyecto.name,
      conv: i.conv,
      nombre: i.nombre,
      inicio: i.inicio,
      minutos: Math.round((i.fin.getTime() - i.inicio.getTime()) / 60_000),
      urlAdmin: i.urlAdmin,
    }),
  );
  return 'agendada';
}

/** Cancela las visitas futuras de esta conversación y avisa al vendedor. Devuelve las canceladas. */
export async function cancelarVisitasDeConversacion(
  sb: SupabaseClient,
  i: { bot: WaBot; conv: WaConversacion; ahora: Date; proyecto: { name: string }; urlAdmin: string },
): Promise<WaVisita[]> {
  const { data, error } = await sb
    .from('wa_visitas')
    .update({ estado: 'cancelada' })
    .eq('conversacion_id', i.conv.id)
    .in('estado', ['agendada', 'confirmada'])
    .gt('inicio', i.ahora.toISOString())
    .select('*');
  revisar('cancelarVisitasDeConversacion: update wa_visitas', error);
  const canceladas = (data ?? []) as WaVisita[];
  for (const v of canceladas) {
    await avisarVisita(
      sb,
      i.bot,
      i.conv,
      lineasVisita({
        titulo: '❌ Visita cancelada por el cliente',
        proyecto: i.proyecto.name,
        conv: i.conv,
        nombre: v.nombre,
        inicio: new Date(v.inicio),
        minutos: Math.round((new Date(v.fin).getTime() - new Date(v.inicio).getTime()) / 60_000),
        urlAdmin: i.urlAdmin,
      }),
    );
  }
  return canceladas;
}

/** Guarda el texto de un audio del cliente (lo usa la IA y lo muestra el panel). */
export async function guardarTranscripcion(sb: SupabaseClient, mensajeId: string, texto: string): Promise<void> {
  const { error } = await sb.from('wa_mensajes').update({ transcripcion: texto }).eq('id', mensajeId);
  revisar('guardarTranscripcion: update wa_mensajes', error);
}

export async function contarRespuestasBotUltimaHora(sb: SupabaseClient, convId: string): Promise<number> {
  const { count, error } = await sb
    .from('wa_mensajes')
    .select('id', { count: 'exact', head: true })
    .eq('conversacion_id', convId)
    .eq('autor', 'bot')
    .gte('enviado_at', iso(Date.now() - MS_HORA));
  revisar('contarRespuestasBotUltimaHora: select wa_mensajes', error);
  return count ?? 0;
}

// ─── Cola de salida ──────────────────────────────────────────────────

export type NuevaSalida = Pick<
  WaSalida,
  'bot_id' | 'conversacion_id' | 'destino' | 'cuerpo' | 'adjunto_url' | 'origen' | 'autor_id'
> & {
  /**
   * Base del orden para respuestas del bot: enviado_at del último mensaje del
   * cliente que vio el turno + 1 ms. Todas las partes/imágenes de un mismo
   * turno pasan la MISMA base y un `parte` creciente.
   */
  orden_at?: string | null;
  /** Índice (desde 0) de la parte/imagen dentro del turno: orden_at = base + parte ms. */
  parte?: number;
};

export async function encolar(sb: SupabaseClient, s: NuevaSalida): Promise<WaSalida> {
  const { parte = 0, orden_at, ...fila } = s;
  const orden = orden_at ? iso(new Date(orden_at).getTime() + parte) : null;
  const { data, error } = await sb
    .from('wa_salida')
    .insert({ ...fila, orden_at: orden })
    .select('*')
    .single();
  revisar('encolar: insert wa_salida', error);
  return data as WaSalida;
}

/** Vueltas máximas de tomarSiguienteSalida resolviendo ítems colgados antes de rendirse. */
const MAX_VUELTAS_TOMA = 10;

/**
 * Toma el próximo ítem a enviar: `pendiente` con `proximo_intento_at` vencido o
 * `enviando` colgado (> 2 min, el puente se reinició a mitad). Los updates están
 * condicionados a lo leído (estado y, si estaba colgado, `tomado_at`): si otro
 * proceso lo tomó primero no afecta filas y devuelve null.
 *
 * Un `enviando` colgado:
 * - si ya tiene su fila en wa_mensajes (se mandó y se registró, pero el puente
 *   cayó antes de marcarlo) → se marca `enviado`, no se reenvía;
 * - si no, retomarlo cuenta como intento; al llegar a MAX_INTENTOS_ENVIO pasa a `error`.
 * En esos dos casos sigue con la próxima candidata.
 */
export async function tomarSiguienteSalida(sb: SupabaseClient, botId: string): Promise<WaSalida | null> {
  for (let vuelta = 0; vuelta < MAX_VUELTAS_TOMA; vuelta++) {
    const ahora = Date.now();
    const { data: fila, error } = await sb
      .from('wa_salida')
      .select('*')
      .eq('bot_id', botId)
      .or(
        `and(estado.eq.pendiente,or(proximo_intento_at.is.null,proximo_intento_at.lte.${citar(iso(ahora))})),` +
          `and(estado.eq.enviando,or(tomado_at.is.null,tomado_at.lt.${citar(iso(ahora - MS_TOMA_COLGADA))}))`,
      )
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    revisar('tomarSiguienteSalida: select wa_salida', error);
    const leida = fila as WaSalida | null;
    if (!leida) return null;

    /** Update condicionado a que la fila siga como se leyó. */
    const actualizar = async (cambios: Record<string, unknown>, contexto: string) => {
      let q = sb.from('wa_salida').update(cambios).eq('id', leida.id).eq('estado', leida.estado);
      if (leida.estado === 'enviando') {
        q = leida.tomado_at === null ? q.is('tomado_at', null) : q.eq('tomado_at', leida.tomado_at);
      }
      const { data, error: e } = await q.select('*');
      revisar(`tomarSiguienteSalida: ${contexto} wa_salida`, e);
      return ((data ?? [])[0] as WaSalida | undefined) ?? null;
    };

    if (leida.estado === 'pendiente') {
      return actualizar({ estado: 'enviando', tomado_at: iso(ahora) }, 'tomar');
    }

    const { data: reg, error: e2 } = await sb
      .from('wa_mensajes')
      .select('wa_id, enviado_at')
      .eq('salida_id', leida.id)
      .limit(1)
      .maybeSingle();
    revisar('tomarSiguienteSalida: select wa_mensajes', e2);
    const registrado = reg as Pick<WaMensaje, 'wa_id' | 'enviado_at'> | null;
    if (registrado) {
      const ok = await actualizar(
        { estado: 'enviado', wa_id: registrado.wa_id, enviado_at: registrado.enviado_at, error: null },
        'cerrar enviada',
      );
      if (!ok) return null;
      continue;
    }

    const intentos = leida.intentos + 1;
    if (intentos >= MAX_INTENTOS_ENVIO) {
      const ok = await actualizar(
        { estado: 'error', intentos, error: 'envío colgado: se agotaron los intentos', tomado_at: null },
        'agotar',
      );
      if (!ok) return null;
      continue;
    }
    return actualizar({ estado: 'enviando', tomado_at: iso(ahora), intentos }, 'retomar');
  }
  return null;
}

/** `waId` null: WhatsApp no devolvió el id (el mensaje igual salió). */
export async function marcarEnviada(sb: SupabaseClient, id: string, waId: string | null): Promise<void> {
  const { error } = await sb
    .from('wa_salida')
    .update({ estado: 'enviado', wa_id: waId, enviado_at: iso(Date.now()), error: null })
    .eq('id', id);
  revisar('marcarEnviada: update wa_salida', error);
}

/**
 * Registra en `wa_mensajes` lo que la cola acaba de mandar (con el `orden_at`
 * de la salida, o ahora) y después marca la salida enviada. En ese orden: el
 * historial nunca deja de ver la respuesta. Un aviso al vendedor (sin
 * conversación) solo se marca enviado. `waId` null: WhatsApp no devolvió el
 * id (wa_mensajes.wa_id es unique: nunca se guarda '').
 */
export async function registrarSalidaEnviada(
  sb: SupabaseClient,
  salida: WaSalida,
  waId: string | null,
  autor: WaAutor,
): Promise<void> {
  if (salida.conversacion_id) {
    const ahora = iso(Date.now());
    await guardarMensaje(sb, {
      conversacion_id: salida.conversacion_id,
      wa_id: waId,
      direccion: 'saliente',
      autor,
      // El único documento que manda el bot es el brief (PDF); el resto son imágenes.
      tipo: !salida.adjunto_url ? 'texto' : /\.pdf$/i.test(salida.adjunto_url.split(/[?#]/)[0]) ? 'documento' : 'imagen',
      cuerpo: salida.cuerpo,
      media_path: null,
      enviado_at: ahora,
      ack: null,
      orden_at: salida.orden_at ?? ahora,
      salida_id: salida.id,
    });
  }
  await marcarEnviada(sb, salida.id, waId);
}

/** Al 5º intento queda en `error`; si no, vuelve a `pendiente` con espera 2^intentos × 30 s. */
export async function marcarFallo(
  sb: SupabaseClient,
  id: string,
  intentos: number,
  error: string,
): Promise<void> {
  const motivo = error.slice(0, MAX_ERROR);
  const cambios =
    intentos >= MAX_INTENTOS_ENVIO
      ? { estado: 'error', intentos, error: motivo, tomado_at: null }
      : {
          estado: 'pendiente',
          intentos,
          error: motivo,
          tomado_at: null,
          proximo_intento_at: iso(Date.now() + 2 ** intentos * MS_BASE_REINTENTO),
        };
  const { error: e } = await sb.from('wa_salida').update(cambios).eq('id', id);
  revisar('marcarFallo: update wa_salida', e);
}

// ─── Aviso al vendedor ───────────────────────────────────────────────

/** Fechas (asc) de los mensajes del cliente desde el último ≤ avisado_at. */
async function entrantesDesdeAviso(sb: SupabaseClient, convId: string, avisadoAt: string): Promise<string[]> {
  const { data: base, error } = await sb
    .from('wa_mensajes')
    .select('enviado_at')
    .eq('conversacion_id', convId)
    .eq('autor', 'cliente')
    .lte('enviado_at', avisadoAt)
    .order('enviado_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  revisar('registrarAviso: select wa_mensajes (base)', error);
  const desde = (base as { enviado_at: string } | null)?.enviado_at ?? avisadoAt;

  const { data, error: e2 } = await sb
    .from('wa_mensajes')
    .select('enviado_at')
    .eq('conversacion_id', convId)
    .eq('autor', 'cliente')
    .gte('enviado_at', desde)
    .order('enviado_at', { ascending: true });
  revisar('registrarAviso: select wa_mensajes (entrantes)', e2);
  return ((data ?? []) as { enviado_at: string }[]).map((r) => r.enviado_at);
}

/**
 * Mismo email de "nuevo lead" que app/api/leads/route.ts: al dueño y al equipo
 * comercial (gestores y administradores aceptados, ver lib/lead-recipients).
 * Si no se pueden leer los miembros, igual se avisa al dueño. Un try/catch por
 * destinatario: que falle uno no corta a los demás. Nunca rompe el aviso.
 */
async function emailNuevoLead(
  sb: SupabaseClient,
  projectId: string,
  proyecto: string,
  d: DatosAviso,
  telefono: string,
): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return;
  try {
    const { data: p, error } = await sb.from('projects').select('owner_id').eq('id', projectId).maybeSingle();
    revisar('emailNuevoLead: select projects', error);
    const ownerId = (p as { owner_id: string | null } | null)?.owner_id;
    if (!ownerId) return;

    let miembros: { user_id: string; role: MemberRole; status: string }[] = [];
    try {
      const { data, error: eM } = await sb
        .from('project_members')
        .select('user_id, role, status')
        .eq('project_id', projectId);
      revisar('emailNuevoLead: select project_members', eM);
      miembros = (data ?? []) as typeof miembros;
    } catch (err) {
      console.error(
        '[wa repo] no se pudieron leer los miembros del proyecto:',
        err instanceof Error ? err.message : 'error desconocido',
      );
    }

    const resend = new Resend(apiKey);
    const html = `<p><strong>${escapeHtml(d.nombre?.trim() || 'Sin nombre')}</strong> dejó sus datos por WhatsApp en <strong>${escapeHtml(proyecto)}</strong>.</p>
            <p>Email: ${escapeHtml(d.email || '—')}<br>Teléfono: ${escapeHtml(telefono)}</p>
            <p>Mensaje: ${escapeHtml(d.resumen)}</p>
            <p>Entrá a tu panel de administración → Leads para ver el detalle.</p>`;
    for (const userId of leadRecipientIds(ownerId, miembros)) {
      try {
        const { data: u, error: e2 } = await sb.auth.admin.getUserById(userId);
        if (e2) throw new Error(`auth.admin.getUserById: ${e2.message}`);
        const to = u.user?.email;
        if (!to) continue;
        const { error: e3 } = await resend.emails.send({
          from: process.env.EMAIL_FROM || 'onboarding@resend.dev',
          to,
          subject: `Nuevo lead en ${proyecto}`,
          html,
        });
        if (e3) throw new Error(`resend: ${e3.message}`);
      } catch (err) {
        console.error(
          '[wa repo] no se pudo mandar el email de nuevo lead:',
          err instanceof Error ? err.message : 'error desconocido',
        );
      }
    }
  } catch (err) {
    console.error(
      '[wa repo] no se pudo mandar el email de nuevo lead:',
      err instanceof Error ? err.message : 'error desconocido',
    );
  }
}

/**
 * La IA pidió avisar al vendedor. Si ya se avisó y el cliente no volvió tras
 * ≥ 7 días, no hace nada ('ya_avisado'). Si no, en este orden: crea o completa
 * el lead (sin tocar `status`), encola el aviso al `vendedor_whatsapp` (si hay),
 * marca la conversación (avisado_at, resumen, lead_id) y dispara, sin esperarlo,
 * el email de nuevo lead al dueño y al equipo comercial (si hay RESEND_API_KEY).
 * Si algo falla antes de marcar, rechaza sin avisado_at: un reintento puede
 * duplicar la nota del lead o el aviso, pero nunca lo pierde.
 */
/** Suma la calificación nueva a la del lead (lo que no vino conserva lo anterior). */
async function actualizarCalificacion(sb: SupabaseClient, leadId: string, nueva: CalificacionLead): Promise<void> {
  const { data, error } = await sb.from('leads').select('calificacion').eq('id', leadId).maybeSingle();
  revisar('actualizarCalificacion: select leads', error);
  if (!data) return;
  const previa = (data as { calificacion: CalificacionLead | null }).calificacion;
  const { error: e2 } = await sb
    .from('leads')
    .update({ calificacion: mezclarCalificacion(previa, nueva) })
    .eq('id', leadId);
  revisar('actualizarCalificacion: update leads', e2);
}

export async function registrarAviso(
  sb: SupabaseClient,
  conv: WaConversacion,
  datos: DatosAviso,
  bot: WaBot,
  proyecto: { name: string },
  urlAdmin: string,
): Promise<'avisado' | 'ya_avisado'> {
  const ahora = new Date();

  // avisado_at fresco: el objeto en memoria puede ser de antes de un aviso de este mismo turno.
  const { data: fresca, error } = await sb
    .from('wa_conversaciones')
    .select('avisado_at, lead_id')
    .eq('id', conv.id)
    .maybeSingle();
  revisar('registrarAviso: select wa_conversaciones', error);
  const f = fresca as { avisado_at: string | null; lead_id: string | null } | null;
  const avisadoAt = f ? f.avisado_at : conv.avisado_at;
  const entrantes = avisadoAt ? await entrantesDesdeAviso(sb, conv.id, avisadoAt) : [];
  if (!debeRearmarAviso(avisadoAt, entrantes)) {
    // Ya avisado: no se repite el aviso, pero lo nuevo que contó el cliente
    // (presupuesto, plazo...) igual llega a la tarjeta del lead.
    const leadId = f?.lead_id ?? conv.lead_id;
    if (datos.calificacion && leadId) await actualizarCalificacion(sb, leadId, datos.calificacion);
    return 'ya_avisado';
  }

  // Lead: el teléfono puede estar cargado en cualquier formato, se compara normalizado en JS.
  const { data: leads, error: e2 } = await sb.from('leads').select('*').eq('project_id', bot.project_id);
  revisar('registrarAviso: select leads', e2);
  const plan = planearLead(buscarLeadPorTelefono((leads ?? []) as Lead[], datos.telefono), datos, ahora);
  let leadId: string;
  if (plan.tipo === 'insert') {
    const { data, error: e3 } = await sb
      .from('leads')
      .insert({ ...plan.fila, project_id: bot.project_id })
      .select('id')
      .single();
    revisar('registrarAviso: insert leads', e3);
    leadId = (data as { id: string }).id;
  } else {
    const { error: e3 } = await sb.from('leads').update(plan.cambios).eq('id', plan.id);
    revisar('registrarAviso: update leads', e3);
    leadId = plan.id;
  }

  // El aviso se encola ANTES de marcar avisado_at: si encolar falla, la IA
  // puede reintentar (mejor un aviso doble que uno perdido hasta el re-aviso).
  // Un @lid que WhatsApp nunca resolvió no tiene teléfono: "número oculto".
  const telefono = telefonoDeContacto(datos.telefono);
  const destino = bot.vendedor_whatsapp?.trim() ? normalizarTelefono(bot.vendedor_whatsapp) : null;
  if (destino) {
    await encolar(sb, {
      bot_id: bot.id,
      conversacion_id: null,
      destino,
      cuerpo: textoAviso({
        proyecto: proyecto.name,
        nombre: datos.nombre,
        telefono,
        unidadesTexto: datos.unidadesTexto ?? datos.unidades,
        resumen: datos.resumen,
        urlChat: `${urlAdmin.replace(/\/+$/, '')}/admin/leads?c=${conv.id}`,
        calificacion: datos.calificacion,
      }),
      adjunto_url: null,
      origen: 'aviso',
      autor_id: null,
    });
  }

  const { error: e4 } = await sb
    .from('wa_conversaciones')
    .update({ avisado_at: ahora.toISOString(), resumen: datos.resumen, lead_id: leadId })
    .eq('id', conv.id);
  revisar('registrarAviso: update wa_conversaciones', e4);

  // Sin await: con el equipo comercial son varios emails en serie y el turno de
  // la IA no tiene por qué esperarlos. emailNuevoLead no rechaza, pero igual
  // se atrapa para que nunca quede una promesa rechazada suelta.
  void emailNuevoLead(sb, bot.project_id, proyecto.name, datos, telefono ?? NUMERO_OCULTO).catch((err) => {
    console.error(
      '[wa repo] email de nuevo lead:',
      err instanceof Error ? err.message : 'error desconocido',
    );
  });
  return 'avisado';
}
