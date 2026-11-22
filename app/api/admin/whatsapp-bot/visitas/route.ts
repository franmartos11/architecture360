import { NextResponse } from 'next/server';
import { requireProjectAccess, resolveRequestedProjectId } from '@/lib/supabase/require-project-access';
import { esTablaFaltante } from '@/lib/whatsapp-bot/preguntas';
import type { WaVisita } from '@/types/whatsapp-bot';
import { serverError } from '@/lib/api-errors';

/** Cuánto para atrás se muestran las visitas pasadas. */
const DIAS_ATRAS = 30;
const LIMITE = 300;

/** Visitas del proyecto: las próximas y las de los últimos 30 días (gestor en adelante). */
export async function GET(request: Request) {
  const projectId = await resolveRequestedProjectId(request);
  if (!projectId) return NextResponse.json({ error: 'Proyecto no encontrado' }, { status: 404 });
  const access = await requireProjectAccess(projectId, { minRole: 'gestor' });
  if (!access) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const desde = new Date(Date.now() - DIAS_ATRAS * 24 * 3_600_000).toISOString();
  const { data, error } = await access.supabase
    .from('wa_visitas')
    .select('*')
    .eq('project_id', projectId)
    .gte('inicio', desde)
    .order('inicio', { ascending: true })
    .limit(LIMITE);
  if (error) {
    if (esTablaFaltante(error, 'wa_visitas')) {
      return NextResponse.json({ visitas: [], faltaTabla: true });
    }
    return serverError(error);
  }
  return NextResponse.json({ visitas: (data ?? []) as WaVisita[] });
}
