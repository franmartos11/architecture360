import { NextResponse } from 'next/server';
import { requireProjectAccess, resolveRequestedProjectId } from '@/lib/supabase/require-project-access';
import { serverError } from '@/lib/api-errors';

const LIMITE = 200;

export async function GET(request: Request) {
  const projectId = await resolveRequestedProjectId(request);
  if (!projectId) return NextResponse.json({ error: 'Proyecto no encontrado' }, { status: 404 });
  // Conversaciones: gestor en adelante, igual que leads.
  const access = await requireProjectAccess(projectId, { minRole: 'gestor' });
  if (!access) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  // ?resumen=1 → solo la suma de no leídos (el contador de la pestaña la pide
  // cada 15 s: antes bajaba hasta 200 conversaciones enteras para sumarlas).
  if (new URL(request.url).searchParams.get('resumen') === '1') {
    const { data: filas, error: errResumen } = await access.supabase
      .from('wa_conversaciones')
      .select('no_leidos')
      .eq('project_id', projectId)
      .gt('no_leidos', 0);
    if (errResumen) return serverError(errResumen);
    const noLeidos = (filas ?? []).reduce((s, f) => s + ((f as { no_leidos: number }).no_leidos || 0), 0);
    return NextResponse.json({ noLeidos });
  }

  const { data, error } = await access.supabase
    .from('wa_conversaciones')
    .select('*')
    .eq('project_id', projectId)
    .order('ultimo_mensaje_at', { ascending: false, nullsFirst: false })
    .limit(LIMITE);
  if (error) return serverError(error);
  return NextResponse.json(data ?? []);
}
