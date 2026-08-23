import { NextResponse } from 'next/server';
import { requireProjectAccess, resolveProjectIdFromSlide, resolveProjectIdFromBuilding } from '@/lib/supabase/require-project-access';

export async function POST(request: Request) {
  const body = await request.json();
  if (!body.slideId || !body.buildingId || body.x === undefined || body.y === undefined) {
    return NextResponse.json({ error: 'Faltan slideId, buildingId, x y/o y' }, { status: 400 });
  }

  const [slideProjectId, buildingProjectId] = await Promise.all([
    resolveProjectIdFromSlide(body.slideId),
    resolveProjectIdFromBuilding(body.buildingId),
  ]);
  if (!slideProjectId || !buildingProjectId) {
    return NextResponse.json({ error: 'Vista aérea o edificio no encontrado' }, { status: 404 });
  }
  if (slideProjectId !== buildingProjectId) {
    return NextResponse.json({ error: 'La vista aérea y el edificio no pertenecen al mismo proyecto' }, { status: 400 });
  }

  const access = await requireProjectAccess(slideProjectId);
  if (!access) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const { supabase } = access;

  const { data, error } = await supabase
    .from('aerial_hotspots')
    .insert({
      slide_id: body.slideId,
      building_id: body.buildingId,
      x: body.x,
      y: body.y,
      polygon: body.polygon ?? null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
