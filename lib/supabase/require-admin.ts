import 'server-only';
import { getRequestUser } from './auth';

// Segunda capa de defensa además de proxy.ts: si algún día una ruta
// bajo /api/admin queda fuera del matcher del proxy por error, esto
// sigue bloqueando el acceso sin sesión.
export async function requireAdminUser() {
  return getRequestUser();
}
