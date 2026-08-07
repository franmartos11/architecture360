import 'server-only';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { getSupabaseServiceRoleKey, getSupabaseUrl } from './env';

// Cliente con la service_role key: ignora RLS por completo.
// SOLO se debe importar desde rutas API (app/api/**) o Server Actions
// del panel de admin — nunca desde un componente 'use client' ni desde
// código que pueda terminar en el bundle del browser. El import de
// 'server-only' hace que el build falle si eso llegara a pasar.
export function createAdminClient() {
  return createSupabaseClient(getSupabaseUrl(), getSupabaseServiceRoleKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
