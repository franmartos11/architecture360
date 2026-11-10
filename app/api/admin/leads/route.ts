import { NextResponse } from 'next/server';
import { requireProjectAccess, resolveRequestedProjectId } from '@/lib/supabase/require-project-access';
import { serverError } from '@/lib/api-errors';

export async function GET(request: Request) {
  const projectId = await resolveRequestedProjectId(request);
  if (!projectId) return NextResponse.json({ error: 'Proyecto no encontrado' }, { status: 404 });

  const access = await requireProjectAccess(projectId);
  if (!access) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const { supabase } = access;

  // ?count=1&since=<ms> → solo cuántos leads entraron después de `since` (el
  // badge del sidebar lo pide cada 30 s: antes bajaba la lista entera y la
  // contaba en el navegador).
  const url = new URL(request.url);
  if (url.searchParams.get('count') === '1') {
    const since = Number(url.searchParams.get('since') ?? 0);
    const sinceIso = new Date(Number.isFinite(since) && since > 0 ? since : 0).toISOString();
    const { count, error: countError } = await supabase
      .from('leads')
      .select('id', { count: 'exact', head: true })
      .eq('project_id', projectId)
      .gt('created_at', sinceIso);
    if (countError) {
      console.error('[leads] no se pudo contar', countError);
      return NextResponse.json({ error: 'No se pudieron contar los leads.' }, { status: 500 });
    }
    return NextResponse.json({ count: count ?? 0 });
  }

  const { data, error } = await supabase
    .from('leads')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false });

  if (error) return serverError(error);
  return NextResponse.json(data ?? []);
}
