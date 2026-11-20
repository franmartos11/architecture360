// Reglas puras del ciclo de vida de una sesión en el bucle del puente.
import type { WaBot } from '@/types/whatsapp-bot';
import { normalizarTelefono } from '../reglas';
import { QR_VENCIDO } from './sesion';

const RECONEXION_BASE_MS = 30_000;
const RECONEXION_MAX_MS = 5 * 60_000;

export type CambiosConexion = Pick<WaBot, 'estado' | 'numero' | 'qr' | 'ultimo_error' | 'vinculado_at'>;

/**
 * Al quedar conectado (onListo). `vinculado_at` se fija la primera vez y cada
 * vez que se vincula otro número: los chats con mensajes anteriores quedan
 * para una persona (creada_post_vinculo false). Se aplica al bot en memoria
 * ANTES de procesar mensajes de esa sesión.
 */
export function cambiosAlConectar(bot: Pick<WaBot, 'numero' | 'vinculado_at'>, numeroWa: string, ahora: Date): CambiosConexion {
  const numero = normalizarTelefono(numeroWa) ?? (numeroWa || null);
  const anterior = bot.numero ? (normalizarTelefono(bot.numero) ?? bot.numero) : null;
  const cambioNumero = anterior !== null && numero !== null && anterior !== numero;
  return {
    estado: 'conectado',
    numero: numero ?? bot.numero,
    qr: null,
    ultimo_error: null,
    vinculado_at: !bot.vinculado_at || cambioNumero ? ahora.toISOString() : bot.vinculado_at,
  };
}

/**
 * El bot recién leído de la base, sin perder un `vinculado_at` (y su número)
 * que se fijó en memoria al conectar y todavía no se pudo guardar.
 */
export function fusionarBot(local: WaBot, remoto: WaBot): WaBot {
  const l = local.vinculado_at ? new Date(local.vinculado_at).getTime() : null;
  const r = remoto.vinculado_at ? new Date(remoto.vinculado_at).getTime() : null;
  if (l !== null && (r === null || l > r)) {
    return { ...remoto, vinculado_at: local.vinculado_at, numero: local.numero };
  }
  return remoto;
}

/** ¿El puente tiene que tener abierta la sesión de este bot (tomado por este host)? */
export function debeTenerSesion(bot: Pick<WaBot, 'estado' | 'pedido' | 'ultimo_error'>): boolean {
  if (bot.pedido === 'desconectar') return false;
  if (bot.pedido === 'conectar' || bot.pedido === 'reiniciar') return true;
  if (bot.estado === 'conectado' || bot.estado === 'esperando_qr') return true;
  // Se cayó: se reintenta, salvo que nadie haya escaneado el QR (espera a que lo pidan).
  return bot.estado === 'error' && bot.ultimo_error !== QR_VENCIDO;
}

/** Espera antes del intento `n` (desde 0) de reconectar: 30 s, 1, 2, 4 min y después 5 min. */
export function esperaReconexion(n: number): number {
  return Math.min(RECONEXION_MAX_MS, RECONEXION_BASE_MS * 2 ** Math.max(0, n));
}
