import { createAdminClient } from '@/lib/supabase/admin';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID_RE.test(v);

/**
 * El uuid si es una unidad de ese proyecto; si no (un código legible de un
 * cliente viejo, una unidad de otro proyecto, sin proyecto), null. Lo usan
 * las rutas públicas /api/leads y /api/track, con service-role.
 */
export async function unitOfProject(unitId: string | null | undefined, projectId: string | null | undefined): Promise<string | null> {
  if (!projectId || !isUuid(unitId)) return null;
  const { data } = await createAdminClient()
    .from('units')
    .select('id, floors!inner(buildings!inner(project_id))')
    .eq('id', unitId)
    .eq('floors.buildings.project_id', projectId)
    .maybeSingle();
  return data ? unitId : null;
}
