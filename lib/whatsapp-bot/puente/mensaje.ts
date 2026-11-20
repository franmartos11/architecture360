// Ids de WhatsApp y el paso de un mensaje de whatsapp-web.js a lo que usa el
// bot (MensajeEntrante). Puro: sin Chromium ni base; lo que necesita de
// WhatsApp Web (resolver un @lid, bajar un medio) llega como función.
// La lectura de ids y la clave de mensaje son de aspa-software
// (lib/whatsapp/numbers.ts waIdToDigits, lib/whatsapp/messages.ts serializarMsgId).
import type { WaTipo } from '@/types/whatsapp-bot';

export type MensajeEntrante = {
  // Clave única del mensaje en WhatsApp ("false_549...@c.us_3EB0...").
  waId: string;
  // Lo mandó este número (desde el celular o por el bot).
  deMi: boolean;
  // El chat: el otro lado en un chat individual (puede ser @lid), o el grupo.
  wid: string;
  // Teléfono (solo dígitos) del otro lado; null si es un @lid que WhatsApp no
  // resolvió, un grupo o un estado.
  numero: string | null;
  // El nombre que el contacto puso en su perfil (solo entrantes).
  nombre: string | null;
  esGrupo: boolean;
  // Estados, canales (@newsletter) y listas de difusión: se ignoran.
  esEstado: boolean;
  tipo: WaTipo;
  cuerpo: string;
  at: Date;
  // El archivo (foto, audio, documento); null si no tiene o no se pudo bajar.
  descargarMedio(): Promise<{ mime: string; data: Buffer } | null>;
};

export type TipoDeWid =
  | { kind: 'telefono'; digitos: string }
  | { kind: 'lid'; lid: string }
  | { kind: 'grupo' }
  | { kind: 'estado' }
  | { kind: 'ignorar' };

export function tipoDeWid(wid: string): TipoDeWid {
  const [user, server] = wid.split('@');
  if (!user || !server) return { kind: 'ignorar' };
  if (server === 'c.us' || server === 's.whatsapp.net') {
    const digitos = user.split(':')[0].replace(/\D/g, '');
    return digitos ? { kind: 'telefono', digitos } : { kind: 'ignorar' };
  }
  if (server === 'lid') return { kind: 'lid', lid: wid };
  if (server === 'g.us') return { kind: 'grupo' };
  // status@broadcast, listas de difusión y canales.
  if (server === 'broadcast' || server === 'newsletter') return { kind: 'estado' };
  return { kind: 'ignorar' };
}

type Wid = string | { _serialized?: string; user?: string; server?: string };
export type MsgKey = { _serialized?: string; fromMe?: boolean; remote?: Wid; id?: string; participant?: Wid };

export function widToString(w: Wid | undefined | null): string | null {
  if (!w) return null;
  if (typeof w === 'string') return w;
  if (w._serialized) return w._serialized;
  return w.user && w.server ? `${w.user}@${w.server}` : null;
}

// Clave única de un mensaje ("true_549...@c.us_3EB0..."). WhatsApp Web dejó de
// mandar id._serialized (la librería lo sigue esperando): se rearma con sus
// partes, en el mismo formato de siempre.
export function serializarMsgId(key: MsgKey | undefined | null): string | null {
  if (!key) return null;
  if (key._serialized) return key._serialized;
  const remote = widToString(key.remote);
  if (!key.id || !remote) return null;
  const participant = widToString(key.participant);
  return `${Boolean(key.fromMe)}_${remote}_${key.id}${participant ? `_${participant}` : ''}`;
}

// Mensajes de sistema de WhatsApp (cifrado, llamadas, borrados, cambios de
// grupo): no son algo que escribió alguien.
const SISTEMA = new Set([
  'e2e_notification',
  'notification',
  'notification_template',
  'gp2',
  'call_log',
  'protocol',
  'revoked',
  'ciphertext',
  'broadcast_notification',
]);

const TIPOS: Record<string, WaTipo> = {
  chat: 'texto',
  image: 'imagen',
  ptt: 'audio',
  audio: 'audio',
  document: 'documento',
};

// El tipo del bot para un tipo de whatsapp-web.js; null si es de sistema.
export function tipoDeMensaje(tipo: string): WaTipo | null {
  if (SISTEMA.has(tipo)) return null;
  return TIPOS[tipo] ?? 'otro';
}

// Lo que se usa de un Message de whatsapp-web.js.
export type MensajeWA = {
  id: MsgKey;
  fromMe: boolean;
  from?: string;
  to?: string;
  type: string;
  body: string;
  timestamp: number;
  hasMedia: boolean;
  isStatus?: boolean;
};

export type DepsMensaje = {
  // Teléfono (dígitos) de un @lid, o null si WhatsApp no lo da.
  resolverLid(lid: string): Promise<string | null>;
  descargar(waId: string): Promise<{ mime: string; data: Buffer } | null>;
};

// null: el mensaje no es para el bot (de sistema, texto vacío, sin id).
export async function aMensajeEntrante(msg: MensajeWA, deps: DepsMensaje): Promise<MensajeEntrante | null> {
  const tipo = tipoDeMensaje(msg.type);
  if (!tipo) return null;
  const waId = serializarMsgId(msg.id);
  // En un chat individual el remote de la clave es el otro lado.
  const wid = (msg.fromMe ? msg.to : msg.from) || widToString(msg.id?.remote);
  if (!waId || !wid) return null;

  // El cuerpo de un medio es su caption; el de una ubicación es la miniatura
  // en base64, que no se pasa.
  const cuerpo = tipo === 'texto' || msg.hasMedia ? (msg.body ?? '').trim() : '';
  if (tipo === 'texto' && !cuerpo) return null;

  const clase = tipoDeWid(wid);
  const esEstado = Boolean(msg.isStatus) || clase.kind === 'estado';
  let numero: string | null = null;
  if (clase.kind === 'telefono') numero = clase.digitos;
  else if (clase.kind === 'lid') numero = await deps.resolverLid(clase.lid);

  const notifyName = (msg as unknown as { _data?: { notifyName?: string } })._data?.notifyName;
  return {
    waId,
    deMi: msg.fromMe,
    wid,
    numero,
    nombre: msg.fromMe ? null : notifyName?.trim() || null,
    esGrupo: clase.kind === 'grupo',
    esEstado,
    tipo,
    cuerpo,
    at: new Date(msg.timestamp * 1000),
    descargarMedio: () => (msg.hasMedia ? deps.descargar(waId) : Promise.resolve(null)),
  };
}
