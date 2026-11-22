import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Asigna la máquina del puente (`host_permitido`) a un bot que todavía no
 * tiene ninguna, usando WA_BOT_HOST_DEFAULT de este deploy (en local la Mac
 * de pruebas, en producción el servidor real).
 *
 * El panel no puede escribir host_permitido (lo frena un trigger), así que
 * va con la service role. Solo completa un bot sin máquina: nunca mueve uno
 * que ya tiene, para que dos puentes no se peleen el mismo número.
 *
 * Devuelve el host asignado, o null si no hay default o el bot ya tenía uno.
 */
export async function asignarHostPorDefecto(botId: string): Promise<string | null> {
  const host = process.env.WA_BOT_HOST_DEFAULT?.trim();
  if (!host) return null;

  const { data, error } = await createAdminClient()
    .from('wa_bots')
    .update({ host_permitido: host })
    .eq('id', botId)
    .is('host_permitido', null)
    .select('host_permitido')
    .maybeSingle();
  if (error) {
    console.error('[whatsapp-bot] no se pudo asignar host_permitido:', error.message);
    return null;
  }
  return (data?.host_permitido as string | undefined) ?? null;
}
