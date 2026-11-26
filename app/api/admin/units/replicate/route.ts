import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireProjectAccess, resolveProjectIdFromUnit } from '@/lib/supabase/require-project-access';
import { readJsonObject, validateJson } from '@/lib/api-validate';
import { serverError } from '@/lib/api-errors';
import { buildReplicationPayload } from '@/lib/unit-replicate';
import type { UnitRow } from '@/types/database';

const MAX_TARGETS = 500;

const ReplicateSchema = z.object({
  sourceId: z.string().uuid(),
  targetIds: z.array(z.string().uuid()).min(1).max(MAX_TARGETS),
  groups: z.array(z.enum(['design', 'media', 'tour', 'specs'])).min(1),
});

/**
 * POST /api/admin/units/replicate
 * Copia los grupos elegidos (plano de ambientes, fotos/planos, 360°, datos)
 * desde una unidad origen a muchas unidades destino del mismo proyecto en una
 * sola operación, sin tocar código, estado, precio ni ubicación en el plano.
 */
export async function POST(request: Request) {
  const raw = await readJsonObject(request);
  if ('error' in raw) return raw.error;
  const parsed = validateJson(raw.data, ReplicateSchema);
  if ('error' in parsed) return parsed.error;

  const { sourceId, groups } = parsed.data;
  const targetIds = Array.from(new Set(parsed.data.targetIds.filter(id => id !== sourceId)));
  if (targetIds.length === 0) {
    return NextResponse.json({ error: 'Elegí al menos otra unidad destino.' }, { status: 400 });
  }

  const projectId = await resolveProjectIdFromUnit(sourceId);
  if (!projectId) return NextResponse.json({ error: 'Unidad origen no encontrada' }, { status: 404 });

  const access = await requireProjectAccess(projectId, { revalidate: true });
  if (!access) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const { supabase } = access;

  const { data: sourceRow, error: sourceErr } = await supabase
    .from('units')
    .select('*')
    .eq('id', sourceId)
    .maybeSingle();
  if (sourceErr) return serverError(sourceErr);
  if (!sourceRow) return NextResponse.json({ error: 'Unidad origen no encontrada' }, { status: 404 });

  // Validar que todos los destinos pertenezcan a este mismo proyecto.
  const { data: buildings } = await supabase.from('buildings').select('id').eq('project_id', projectId);
  const buildingIds = (buildings ?? []).map(b => b.id as string);
  const { data: floors } = buildingIds.length
    ? await supabase.from('floors').select('id').in('building_id', buildingIds)
    : { data: [] };
  const floorIds = new Set((floors ?? []).map(f => f.id as string));

  const { data: targetRows, error: targetsErr } = floorIds.size
    ? await supabase.from('units').select('id, floor_id').in('id', targetIds)
    : { data: [], error: null };
  if (targetsErr) return serverError(targetsErr);

  const validIds = ((targetRows ?? []) as { id: string; floor_id: string }[])
    .filter(u => floorIds.has(u.floor_id))
    .map(u => u.id);
  const validSet = new Set(validIds);
  const skipped = targetIds
    .filter(id => !validSet.has(id))
    .map(id => ({ id, reason: 'No pertenece a este proyecto' }));

  if (validIds.length === 0) {
    return NextResponse.json({ updated: [], skipped });
  }

  const payload = buildReplicationPayload(sourceRow as Partial<UnitRow>, groups);
  const { data: updated, error: updateErr } = await supabase
    .from('units')
    .update({ ...payload, updated_at: new Date().toISOString() })
    .in('id', validIds)
    .select('id');
  if (updateErr) return serverError(updateErr);

  const updatedIds = (updated ?? []).map(u => (u as { id: string }).id);
  return NextResponse.json({ updated: updatedIds, skipped });
}
