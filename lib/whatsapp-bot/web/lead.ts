// Lead que deja el comprador en el chat del sitio: crear o completar uno que
// ya existe, sin pisar la atribución del primer contacto (origen, inmobiliaria,
// visitante) ni la charla de WhatsApp que "Ver chat" abre hoy.
// Sin imports de next/react. Spec: docs/superpowers/specs/2026-11-24-chat-web-design.md
import type { CalificacionLead, Lead } from '@/types';
import { mezclarCalificacion } from '../calificacion';
import { normalizarTelefono } from '../reglas';

export type DatosAvisoWeb = {
  telefono: string | null;
  email: string | null;
  nombre: string | null;
  /** Códigos de las unidades (van al lead en unit_name). */
  unidades: string[];
  /** Las mismas unidades descriptas para el aviso; si falta, van los códigos. */
  unidadesTexto?: string[];
  resumen: string;
  conversacionId: string;
  calificacion?: CalificacionLead;
  visitorId: string | null;
  ref: string | null;
};

const vacio = (v: string | null | undefined) => !v || !v.trim();
const emailClave = (e: string | null | undefined) => (e ?? '').replace(/\s+/g, '').toLowerCase();

function masReciente(leads: Lead[], coincide: (l: Lead) => boolean): Lead | null {
  let mejor: Lead | null = null;
  for (const l of leads) {
    if (!coincide(l)) continue;
    if (!mejor || Date.parse(l.created_at) > Date.parse(mejor.created_at)) mejor = l;
  }
  return mejor;
}

/** Lead más reciente del proyecto con ese teléfono (normalizado) o, si no aparece, ese email. */
export function buscarLeadWeb(leads: Lead[], telefono: string | null, email: string | null): Lead | null {
  const tel = normalizarTelefono(telefono);
  if (tel) {
    const porTel = masReciente(leads, (l) => !!l.phone && normalizarTelefono(l.phone) === tel);
    if (porTel) return porTel;
  }
  const mail = emailClave(email);
  if (!mail) return null;
  return masReciente(leads, (l) => emailClave(l.email) === mail);
}

function fechaAR(d: Date): string {
  return new Intl.DateTimeFormat('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires',
    day: '2-digit', month: '2-digit', year: 'numeric',
  }).format(d);
}

export function planearLeadWeb(
  existente: Lead | null,
  d: DatosAvisoWeb,
  ahora: Date,
):
  | { tipo: 'insert'; fila: Partial<Lead> }
  | { tipo: 'update'; id: string; cambios: Partial<Lead> } {
  const phone = normalizarTelefono(d.telefono);
  const email = d.email?.trim() || null;
  const nombre = d.nombre?.trim() || null;
  const unitName = d.unidades.length ? d.unidades.join(', ') : null;

  if (!existente) {
    return {
      tipo: 'insert',
      fila: {
        status: 'nuevo',
        source: 'chat_web',
        method: 'chat',
        phone,
        name: nombre,
        email,
        unit_name: unitName,
        message: d.resumen,
        wa_conversacion_id: d.conversacionId,
        visitor_id: d.visitorId,
        ref: d.ref,
        ...(d.calificacion ? { calificacion: d.calificacion } : {}),
      },
    };
  }

  const cambios: Partial<Lead> = {};
  if (vacio(existente.name) && nombre) cambios.name = nombre;
  if (vacio(existente.email) && email) cambios.email = email;
  if (vacio(existente.phone) && phone) cambios.phone = phone;
  if (vacio(existente.unit_name) && unitName) cambios.unit_name = unitName;
  // Atribución del primer contacto: solo se completa si faltaba.
  if (vacio(existente.visitor_id) && d.visitorId) cambios.visitor_id = d.visitorId;
  if (vacio(existente.ref) && d.ref) cambios.ref = d.ref;
  if (!existente.wa_conversacion_id) cambios.wa_conversacion_id = d.conversacionId;
  const nota = `[Chat web ${fechaAR(ahora)}] ${d.resumen}`;
  cambios.message = vacio(existente.message) ? nota : `${existente.message}\n\n${nota}`;
  if (d.calificacion) cambios.calificacion = mezclarCalificacion(existente.calificacion, d.calificacion);
  return { tipo: 'update', id: existente.id, cambios };
}
