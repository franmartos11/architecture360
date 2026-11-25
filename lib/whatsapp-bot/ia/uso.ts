// Uso de tokens de un turno de la IA y su costo estimado.
// Sin imports de next/react: corre con tsx fuera de Next.
import type Anthropic from '@anthropic-ai/sdk';

/** Suma de todas las llamadas a la API de un turno (hasta MAX_ITERACIONES). */
export type UsoTurno = {
  /** Modelo que respondió la última llamada (con fallbacks puede no ser MODELO). */
  modelo: string | null;
  llamadas: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
};

export const USO_VACIO: UsoTurno = {
  modelo: null,
  llamadas: 0,
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
};

export function sumarUso(acumulado: UsoTurno, r: Pick<Anthropic.Beta.BetaMessage, 'model' | 'usage'>): UsoTurno {
  const u = r.usage;
  return {
    modelo: r.model ?? acumulado.modelo,
    llamadas: acumulado.llamadas + 1,
    inputTokens: acumulado.inputTokens + (u?.input_tokens ?? 0),
    outputTokens: acumulado.outputTokens + (u?.output_tokens ?? 0),
    cacheReadTokens: acumulado.cacheReadTokens + (u?.cache_read_input_tokens ?? 0),
    cacheWriteTokens: acumulado.cacheWriteTokens + (u?.cache_creation_input_tokens ?? 0),
  };
}

/**
 * USD por millón de tokens, precios de lista de la API de Anthropic
 * (noviembre de 2026). La escritura en caché es la de 5 minutos (1,25 × la
 * entrada), que es la que usa el bot. Un modelo que no está acá (por ejemplo,
 * un fallback nuevo) no se estima: se muestran sus tokens sin precio.
 */
export const PRECIOS_USD_POR_MTOK: Record<string, { input: number; output: number; cacheRead: number; cacheWrite: number }> = {
  'claude-opus-5-5': { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 },
  'claude-opus-5': { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
  'claude-opus-4-8': { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
  'claude-sonnet-5-5': { input: 2, output: 10, cacheRead: 0.1, cacheWrite: 2.5 },
  'claude-haiku-5-5': { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 },
};

/** Costo estimado en USD, o null si el modelo no tiene precio cargado. */
export function costoEstimadoUsd(u: Pick<UsoTurno, 'modelo' | 'inputTokens' | 'outputTokens' | 'cacheReadTokens' | 'cacheWriteTokens'>): number | null {
  const p = u.modelo ? PRECIOS_USD_POR_MTOK[u.modelo] : undefined;
  if (!p) return null;
  return (
    (u.inputTokens * p.input + u.outputTokens * p.output + u.cacheReadTokens * p.cacheRead + u.cacheWriteTokens * p.cacheWrite) /
    1_000_000
  );
}

/** Una fila de wa_uso_ia: el uso de un turno y de dónde salió. */
export type RegistroUsoIa = {
  projectId: string;
  botId: string | null;
  conversacionId: string | null;
  origen: 'respuesta' | 'seguimiento' | 'simulador' | 'web';
  uso: UsoTurno;
  motivoSinRespuesta?: string | null;
};
