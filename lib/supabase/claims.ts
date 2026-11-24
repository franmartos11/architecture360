import type { SupabaseClient } from '@supabase/supabase-js';

// Para route handlers que solo necesitan saber QUIÉN llama (user.id).
//
// supabase.auth.getUser() hace un round trip a la API de Auth en cada
// request; una página como /feed dispara varias rutas /api/** al cargar,
// y un loop de recargas (ej. HMR roto en dev) alcanzaba para comerse el
// rate limit de Auth (429 over_request_rate_limit). getClaims() valida la
// firma del JWT localmente contra las claves públicas del proyecto (ES256,
// JWKS cacheado), así que no gasta requests a Auth.
//
// Trade-off: un token ya emitido sigue valiendo hasta que expira (~1h)
// aunque se cierre la sesión o se borre el usuario. Para rutas donde eso
// importe (ej. el panel admin, protegido en proxy.ts), seguir usando
// getUser().
export async function getClaimsUser(supabase: SupabaseClient): Promise<{ id: string } | null> {
  const { data } = await supabase.auth.getClaims();
  const sub = data?.claims?.sub;
  return sub ? { id: sub } : null;
}
