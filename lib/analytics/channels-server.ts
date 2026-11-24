import { NextResponse } from 'next/server';
import { requireProjectAccess, resolveRequestedProjectId } from '@/lib/supabase/require-project-access';

// Piezas de servidor compartidas por /api/admin/channels y /api/admin/metrics.

/** Refs con al menos un evento o lead en el proyecto. */
export async function refsWithTraffic(supabase: { rpc: (fn: string, args: object) => PromiseLike<{ data: unknown; error: unknown }> }, projectId: string): Promise<Set<string>> {
  const { data, error } = await supabase.rpc('channel_refs_with_traffic', { p_project_id: projectId });
  if (error) throw error;
  return new Set((data as string[] | null) ?? []);
}

export async function requireChannelsAccess(request: Request) {
  const projectId = await resolveRequestedProjectId(request);
  if (!projectId) return { ok: false, error: NextResponse.json({ error: 'Proyecto no encontrado' }, { status: 404 }) } as const;
  const access = await requireProjectAccess(projectId, { minRole: 'gestor' });
  if (!access) return { ok: false, error: NextResponse.json({ error: 'No autorizado' }, { status: 401 }) } as const;
  return { ok: true, projectId, supabase: access.supabase } as const;
}

