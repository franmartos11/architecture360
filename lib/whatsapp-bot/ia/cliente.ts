// Cliente de Claude del bot (puente y simulador del panel).
// Sin imports de next/react: corre con tsx fuera de Next.
import Anthropic from '@anthropic-ai/sdk';

/**
 * Lee ANTHROPIC_API_KEY del entorno. Si la clave no está asignada a un
 * workspace, la API exige el header anthropic-workspace-id en cada pedido:
 * va por ANTHROPIC_WORKSPACE_ID (opcional; con una clave de workspace no hace falta).
 */
export function crearClienteClaude(env: Record<string, string | undefined> = process.env): Anthropic {
  const workspace = env.ANTHROPIC_WORKSPACE_ID?.trim();
  return new Anthropic({
    apiKey: env.ANTHROPIC_API_KEY,
    ...(workspace ? { defaultHeaders: { 'anthropic-workspace-id': workspace } } : {}),
  });
}
