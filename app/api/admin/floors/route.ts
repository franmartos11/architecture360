import { NextResponse } from 'next/server';
import { requireProjectAccess, resolveProjectIdFromBuilding, resolveRequestedProjectId } from '@/lib/supabase/require-project-access';
import { sanitizeText } from '@/lib/sanitize';
import { readJsonObject, validateJson } from '@/lib/api-validate';
import { floorCreateSchema } from '@/lib/structure-schemas';

export async function GET(request: Request) {
  const projectId = await resolveRequestedProjectId(request);
  if (!projectId) return NextResponse.json({ error: 'Proyecto no encontrado' }, { status: 404 });
  const access = await requireProjectAccess(projectId);
  if (!access) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const { supabase } = access;

  const { data: buildings } = await supabase.from('buildings').select('id').eq('project_id', projectId);
  const buildingIds = (buildings ?? []).map(b => b.id);
  
  if (buildingIds.length === 0) return NextResponse.json([]);

  const { data: floors, error } = await supabase
    .from('floors')
    .select('*')
    .in('building_id', buildingIds)
    .order('number');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(floors ?? []);
}

export async function POST(request: Request) {
  const raw = await readJsonObject(request);
  if ('error' in raw) return raw.error;
  if (!raw.data.buildingId || raw.data.number === undefined || !raw.data.label || typeof raw.data.label !== 'string') {
    return NextResponse.json({ error: 'Faltan buildingId, number y/o label' }, { status: 400 });
  }
  const parsed = validateJson(raw.data, floorCreateSchema);
  if ('error' in parsed) return parsed.error;
  const body = parsed.data;

  const projectId = await resolveProjectIdFromBuilding(body.buildingId);
  if (!projectId) return NextResponse.json({ error: 'Edificio no encontrado' }, { status: 404 });

  const access = await requireProjectAccess(projectId, { revalidate: true });
  if (!access) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const { supabase } = access;

  const { data, error } = await supabase
    .from('floors')
    .insert({
      building_id: body.buildingId,
      number: body.number,
      label: sanitizeText(body.label, 100),
      plan_image: body.planImage ?? null,
      unit_dots: body.unitDots ?? [],
      floor_kind: body.floorKind ?? 'units',
      floor_kind_description: sanitizeText(body.floorKindDescription, 300) || null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
