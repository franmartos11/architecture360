import type { CalificacionLead, Lead } from '@/types';
import { mezclarCalificacion, textoCalificacion } from './calificacion';
import { normalizarTelefono } from './reglas';

export type DatosAviso = {
  telefono: string;
  nombre?: string;
  email?: string;
  /** Códigos de las unidades (van al lead en unit_name). */
  unidades: string[];
  /** Las mismas unidades descriptas (amb, m², precio) para el aviso; si falta, van los códigos. */
  unidadesTexto?: string[];
  resumen: string;
  conversacionId: string;
  /** Lo que la IA sabe del cliente (temperatura, presupuesto, plazo...). */
  calificacion?: CalificacionLead;
};

export const NUMERO_OCULTO = 'número oculto';

/**
 * Teléfono (dígitos) del contacto para mostrar y para el link wa.me; null si
 * no hay: un @lid que WhatsApp nunca resolvió (o cualquier otro wid sin número).
 */
export function telefonoDeContacto(contacto: string | null): string | null {
  if (!contacto) return null;
  const n = normalizarTelefono(contacto);
  if (n) return n;
  if (contacto.includes('@')) return null;
  return contacto.replace(/\D/g, '') || null;
}

const vacio = (v: string | null | undefined) => !v || !v.trim();

/** Lead más reciente cuyo teléfono (normalizado) coincide. */
export function buscarLeadPorTelefono(leads: Lead[], telefono: string): Lead | null {
  const objetivo = normalizarTelefono(telefono);
  if (!objetivo) return null;
  let mejor: Lead | null = null;
  for (const l of leads) {
    if (!l.phone || normalizarTelefono(l.phone) !== objetivo) continue;
    if (!mejor || Date.parse(l.created_at) > Date.parse(mejor.created_at)) mejor = l;
  }
  return mejor;
}

function fechaAR(d: Date): string {
  return new Intl.DateTimeFormat('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires',
    day: '2-digit', month: '2-digit', year: 'numeric',
  }).format(d);
}

/** Decide insert o update sin pisar lo cargado a mano. */
export function planearLead(
  existente: Lead | null,
  d: DatosAviso,
  ahora: Date,
):
  | { tipo: 'insert'; fila: Partial<Lead> }
  | { tipo: 'update'; id: string; cambios: Partial<Lead> } {
  const phone = normalizarTelefono(d.telefono);
  const unitName = d.unidades.length ? d.unidades.join(', ') : null;

  if (!existente) {
    return {
      tipo: 'insert',
      fila: {
        status: 'nuevo',
        source: 'whatsapp_bot',
        method: 'whatsapp',
        phone,
        name: d.nombre || null,
        email: d.email || null,
        unit_name: unitName,
        message: d.resumen,
        wa_conversacion_id: d.conversacionId,
        ...(d.calificacion ? { calificacion: d.calificacion } : {}),
      },
    };
  }

  const cambios: Partial<Lead> = {};
  if (vacio(existente.name) && d.nombre) cambios.name = d.nombre;
  if (vacio(existente.email) && d.email) cambios.email = d.email;
  if (vacio(existente.phone) && phone) cambios.phone = phone;
  if (vacio(existente.unit_name) && unitName) cambios.unit_name = unitName;
  const nota = `[WhatsApp ${fechaAR(ahora)}] ${d.resumen}`;
  cambios.message = vacio(existente.message) ? nota : `${existente.message}\n\n${nota}`;
  // Campo solo del bot: se actualiza siempre, conservando lo que esta vez no vino.
  if (d.calificacion) cambios.calificacion = mezclarCalificacion(existente.calificacion, d.calificacion);
  if (existente.wa_conversacion_id !== d.conversacionId) {
    cambios.wa_conversacion_id = d.conversacionId;
  }
  return { tipo: 'update', id: existente.id, cambios };
}

/** `telefono` null (un @lid sin resolver): "número oculto" y sin link wa.me. */
export function textoAviso(i: {
  proyecto: string;
  nombre?: string;
  telefono: string | null;
  /** Chat web: el contacto puede ser solo un email. */
  email?: string | null;
  canal?: 'whatsapp' | 'web';
  unidadesTexto: string[];
  resumen: string;
  urlChat: string;
  calificacion?: CalificacionLead;
}): string {
  const web = i.canal === 'web';
  const contacto = web
    ? [i.telefono, i.email?.trim()].filter(Boolean).join(' · ') || 'sin contacto'
    : (i.telefono ?? NUMERO_OCULTO);
  const lineas = [
    `🔥 Cliente interesado${web ? ' (chat del sitio)' : ''} – ${i.proyecto}`,
    `${i.nombre?.trim() || 'Sin nombre'} · ${contacto}`,
  ];
  if (i.calificacion) lineas.push(textoCalificacion(i.calificacion));
  if (i.unidadesTexto.length) lineas.push(`Le interesa: ${i.unidadesTexto.join('; ')}`);
  lineas.push(i.resumen);
  if (i.telefono) lineas.push(`Escribile: wa.me/${i.telefono}`);
  lineas.push(`Ver chat: ${i.urlChat}`);
  return lineas.join('\n');
}
