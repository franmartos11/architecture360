import 'server-only';
import type { createClient } from '@/lib/supabase/server';

// Vía RPC a una función security definer (ver supabase/schema.sql) — un
// subquery común a user_blocks heredaría el RLS de esa tabla bajo el rol
// de quien llama, y "own read blocks" solo deja ver los bloqueos que la
// propia persona creó, nunca los que le hicieron a ella. La función
// bypasea eso puertas adentro y solo devuelve un booleano, sin exponer
// quién bloqueó a quién.
export async function isBlockedEitherWay(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userIdA: string,
  userIdB: string
): Promise<boolean> {
  const { data, error } = await supabase.rpc('is_blocked_either_way', { user_a: userIdA, user_b: userIdB });
  if (error) {
    console.error('[blocks] no se pudo chequear el bloqueo', error);
    return false;
  }
  return !!data;
}
