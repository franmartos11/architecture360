// Cliente de Claude del bot (puente y simulador del panel).
// Sin imports de next/react: corre con tsx fuera de Next.
import Anthropic from '@anthropic-ai/sdk';

/**
 * Tiempo máximo y reintentos del SDK por pedido. Los valores por defecto del
 * SDK (10 min y 2 reintentos) se multiplican con el reintento propio de
 * responderTurno y con hasta 6 iteraciones por turno: una llamada colgada
 * podía frenar una conversación casi una hora. Un turno del bot (effort low)
 * tarda segundos; 90 s ya es una falla.
 */
export const LIMITES_CLAUDE = { timeout: 90_000, maxRetries: 1 } as const;

/**
 * Lee ANTHROPIC_API_KEY del entorno. Si la clave no está asignada a un
 * workspace, la API exige el header anthropic-workspace-id en cada pedido:
 * va por ANTHROPIC_WORKSPACE_ID (opcional; con una clave de workspace no hace falta).
 * `limites` pisa LIMITES_CLAUDE (el simulador del panel usa unos más cortos).
 */
export function crearClienteClaude(
  env: Record<string, string | undefined> = process.env,
  limites: { timeout?: number; maxRetries?: number } = {},
): Anthropic {
  const workspace = env.ANTHROPIC_WORKSPACE_ID?.trim();
  return new Anthropic({
    apiKey: env.ANTHROPIC_API_KEY,
    timeout: limites.timeout ?? LIMITES_CLAUDE.timeout,
    maxRetries: limites.maxRetries ?? LIMITES_CLAUDE.maxRetries,
    ...(workspace ? { defaultHeaders: { 'anthropic-workspace-id': workspace } } : {}),
  });
}
