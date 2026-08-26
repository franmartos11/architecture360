import 'server-only';
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

interface RateLimitOptions {
  /** Identifica a quién se le está contando — ej. `leads:ip:1.2.3.4` o
   *  `comments:user:<uuid>`. El prefijo por ruta evita que dos endpoints
   *  distintos compartan balde por compartir el mismo id de usuario/IP. */
  key: string;
  windowSeconds: number;
  max: number;
}

// Mismo patrón que ya usaban a mano leads/comments/post-comments/posts/
// collaborators/messages (contar filas recientes + insertar una marca) —
// acá generalizado a una única tabla compartida (api_rate_limit_hits, ver
// supabase/schema.sql) en vez de reusar la tabla de dominio de cada ruta,
// para que CUALQUIER endpoint pueda tener rate-limit sin necesitar una
// columna created_at propia para contra qué contar (ej. los GET, que no
// insertan nada en su propia tabla de dominio).
//
// Siempre usa el cliente de service-role: es contabilidad de infraestructura,
// no un dato del usuario — no tiene sentido exponerlo por RLS a ningún rol,
// ni para rutas anónimas (sin sesión, no habría con qué cliente contar) ni
// para las autenticadas (evita depender de que esa sesión tenga permiso de
// insert/select sobre esta tabla en particular).
async function countRecentHits(key: string, windowSeconds: number): Promise<number> {
  const since = new Date(Date.now() - windowSeconds * 1000).toISOString();
  const { count } = await createAdminClient()
    .from('api_rate_limit_hits')
    .select('id', { count: 'exact', head: true })
    .eq('key', key)
    .gte('created_at', since);
  return count ?? 0;
}

/**
 * true = dentro del límite (y ya registró este intento). false = se pasó
 * — el caller decide qué responder.
 */
export async function checkRateLimit({ key, windowSeconds, max }: RateLimitOptions): Promise<boolean> {
  const recent = await countRecentHits(key, windowSeconds);
  if (recent >= max) return false;

  const admin = createAdminClient();
  await admin.from('api_rate_limit_hits').insert({ key });

  // Housekeeping oportunista: sin esto la tabla crece para siempre. Baja
  // probabilidad para no sumarle una query de DELETE a cada request; no
  // hace falta que sea exacto, solo que la tabla no crezca sin límite.
  if (Math.random() < 0.01) {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    void admin.from('api_rate_limit_hits').delete().lt('created_at', cutoff);
  }

  return true;
}

/**
 * Azúcar para el caso común: si se pasó del límite, devuelve directo la
 * respuesta 429 lista para `return`; si no, devuelve `null` y ya registró
 * el intento. Uso típico:
 *
 *   const limited = await rateLimitOrRespond({ key: `leads:ip:${ip}`, windowSeconds: 600, max: 5 });
 *   if (limited) return limited;
 */
export async function rateLimitOrRespond(
  options: RateLimitOptions,
  message = 'Estás haciendo muchas solicitudes seguidas — esperá un momento e intentá de nuevo.'
): Promise<NextResponse | null> {
  const allowed = await checkRateLimit(options);
  if (allowed) return null;
  return NextResponse.json({ error: message }, { status: 429 });
}
