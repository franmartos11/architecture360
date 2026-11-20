// Mensajes de WhatsApp (wa_mensajes) → historial para la Messages API.
// Sin imports de next/react: corre con tsx fuera de Next.
import type Anthropic from '@anthropic-ai/sdk';
import type { WaMensaje } from '@/types/whatsapp-bot';

/** Mensajes de la conversación que ve la IA (los más recientes). */
export const MAX_MENSAJES_HISTORIAL = 40;

export const PREFIJO_EQUIPO = '[Mensaje del equipo de ventas] ';

function texto(m: WaMensaje): string | null {
  const cuerpo = m.cuerpo?.trim() ?? '';
  const delCliente = m.autor === 'cliente';
  switch (m.tipo) {
    case 'audio':
      return delCliente ? '[El cliente mandó un audio]' : '[Audio]';
    case 'imagen': {
      const marca = delCliente ? '[El cliente mandó una imagen]' : '[Imagen]';
      return cuerpo ? `${marca} ${cuerpo}` : marca;
    }
    case 'documento': {
      const marca = delCliente ? '[El cliente mandó un documento]' : '[Documento]';
      return cuerpo ? `${marca} ${cuerpo}` : marca;
    }
    case 'otro':
      return cuerpo || (delCliente ? '[El cliente mandó un mensaje que no es texto]' : null);
    case 'texto':
      return cuerpo || null;
  }
}

/**
 * Momento lógico de un mensaje en el historial: `orden_at` si lo tiene (las
 * respuestas del bot se ubican justo después del último mensaje del cliente
 * que vio su turno), si no `enviado_at`.
 */
export function momentoOrden(m: Pick<WaMensaje, 'orden_at' | 'enviado_at'>): number {
  return new Date(m.orden_at ?? m.enviado_at).getTime();
}

/** Ordena por `momentoOrden` (estable: empates conservan el orden recibido). */
export function ordenarHistorial<T extends Pick<WaMensaje, 'orden_at' | 'enviado_at'>>(ms: T[]): T[] {
  return [...ms].sort((a, b) => momentoOrden(a) - momentoOrden(b));
}

/**
 * Cliente = user; bot = assistant; vendedor/teléfono = assistant con prefijo.
 * Une consecutivos del mismo rol y descarta los assistant iniciales para que
 * el historial empiece en user (lo exige la API).
 */
export function aMensajesClaude(ms: WaMensaje[]): Anthropic.Beta.BetaMessageParam[] {
  const ordenados = ordenarHistorial(ms).slice(-MAX_MENSAJES_HISTORIAL);

  const salida: { role: 'user' | 'assistant'; partes: string[] }[] = [];
  for (const m of ordenados) {
    const t = texto(m);
    if (!t) continue;
    const role = m.autor === 'cliente' ? 'user' : 'assistant';
    if (role === 'assistant' && salida.length === 0) continue;
    const parte = m.autor === 'vendedor' || m.autor === 'telefono' ? PREFIJO_EQUIPO + t : t;
    const ultimo = salida[salida.length - 1];
    if (ultimo && ultimo.role === role) ultimo.partes.push(parte);
    else salida.push({ role, partes: [parte] });
  }
  return salida.map(s => ({ role: s.role, content: s.partes.join('\n') }));
}
