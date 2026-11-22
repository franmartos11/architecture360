// Mensajes de WhatsApp (wa_mensajes) → historial para la Messages API.
// Sin imports de next/react: corre con tsx fuera de Next.
import type Anthropic from '@anthropic-ai/sdk';
import type { WaMensaje } from '@/types/whatsapp-bot';

/** Mensajes de la conversación que ve la IA (los más recientes). */
export const MAX_MENSAJES_HISTORIAL = 40;

export const PREFIJO_EQUIPO = '[Mensaje del equipo de ventas] ';

/** Una imagen del cliente lista para la IA (ver medios-ia.ts). */
export type ImagenParaIa = {
  data: string;
  mediaType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';
};

function texto(m: WaMensaje): string | null {
  const cuerpo = m.cuerpo?.trim() ?? '';
  const delCliente = m.autor === 'cliente';
  switch (m.tipo) {
    case 'audio': {
      const t = m.transcripcion?.trim();
      if (delCliente && t) return `[Audio del cliente, transcripto] ${t}`;
      return delCliente ? '[El cliente mandó un audio]' : '[Audio]';
    }
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

type Parte = string | ImagenParaIa;

/** Texto plano si son solo textos; si hay imágenes, bloques (textos seguidos unidos). */
function contenido(partes: Parte[]): string | (Anthropic.Beta.BetaTextBlockParam | Anthropic.Beta.BetaImageBlockParam)[] {
  if (partes.every((p): p is string => typeof p === 'string')) return partes.join('\n');
  const bloques: (Anthropic.Beta.BetaTextBlockParam | Anthropic.Beta.BetaImageBlockParam)[] = [];
  for (const p of partes) {
    const ultimo = bloques[bloques.length - 1];
    if (typeof p === 'string') {
      if (ultimo?.type === 'text') ultimo.text += `\n${p}`;
      else bloques.push({ type: 'text', text: p });
    } else {
      bloques.push({ type: 'image', source: { type: 'base64', media_type: p.mediaType, data: p.data } });
    }
  }
  return bloques;
}

/**
 * Cliente = user; bot = assistant; vendedor/teléfono = assistant con prefijo.
 * Une consecutivos del mismo rol y descarta los assistant iniciales para que
 * el historial empiece en user (lo exige la API). Las imágenes del cliente que
 * vengan en `imagenes` (por id de mensaje) van como imagen, junto a su marca.
 */
export function aMensajesClaude(
  ms: WaMensaje[],
  imagenes: ReadonlyMap<string, ImagenParaIa> = new Map(),
): Anthropic.Beta.BetaMessageParam[] {
  const ordenados = ordenarHistorial(ms).slice(-MAX_MENSAJES_HISTORIAL);

  const salida: { role: 'user' | 'assistant'; partes: Parte[] }[] = [];
  for (const m of ordenados) {
    const t = texto(m);
    const imagen = m.autor === 'cliente' ? imagenes.get(m.id) : undefined;
    if (!t && !imagen) continue;
    const role = m.autor === 'cliente' ? 'user' : 'assistant';
    if (role === 'assistant' && salida.length === 0) continue;
    const nuevas: Parte[] = [];
    if (imagen) nuevas.push(imagen);
    if (t) nuevas.push(m.autor === 'vendedor' || m.autor === 'telefono' ? PREFIJO_EQUIPO + t : t);
    const ultimo = salida[salida.length - 1];
    if (ultimo && ultimo.role === role) ultimo.partes.push(...nuevas);
    else salida.push({ role, partes: nuevas });
  }
  // Solo el cliente (user) trae imágenes: lo del lado assistant es siempre texto.
  return salida.map((s): Anthropic.Beta.BetaMessageParam =>
    s.role === 'user'
      ? { role: 'user', content: contenido(s.partes) }
      : { role: 'assistant', content: s.partes.filter((p): p is string => typeof p === 'string').join('\n') },
  );
}
