import { NextResponse } from 'next/server';
import { requireProjectAccess, resolveProjectIdFromBuilding } from '@/lib/supabase/require-project-access';

export async function POST(request: Request) {
  const body = await request.json();
  if (!body.buildingId || body.number === undefined || !body.label) {
    return NextResponse.json({ error: 'Faltan buildingId, number y/o label' }, { status: 400 });
  }

  const projectId = await resolveProjectIdFromBuilding(body.buildingId);
  if (!projectId) return NextResponse.json({ error: 'Edificio no encontrado' }, { status: 404 });

  const access = await requireProjectAccess(projectId);
  if (!access) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const { supabase } = access;

  const { data, error } = await supabase
    .from('floors')
    .insert({
      building_id: body.buildingId,
      number: body.number,
      label: body.label,
      plan_image: body.planImage ?? null,
      unit_dots: body.unitDots ?? [],
      floor_kind: body.floorKind ?? 'units',
      floor_kind_description: body.floorKindDescription || null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
