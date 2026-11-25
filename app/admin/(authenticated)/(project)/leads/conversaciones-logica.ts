import { estaEnModoHumano } from '@/lib/whatsapp-bot/reglas';
import type { WaAutor, WaConversacion, WaMensaje } from '@/types/whatsapp-bot';

/** Por qué la IA no respondió el último turno (wa_conversaciones.ia_pausada_motivo). */
export const MOTIVOS_PAUSA: Record<string, string> = {
  contestador: 'Parece un contestador automático',
  tope_conversacion: 'Llegó al tope de respuestas por hora',
  tope_diario: 'Llegó al tope diario del número',
  error: 'Hubo un error con la IA',
  refusal: 'La IA no quiso responder este mensaje',
  inactivo: 'El bot está apagado',
  pre_vinculo: 'Chat anterior a vincular el número: lo atendés vos',
  max_iteraciones: 'La IA no pudo terminar la respuesta',
  vendedor: 'Es el número del vendedor: el bot no le responde',
};

/** Texto del motivo; null si no hay o no hace falta mostrarlo ('humano' ya se ve en el modo). */
export function motivoPausaLabel(motivo: string | null | undefined): string | null {
  if (!motivo) return null;
  return MOTIVOS_PAUSA[motivo] ?? null;
}

/** Charla del chat del sitio: se lee pero no se responde desde el panel. */
export function esChatWeb(c: Pick<WaConversacion, 'canal'>): boolean {
  return c.canal === 'web';
}

export const AVISO_CHAT_WEB = 'Esta charla fue en el sitio. Seguí por WhatsApp o teléfono con los datos del lead.';

/** Aviso del chat: un chat previo al vínculo siempre lo explica, aunque todavía no haya pasado un turno. */
export function avisoChat(c: Pick<WaConversacion, 'creada_post_vinculo' | 'ia_pausada_motivo'> & Partial<Pick<WaConversacion, 'canal'>>): string | null {
  if (esChatWeb(c)) return AVISO_CHAT_WEB;
  if (!c.creada_post_vinculo) return MOTIVOS_PAUSA.pre_vinculo;
  return motivoPausaLabel(c.ia_pausada_motivo);
}

/** El número para mostrar: un @lid que WhatsApp nunca resolvió es "Número oculto". */
export function numeroVisible(c: Pick<WaConversacion, 'contacto_numero'>): string {
  if (!c.contacto_numero) return 'Visitante del sitio';
  return c.contacto_numero.includes('@') ? 'Número oculto' : `+${c.contacto_numero}`;
}

export function tituloConversacion(c: Pick<WaConversacion, 'contacto_nombre' | 'contacto_numero'>): string {
  return c.contacto_nombre?.trim() || numeroVisible(c);
}

/** Minúsculas, sin acentos ni espacios. */
function normalizar(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, '');
}

export function filtrarConversaciones(lista: WaConversacion[], busqueda: string): WaConversacion[] {
  const q = normalizar(busqueda).replace(/[^\p{L}\p{N}]/gu, '');
  if (!q) return lista;
  const digitos = busqueda.replace(/\D/g, '');
  return lista.filter(c => {
    if (c.contacto_nombre && normalizar(c.contacto_nombre).replace(/[^\p{L}\p{N}]/gu, '').includes(q)) return true;
    return !!digitos && (c.contacto_numero ?? '').replace(/\D/g, '').includes(digitos);
  });
}

export function burbuja(autor: WaAutor, vendedorNombre?: string | null): { lado: 'izquierda' | 'derecha'; etiqueta: string | null } {
  if (autor === 'cliente') return { lado: 'izquierda', etiqueta: null };
  if (autor === 'bot') return { lado: 'derecha', etiqueta: 'Bot' };
  if (autor === 'telefono') return { lado: 'derecha', etiqueta: 'Desde el celular' };
  return { lado: 'derecha', etiqueta: vendedorNombre?.trim() || 'Vos' };
}

const ts = (m: Pick<WaMensaje, 'orden_at' | 'enviado_at'>) => new Date(m.orden_at ?? m.enviado_at).getTime();

/** Índice ANTES del cual va el separador de aviso (length = al final); null si no hubo aviso. */
export function posicionAviso(mensajes: Pick<WaMensaje, 'orden_at' | 'enviado_at'>[], avisadoAt: string | null): number | null {
  if (!avisadoAt) return null;
  const t = new Date(avisadoAt).getTime();
  const i = mensajes.findIndex(m => ts(m) > t);
  return i === -1 ? mensajes.length : i;
}

export function restanteLabel(hasta: string | null, ahora: number): string | null {
  if (!hasta) return null;
  const ms = new Date(hasta).getTime() - ahora;
  if (!(ms > 0)) return null;
  const min = Math.floor(ms / 60_000);
  if (min < 1) return 'menos de 1 min';
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

/**
 * Modo efectivo del chat, con la misma regla que usa el bot (estaEnModoHumano):
 * un modo humano vencido ya es bot. `accion` es el botón a mostrar; un chat
 * previo al vínculo lo atiende siempre una persona y no tiene botón.
 */
export function modoLabel(
  c: Pick<WaConversacion, 'modo' | 'humano_hasta'> & Partial<Pick<WaConversacion, 'creada_post_vinculo' | 'canal'>>,
  ahora: number,
): { humano: boolean; texto: string; accion: 'tomar' | 'devolver' | null } {
  if (esChatWeb(c)) return { humano: false, texto: '💬 Chat del sitio', accion: null };
  if (c.creada_post_vinculo === false) return { humano: true, texto: '👤 Atendido por vos', accion: null };
  if (!estaEnModoHumano(c, new Date(ahora))) return { humano: false, texto: '🤖 Bot respondiendo', accion: 'tomar' };
  const r = restanteLabel(c.humano_hasta, ahora);
  return {
    humano: true,
    texto: r ? `👤 Atendido por vos · vuelve al bot en ${r}` : '👤 Atendido por vos',
    accion: 'devolver',
  };
}

export interface MensajePendiente {
  salidaId: string;
  cuerpo: string;
  estado: 'pendiente' | 'error';
}

export interface SalidaPendiente {
  id: string;
  estado: string;
  cuerpo: string | null;
}

/**
 * Reconcilia lo enviado por el vendedor con lo que informa el servidor:
 * - ya llegó como wa_mensajes (salida_id) -> desaparece;
 * - el servidor la reporta con estado 'error' -> error (con reintento);
 * - pendiente/enviando -> pendiente; sin dato del servidor -> se conserva como estaba.
 */
export function pendientesVisibles(
  pendientes: MensajePendiente[],
  mensajes: Pick<WaMensaje, 'salida_id'>[],
  salidas: SalidaPendiente[] = [],
): MensajePendiente[] {
  const llegados = new Set(mensajes.map(m => m.salida_id).filter(Boolean));
  const porId = new Map(salidas.map(s => [s.id, s]));
  return pendientes
    .filter(p => !llegados.has(p.salidaId))
    .map(p => {
      const s = porId.get(p.salidaId);
      if (!s) return p;
      return { ...p, estado: s.estado === 'error' ? 'error' : 'pendiente' } as MensajePendiente;
    });
}

export function tiempoCorto(iso: string | null, ahora: Date = new Date()): string {
  if (!iso) return '';
  const d = new Date(iso);
  const dia = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const dif = Math.round((dia(ahora) - dia(d)) / 86_400_000);
  if (dif <= 0) return d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
  if (dif === 1) return 'ayer';
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: 'short' });
}

export type FiltroChat = 'todas' | 'sin_leer' | 'bot' | 'vendedor' | 'web';

/** Filtros de la lista. Las charlas del sitio solo aparecen en "Todas" y "Web": no se atienden desde acá. */
export function pasaFiltro(c: WaConversacion, f: FiltroChat, ahora: number): boolean {
  if (f === 'todas') return true;
  if (f === 'web') return esChatWeb(c);
  if (esChatWeb(c)) return false;
  if (f === 'sin_leer') return c.no_leidos > 0;
  const humano = modoLabel(c, ahora).humano;
  return f === 'vendedor' ? humano : !humano;
}
