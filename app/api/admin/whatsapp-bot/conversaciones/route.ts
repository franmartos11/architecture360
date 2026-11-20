import { NextResponse } from 'next/server';
import { requireProjectAccess, resolveRequestedProjectId } from '@/lib/supabase/require-project-access';

const LIMITE = 200;

export async function GET(request: Request) {
  const projectId = await resolveRequestedProjectId(request);
  if (!projectId) return NextResponse.json({ error: 'Proyecto no encontrado' }, { status: 404 });
  // Conversaciones: gestor en adelante, igual que leads.
  const access = await requireProjectAccess(projectId, { minRole: 'gestor' });
  if (!access) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const { data, error } = await access.supabase
    .from('wa_conversaciones')
    .select('*')
    .eq('project_id', projectId)
    .order('ultimo_mensaje_at', { ascending: false, nullsFirst: false })
    .limit(LIMITE);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}
