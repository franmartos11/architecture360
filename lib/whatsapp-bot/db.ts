// Cliente de Supabase del puente de WhatsApp (service role, ignora RLS).
// Corre con tsx fuera de Next: no usa lib/supabase/admin.ts (importa server-only).
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseServiceRoleKey, getSupabaseUrl } from '@/lib/supabase/env';

export function createBotClient(): SupabaseClient {
  return createClient(getSupabaseUrl(), getSupabaseServiceRoleKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
