import 'server-only';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { getSupabaseUrl, getSupabaseAnonKey } from './env';

/**
 * Cliente para leer el contenido público del sitio (el microsite de cada
 * proyecto, el directorio). Anónimo y sin cookies, a diferencia del de
 * ./server.ts.
 *
 * Que no lea cookies es el punto: `cookies()` marca la request como dinámica
 * y deja afuera cualquier posibilidad de prerender o de cachear la respuesta.
 * El microsite de un proyecto es el mismo para todos los visitantes anónimos
 * —es contenido de marketing—, así que no hay razón para renderizarlo de nuevo
 * en cada visita. Sin cookies de por medio, la lectura se puede envolver en
 * cache() y revalidarse por tag cuando el admin guarda.
 *
 * Sigue pasando por RLS con la anon key: solo ve lo que ve cualquier visitante.
 * Para leer con la sesión del usuario (admin, preview de borradores) va
 * ./server.ts; para saltear RLS, ./admin.ts.
 */
export function createPublicClient() {
  return createSupabaseClient(getSupabaseUrl(), getSupabaseAnonKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
