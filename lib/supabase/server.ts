import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getSupabaseAnonKey, getSupabaseUrl } from './env';

// Cliente para Server Components / Route Handlers (respeta RLS, sesión
// de auth leída de las cookies). Usar para lecturas del sitio público
// y para saber si hay un admin logueado.
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(getSupabaseUrl(), getSupabaseAnonKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Se llamó desde un Server Component sin permiso de escritura;
          // el middleware ya se encarga de refrescar la cookie de sesión.
        }
      },
    },
  });
}
