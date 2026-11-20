// Reglas puras del bot de WhatsApp. Sin I/O, sin server-only, sin next/* ni React:
// corre tanto en Next como en el puente (tsx).
import type { WaBot, WaConversacion } from '@/types/whatsapp-bot';

export const HORAS_MODO_HUMANO = 12;
export const DIAS_REAVISO = 7;
export const MS_AGRUPAR = 8000;
export const TOPE_POR_HORA = 30;
export const TOPE_DIARIO = 300;

const MAX_PARTE = 4000;
const MAX_PARTES = 3;
const MS_POR_CARACTER = 50;
const MS_ESCRIBIENDO_MIN = 2000;
const MS_ESCRIBIENDO_MAX = 8000;
const DIA_MS = 24 * 60 * 60 * 1000;

/**
 * Normaliza un teléfono/id de WhatsApp a dígitos E.164 sin "+".
 * Supuesto (orientado a Argentina): un número de 10 dígitos sin código de país
 * se toma como argentino (área + número) y recibe prefijo 549 (móvil).
 * Otros códigos de país se dejan tal cual. Devuelve null si no hay entre 8 y 15 dígitos.
 */
export function normalizarTelefono(raw: string): string | null {
  const texto = String(raw ?? '');
  // Los ids @lid son identificadores opacos de WhatsApp, no teléfonos.
  if (texto.includes('@lid')) return null;
  // Corta el sufijo del id (":12@s.whatsapp.net", "@c.us", ...) antes de dejar solo dígitos.
  let d = texto.split(/[:@]/)[0].replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);

  if (d.startsWith('54')) {
    // Argentina con código de país: los móviles llevan 9 tras el 54.
    let nacional = d.slice(2);
    if (nacional.startsWith('9')) nacional = nacional.slice(1);
    if (nacional.startsWith('0')) nacional = nacional.slice(1);
    if (nacional.length === 12) nacional = quitar15(nacional) ?? nacional;
    d = nacional.length === 10 ? `549${nacional}` : d[2] === '9' ? d : `549${d.slice(2)}`;
  } else {
    // Formato local: [0] + área (2-4) + [15] + número.
    const local = d.startsWith('0') ? d.slice(1) : d;
    const sin15 = local.length === 12 ? quitar15(local) : null;
    if (sin15) d = `549${sin15}`;
    else if (local.length === 10) {
      // "15 5555-1234" sin código de área no alcanza para identificar al contacto.
      if (local.startsWith('15')) return null;
      d = `549${local}`;
    }
  }

  return d.length >= 8 && d.length <= 15 ? d : null;
}

/** De 12 dígitos (área 2-4 + "15" + número, total 10 sin el 15) devuelve área+número. */
function quitar15(s: string): string | null {
  for (const a of [2, 3, 4]) {
    if (s.slice(a, a + 2) === '15') return s.slice(0, a) + s.slice(a + 2);
  }
  return null;
}

// Solo frases que una persona no escribe al consultar: "horario de atención" o
// "bienvenido" los usan compradores reales ("¿cuál es el horario de atención?")
// y callaban al bot. La señal principal es la de tiempo (ver abajo).
const FRASES_AUTOMATICAS =
  /respuesta autom[aá]tica|gracias por comunicarte con|gracias por escribirnos|en breve (te|le) (responderemos|contestaremos|atenderemos)|fuera de (nuestro )?horario/i;

/**
 * Detecta contestadores automáticos (misma regla que aspa `whatsapp_es_automatica`).
 * La señal principal: un texto largo que llega a ≤ 6 s de nuestro mensaje. Un
 * mensaje anterior a nuestro envío (segundos negativos: lo escribió mientras
 * el bot "escribía") no puede ser una respuesta automática a él.
 */
export function esContestadorAutomatico(
  cuerpo: string,
  segundosDesdeNuestroUltimo: number | null,
): boolean {
  if (FRASES_AUTOMATICAS.test(cuerpo)) return true;
  return (
    cuerpo.length >= 40 &&
    segundosDesdeNuestroUltimo !== null &&
    segundosDesdeNuestroUltimo >= 0 &&
    segundosDesdeNuestroUltimo <= 6
  );
}

/** Modo humano vigente: `humano_hasta` null = permanente hasta que se reactive el bot. */
export function estaEnModoHumano(
  conv: Pick<WaConversacion, 'modo' | 'humano_hasta'>,
  ahora: Date,
): boolean {
  if (conv.modo !== 'humano') return false;
  if (conv.humano_hasta === null) return true;
  return new Date(conv.humano_hasta).getTime() > ahora.getTime();
}

export type MotivoNoResponde =
  | 'inactivo'
  | 'pre_vinculo'
  | 'vendedor'
  | 'humano'
  | 'contestador'
  | 'tope_conversacion'
  | 'tope_diario';

export function debeResponder(i: {
  bot: Pick<WaBot, 'activo' | 'vendedor_whatsapp'>;
  conv: Pick<WaConversacion, 'modo' | 'humano_hasta' | 'creada_post_vinculo' | 'contacto_numero'>;
  esContestador: boolean;
  respuestasUltimaHora: number;
  mensajesHoyNumero: number;
  ahora: Date;
}): { responde: true } | { responde: false; motivo: MotivoNoResponde } {
  if (!i.bot.activo) return { responde: false, motivo: 'inactivo' };
  if (!i.conv.creada_post_vinculo) return { responde: false, motivo: 'pre_vinculo' };
  const vendedor = i.bot.vendedor_whatsapp ? normalizarTelefono(i.bot.vendedor_whatsapp) : null;
  if (vendedor && vendedor === normalizarTelefono(i.conv.contacto_numero)) {
    return { responde: false, motivo: 'vendedor' };
  }
  if (estaEnModoHumano(i.conv, i.ahora)) return { responde: false, motivo: 'humano' };
  if (i.esContestador) return { responde: false, motivo: 'contestador' };
  if (i.mensajesHoyNumero >= TOPE_DIARIO) return { responde: false, motivo: 'tope_diario' };
  if (i.respuestasUltimaHora >= TOPE_POR_HORA) return { responde: false, motivo: 'tope_conversacion' };
  return { responde: true };
}

/**
 * `entrantes`: fechas ISO (asc) de los mensajes del cliente desde el último
 * anterior o igual a `avisadoAt`. Rearma si nunca se avisó o si hubo un hueco
 * >= DIAS_REAVISO entre dos entrantes consecutivos (el cliente volvió).
 */
export function debeRearmarAviso(avisadoAt: string | null, entrantes: string[]): boolean {
  if (avisadoAt === null) return true;
  for (let k = 1; k < entrantes.length; k++) {
    const hueco = new Date(entrantes[k]).getTime() - new Date(entrantes[k - 1]).getTime();
    if (hueco >= DIAS_REAVISO * DIA_MS) return true;
  }
  return false;
}

/**
 * Parte por párrafos: 1 a 3 partes, ninguna de más de 4000 caracteres.
 * Los párrafos sobrantes se unen a la última parte; si aun así no entra, se
 * corta la tercera con "…". Corta por code points para no partir pares sustitutos.
 */
export function partirRespuesta(texto: string): string[] {
  const parrafos = texto
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
  const partes =
    parrafos.length > MAX_PARTES
      ? [...parrafos.slice(0, MAX_PARTES - 1), parrafos.slice(MAX_PARTES - 1).join('\n\n')]
      : parrafos;
  const trozos = partes.flatMap((p) => {
    const chars = Array.from(p);
    const out: string[] = [];
    for (let k = 0; k < chars.length; k += MAX_PARTE) out.push(chars.slice(k, k + MAX_PARTE).join(''));
    return out;
  });
  if (trozos.length <= MAX_PARTES) return trozos;
  const res = trozos.slice(0, MAX_PARTES);
  res[MAX_PARTES - 1] = `${Array.from(res[MAX_PARTES - 1]).slice(0, MAX_PARTE - 1).join('')}…`;
  return res;
}

/** Tiempo de "escribiendo…" proporcional al largo, entre 2 y 8 s. */
export function msEscribiendo(texto: string): number {
  return Math.min(MS_ESCRIBIENDO_MAX, Math.max(MS_ESCRIBIENDO_MIN, texto.length * MS_POR_CARACTER));
}
