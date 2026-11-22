// Seguimiento automático: si un cliente charló con el bot y después dejó de
// responder, el bot le escribe UNA vez para retomar. La IA decide si la charla
// mostró interés real; si no, no se manda nada. Reglas puras (sin red).
// Sin imports de next/react.
import type { WaBot, WaConversacion, WaMensaje } from '@/types/whatsapp-bot';
import { ordenarHistorial } from './ia/historial';
import { estaEnModoHumano, normalizarTelefono, TOPE_DIARIO } from './reglas';

/** Horas de silencio del cliente que puede elegir el panel. */
export const HORAS_SEGUIMIENTO_OPCIONES = [24, 48, 72, 120, 168] as const;
export const HORAS_SEGUIMIENTO_DEFAULT = 72;
/** No se reactiva una charla en la que el cliente no escribe hace más de esto. */
export const DIAS_MAX_SEGUIMIENTO = 14;
/** Una charla de verdad: el cliente escribió al menos esto. */
export const MIN_MENSAJES_CLIENTE = 2;
/** Franja horaria de Argentina en la que se manda (desde inclusive, hasta exclusive). */
export const HORA_DESDE = 10;
export const HORA_HASTA = 20;
/** Lo que contesta la IA cuando la charla no amerita seguimiento. */
export const MARCA_SIN_SEGUIMIENTO = 'NO_SEGUIMIENTO';

const HORA_MS = 3_600_000;
const DIA_MS = 24 * HORA_MS;

export function horaBuenosAires(d: Date): number {
  const h = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Argentina/Buenos_Aires',
    hour: 'numeric',
    hourCycle: 'h23',
  }).format(d);
  return Number(h);
}

export type MotivoSinSeguimiento =
  | 'apagado'
  | 'pre_vinculo'
  | 'vendedor'
  | 'humano'
  | 'avisado'
  | 'fuera_de_horario'
  | 'tope_diario'
  | 'ultimo_no_es_bot'
  | 'intervino_equipo'
  | 'poca_charla'
  | 'muy_viejo'
  | 'muy_pronto'
  | 'ya_hecho';

export function debeHacerSeguimiento(i: {
  bot: Pick<WaBot, 'activo' | 'vendedor_whatsapp' | 'seguimiento_activo' | 'seguimiento_horas'>;
  conv: Pick<
    WaConversacion,
    'modo' | 'humano_hasta' | 'creada_post_vinculo' | 'avisado_at' | 'contacto_numero' | 'seguimiento_at'
  >;
  msgs: WaMensaje[];
  mensajesHoyNumero: number;
  ahora: Date;
}): { si: true; diasSilencio: number } | { si: false; motivo: MotivoSinSeguimiento } {
  const no = (motivo: MotivoSinSeguimiento) => ({ si: false as const, motivo });
  const { bot, conv, ahora } = i;
  if (!bot.activo || !bot.seguimiento_activo) return no('apagado');
  if (!conv.creada_post_vinculo) return no('pre_vinculo');
  const vendedor = bot.vendedor_whatsapp ? normalizarTelefono(bot.vendedor_whatsapp) : null;
  if (vendedor && vendedor === normalizarTelefono(conv.contacto_numero)) return no('vendedor');
  if (conv.modo !== 'bot' || estaEnModoHumano(conv, ahora)) return no('humano');
  // Ya está en manos del vendedor: el seguimiento lo hace una persona.
  if (conv.avisado_at) return no('avisado');
  const hora = horaBuenosAires(ahora);
  if (hora < HORA_DESDE || hora >= HORA_HASTA) return no('fuera_de_horario');
  if (i.mensajesHoyNumero >= TOPE_DIARIO) return no('tope_diario');

  const ms = ordenarHistorial(i.msgs);
  const ultimo = ms[ms.length - 1];
  if (!ultimo || ultimo.autor !== 'bot') return no('ultimo_no_es_bot');
  if (ms.some((m) => m.autor === 'vendedor' || m.autor === 'telefono')) return no('intervino_equipo');
  const delCliente = ms.filter((m) => m.autor === 'cliente');
  if (delCliente.length < MIN_MENSAJES_CLIENTE) return no('poca_charla');

  const ultimoCliente = new Date(delCliente[delCliente.length - 1].enviado_at).getTime();
  if (ahora.getTime() - ultimoCliente > DIAS_MAX_SEGUIMIENTO * DIA_MS) return no('muy_viejo');
  const horas = bot.seguimiento_horas ?? HORAS_SEGUIMIENTO_DEFAULT;
  if (ahora.getTime() - new Date(ultimo.enviado_at).getTime() < horas * HORA_MS) return no('muy_pronto');
  // Uno por cada silencio: si ya se hizo después del último mensaje del cliente, no otro.
  if (conv.seguimiento_at && new Date(conv.seguimiento_at).getTime() >= ultimoCliente) return no('ya_hecho');

  return { si: true, diasSilencio: Math.max(1, Math.round((ahora.getTime() - ultimoCliente) / DIA_MS)) };
}

/** La consigna que recibe la IA como último mensaje (no la escribió el cliente). */
export function consignaSeguimiento(diasSilencio: number): string {
  const cuando = diasSilencio === 1 ? 'desde ayer' : `hace ${diasSilencio} días`;
  return [
    `[Aviso interno del sistema, no lo escribió el cliente] El cliente no responde ${cuando}.`,
    'Si en la charla mostró interés real en el proyecto (preguntó por unidades, precios, visitas o condiciones), escribile UN solo mensaje breve y amable para retomar donde quedó: sin presionar, sin repetir todo lo que ya le dijiste y con una pregunta concreta que le sea fácil de responder.',
    `Si no hubo interés real (solo un saludo, una consulta suelta o un tema ajeno), respondé exactamente ${MARCA_SIN_SEGUIMIENTO} y nada más.`,
  ].join(' ');
}

export function esSinSeguimiento(texto: string | null): boolean {
  return !texto || !texto.trim() || texto.includes(MARCA_SIN_SEGUIMIENTO);
}
