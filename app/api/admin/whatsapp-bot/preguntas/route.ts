import { NextResponse } from 'next/server';
import { requireProjectAccess, resolveRequestedProjectId } from '@/lib/supabase/require-project-access';
import { esTablaFaltante } from '@/lib/whatsapp-bot/preguntas';
import type { WaPregunta } from '@/types/whatsapp-bot';
import { serverError } from '@/lib/api-errors';

const LIMITE = 300;

/** Preguntas que el bot no supo responder y las ya respondidas (administrador en adelante). */
export async function GET(request: Request) {
  const projectId = await resolveRequestedProjectId(request);
  if (!projectId) return NextResponse.json({ error: 'Proyecto no encontrado' }, { status: 404 });
  const access = await requireProjectAccess(projectId, { minRole: 'administrador' });
  if (!access) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const { data, error } = await access.supabase
    .from('wa_preguntas')
    .select('*')
    .eq('project_id', projectId)
    .neq('estado', 'descartada')
    .order('veces', { ascending: false })
    .order('ultima_at', { ascending: false })
    .limit(LIMITE);
  if (error) {
    // schema.sql sin aplicar todavía: el panel lo avisa en vez de romper.
    if (esTablaFaltante(error)) return NextResponse.json({ preguntas: [], faltaTabla: true });
    return serverError(error);
  }
  return NextResponse.json({ preguntas: (data ?? []) as WaPregunta[] });
}
