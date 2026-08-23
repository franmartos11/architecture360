import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { requireProjectAccess, ACTIVE_PROJECT_COOKIE } from '@/lib/supabase/require-project-access';

// Marca con qué proyecto está trabajando la cuenta logueada — todas las
// rutas admin que no reciben ?projectId= explícito lo resuelven leyendo
// esta cookie (ver resolveRequestedProjectId).
export async function POST(request: Request) {
  const body = await request.json();
  if (!body.projectId) return NextResponse.json({ error: 'Falta projectId' }, { status: 400 });

  const access = await requireProjectAccess(body.projectId);
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
