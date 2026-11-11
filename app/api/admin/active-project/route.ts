import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { ACTIVE_PROJECT_COOKIE, requireProjectAccess } from '@/lib/supabase/require-project-access';
import { readJsonObject, validateJson } from '@/lib/api-validate';
import { activeProjectSchema } from '@/lib/content-schemas';

// Marca con qué proyecto está trabajando la cuenta logueada — todas las
// rutas admin que no reciben ?projectId= explícito lo resuelven leyendo
// esta cookie (ver resolveRequestedProjectId).
export async function POST(request: Request) {
  const raw = await readJsonObject(request);
  if ('error' in raw) return raw.error;
  if (!raw.data.projectId) return NextResponse.json({ error: 'Falta projectId' }, { status: 400 });
  // El id termina en una cookie: tiene que ser un texto acotado, no un objeto ni algo enorme.
  const parsed = validateJson(raw.data, activeProjectSchema);
  if ('error' in parsed) return parsed.error;
  const body = parsed.data;

  const access = await requireProjectAccess(body.projectId, { revalidate: true });
  if (!access) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_PROJECT_COOKIE, body.projectId, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 365,
  });

  return NextResponse.json({ success: true });
}
