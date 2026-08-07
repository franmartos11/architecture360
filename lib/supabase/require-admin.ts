import 'server-only';
import { createClient } from './server';

// Segunda capa de defensa además de proxy.ts: si algún día una ruta
// bajo /api/admin queda fuera del matcher del proxy por error, esto
// sigue bloqueando el acceso sin sesión.
export async function requireAdminUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}
