// Persistencia del chat del sitio (service role, desde /api/chat). Las charlas
// web son filas de wa_conversaciones con canal 'web' y un token secreto; el
// puente de WhatsApp nunca las toca.
// Sin imports de next/react. Spec: docs/superpowers/specs/2026-11-24-chat-web-design.md
import type { SupabaseClient } from '@supabase/supabase-js';
import type { CalificacionLead, Lead } from '@/types';
import { mezclarCalificacion } from '../calificacion';
import type { WaBot, WaConversacion, WaMensaje } from '@/types/whatsapp-bot';
import { LEAD_COLUMNS } from '@/lib/lead-columns';
import { textoAviso } from '../aviso';
import { normalizarTelefono } from '../reglas';
import {
  candidatosPorTelefono,
  emailNuevoLead,
  encolar,
  fechaBuenosAires,
  revisar,
  vistaPrevia,
} from '../repo';
import { buscarLeadWeb, planearLeadWeb, type DatosAvisoWeb } from './lead';

export type MensajeWeb = { autor: 'cliente' | 'bot'; tipo: 'texto' | 'imagen' | 'documento'; cuerpo: string };

/** Charla nueva: fuera del seguimiento y del re-aviso del puente (canal 'web', sin número). */
export async function crearConversacionWeb(
  sb: SupabaseClient,
  bot: Pick<WaBot, 'id' | 'project_id'>,
): Promise<WaConversacion> {
  const { data, error } = await sb
    .from('wa_conversaciones')
    .insert({
      bot_id: bot.id,
      project_id: bot.project_id,
      canal: 'web',
      web_token: globalThis.crypto.randomUUID(),
      contacto_numero: null,
      creada_post_vinculo: false,
      modo: 'bot',
    })
    .select('*')
    .single();
  revisar('crearConversacionWeb: insert wa_conversaciones', error);
  return data as WaConversacion;
}

/** La charla web de ese token en ese proyecto; null si no existe (o es de otro proyecto). */
export async function conversacionWeb(
  sb: SupabaseClient,
  projectId: string,
  token: string,
): Promise<WaConversacion | null> {
  const { data, error } = await sb
    .from('wa_conversaciones')
    .select('*')
    .eq('web_token', token)
    .eq('project_id', projectId)
    .eq('canal', 'web')
    .maybeSingle();
  revisar('conversacionWeb: select wa_conversaciones', error);
  return (data as WaConversacion | null) ?? null;
}

/**
 * Guarda un mensaje y actualiza la vista previa de la lista. No suma
 * no_leidos: una charla web no se responde desde el panel.
 */
export async function guardarMensajeWeb(
  sb: SupabaseClient,
  convId: string,
  m: MensajeWeb,
  enviadoAt: Date,
): Promise<void> {
  const at = enviadoAt.toISOString();
  const cliente = m.autor === 'cliente';
  const { error } = await sb.from('wa_mensajes').insert({
    conversacion_id: convId,
    wa_id: null,
    direccion: cliente ? 'entrante' : 'saliente',
    autor: m.autor,
    tipo: m.tipo,
    cuerpo: m.cuerpo,
    enviado_at: at,
  });
  revisar('guardarMensajeWeb: insert wa_mensajes', error);
  const previa = vistaPrevia({ tipo: m.tipo, cuerpo: m.tipo === 'texto' ? m.cuerpo : null });
  const { error: e2 } = await sb
    .from('wa_conversaciones')
    .update({ ultimo_mensaje: previa, ultimo_mensaje_at: at, ...(cliente ? { ultimo_entrante_at: at } : {}) })
    .eq('id', convId);
  revisar('guardarMensajeWeb: update wa_conversaciones', e2);
}

export async function mensajesWeb(sb: SupabaseClient, convId: string): Promise<WaMensaje[]> {
  const { data, error } = await sb
    .from('wa_mensajes')
    .select('*')
    .eq('conversacion_id', convId)
    .order('enviado_at', { ascending: true })
    .limit(500);
  revisar('mensajesWeb: select wa_mensajes', error);
  return (data ?? []) as WaMensaje[];
}

export async function contarMensajesCliente(sb: SupabaseClient, convId: string): Promise<number> {
  const { count, error } = await sb
    .from('wa_mensajes')
    .select('id', { count: 'exact', head: true })
    .eq('conversacion_id', convId)
    .eq('autor', 'cliente');
  revisar('contarMensajesCliente: select wa_mensajes', error);
  return count ?? 0;
}

/** Turnos del chat web del proyecto desde las 00:00 de Buenos Aires (UTC-3, sin horario de verano). */
export async function turnosWebHoy(sb: SupabaseClient, projectId: string, ahora: Date): Promise<number> {
  const desde = new Date(`${fechaBuenosAires(ahora)}T00:00:00-03:00`).toISOString();
  const { count, error } = await sb
    .from('wa_uso_ia')
    .select('id', { count: 'exact', head: true })
    .eq('project_id', projectId)
    .eq('origen', 'web')
    .gte('created_at', desde);
  revisar('turnosWebHoy: select wa_uso_ia', error);
  return count ?? 0;
}

/** El lead que dejó esta charla (lead_id fresco: pudo crearse en este mismo turno). */
export async function leadDeCharlaWeb(
  sb: SupabaseClient,
  convId: string,
): Promise<Pick<Lead, 'id' | 'name' | 'phone' | 'email'> | null> {
  const { data: c, error } = await sb.from('wa_conversaciones').select('lead_id').eq('id', convId).maybeSingle();
  revisar('leadDeCharlaWeb: select wa_conversaciones', error);
  const leadId = (c as { lead_id: string | null } | null)?.lead_id;
  if (!leadId) return null;
  const { data, error: e2 } = await sb.from('leads').select('id, name, phone, email').eq('id', leadId).maybeSingle();
  revisar('leadDeCharlaWeb: select leads', e2);
  return (data as Pick<Lead, 'id' | 'name' | 'phone' | 'email'> | null) ?? null;
}

const emailValido = (e: string | null) => !!e && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim());
/** Escapa los comodines de ilike: el email se compara entero, sin mayúsculas. */
const sinComodines = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

async function candidatosPorEmail(sb: SupabaseClient, projectId: string, email: string): Promise<Lead[]> {
  const { data, error } = await sb
    .from('leads')
    .select(LEAD_COLUMNS)
    .eq('project_id', projectId)
    .ilike('email', sinComodines(email.trim()));
  revisar('registrarAvisoWeb: select leads por email', error);
  return (data ?? []) as unknown as Lead[];
}

/** Lead de una charla ya avisada: completa solo lo vacío y mezcla la calificación. */
async function completarLeadAvisado(
  sb: SupabaseClient,
  leadId: string,
  d: { telefono: string | null; email: string | null; nombre: string | null; calificacion?: CalificacionLead },
): Promise<void> {
  const { data, error } = await sb.from('leads').select('id, name, email, phone, calificacion').eq('id', leadId).maybeSingle();
  revisar('registrarAvisoWeb: select lead avisado', error);
  const l = data as Pick<Lead, 'name' | 'email' | 'phone' | 'calificacion'> | null;
  if (!l) return;
  const vacio = (v: string | null | undefined) => !v || !v.trim();
  const cambios: Partial<Lead> = {};
  if (vacio(l.phone) && d.telefono) cambios.phone = d.telefono;
  if (vacio(l.email) && d.email) cambios.email = d.email;
  if (vacio(l.name) && d.nombre) cambios.name = d.nombre;
  if (d.calificacion) cambios.calificacion = mezclarCalificacion(l.calificacion, d.calificacion);
  if (Object.keys(cambios).length === 0) return;
  const { error: e2 } = await sb.from('leads').update(cambios).eq('id', leadId);
  revisar('registrarAvisoWeb: update lead avisado', e2);
}

/**
 * La IA pidió avisar al equipo desde el chat del sitio. Sin teléfono ni email
 * no hace nada ('sin_contacto'): la IA los pide. Una charla ya avisada solo
 * actualiza la calificación del lead. Si no, crea o completa el lead, encola el
 * aviso al vendedor solo si el WhatsApp está conectado (si no, saldría días
 * después), marca la charla y manda el email de nuevo lead.
 * `enSegundoPlano`: la ruta lo pasa para no demorar la respuesta con los emails.
 */
export async function registrarAvisoWeb(
  sb: SupabaseClient,
  conv: WaConversacion,
  d: DatosAvisoWeb,
  bot: WaBot,
  proyecto: { name: string },
  urlAdmin: string,
  enSegundoPlano?: (tarea: Promise<void>) => void,
): Promise<'avisado' | 'ya_avisado' | 'sin_contacto'> {
  const ahora = new Date();
  const { data: fresca, error } = await sb
    .from('wa_conversaciones')
    .select('avisado_at, lead_id, contacto_nombre')
    .eq('id', conv.id)
    .maybeSingle();
  revisar('registrarAvisoWeb: select wa_conversaciones', error);
  const f = (fresca ?? conv) as Pick<WaConversacion, 'avisado_at' | 'lead_id' | 'contacto_nombre'>;
  const telefono = normalizarTelefono(d.telefono);
  const email = emailValido(d.email) ? (d.email as string).trim() : null;
  if (f.avisado_at) {
    // Sin otro aviso, pero lo que contó después llega al lead: un teléfono que
    // dejó recién, el nombre o la calificación actualizada.
    if (f.lead_id) await completarLeadAvisado(sb, f.lead_id, { telefono, email, nombre: d.nombre?.trim() || null, calificacion: d.calificacion });
    return 'ya_avisado';
  }
  if (!telefono && !email) return 'sin_contacto';
  const datos: DatosAvisoWeb = { ...d, telefono, email };

  const candidatos = [
    ...(telefono ? await candidatosPorTelefono(sb, bot.project_id, telefono) : []),
    ...(email ? await candidatosPorEmail(sb, bot.project_id, email) : []),
  ];
  const plan = planearLeadWeb(buscarLeadWeb(candidatos, telefono, email), datos, ahora);
  let leadId: string;
  if (plan.tipo === 'insert') {
    const { data, error: e2 } = await sb
      .from('leads')
      .insert({ ...plan.fila, project_id: bot.project_id })
      .select('id')
      .single();
    revisar('registrarAvisoWeb: insert leads', e2);
    leadId = (data as { id: string }).id;
  } else {
    const { error: e2 } = await sb.from('leads').update(plan.cambios).eq('id', plan.id);
    revisar('registrarAvisoWeb: update leads', e2);
    leadId = plan.id;
  }

  const vendedor = bot.vendedor_whatsapp?.trim() ? normalizarTelefono(bot.vendedor_whatsapp) : null;
  if (vendedor && bot.estado === 'conectado') {
    await encolar(sb, {
      bot_id: bot.id,
      conversacion_id: null,
      destino: vendedor,
      cuerpo: textoAviso({
        proyecto: proyecto.name,
        nombre: datos.nombre ?? undefined,
        telefono,
        email,
        canal: 'web',
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

  const nombre = datos.nombre?.trim();
  const { error: e3 } = await sb
    .from('wa_conversaciones')
    .update({
      avisado_at: ahora.toISOString(),
      resumen: datos.resumen,
      lead_id: leadId,
      ...(nombre && !f.contacto_nombre ? { contacto_nombre: nombre.slice(0, 120) } : {}),
    })
    .eq('id', conv.id);
  revisar('registrarAvisoWeb: update wa_conversaciones', e3);

  const mail = emailNuevoLead(sb, bot.project_id, proyecto.name, datos, telefono ?? 'sin teléfono', 'web');
  if (enSegundoPlano) enSegundoPlano(mail);
  else await mail;
  return 'avisado';
}
