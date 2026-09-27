import { NextResponse } from 'next/server';
import { resolveRequestedProjectId, resolveProjectIdFromBuilding, resolveProjectIdFromFloor, requireProjectAccess } from '@/lib/supabase/require-project-access';
import { sanitizeText, sanitizeMultiline, sanitizeSpecs, sanitizePoint, sanitizePolygon } from '@/lib/sanitize';

export async function POST(request: Request) {
  const projectId = await resolveRequestedProjectId(request);
  if (!projectId) return NextResponse.json({ error: 'Proyecto no encontrado' }, { status: 404 });

  const body = await request.json();
  if (!body.name || typeof body.name !== 'string') {
    return NextResponse.json({ error: 'Falta name' }, { status: 400 });
  }
  if (body.buildingId) {
    const buildingProjectId = await resolveProjectIdFromBuilding(body.buildingId);
    if (buildingProjectId !== projectId) {
      return NextResponse.json({ error: 'Ese edificio no pertenece a este proyecto' }, { status: 400 });
    }
  }
  if (body.floorId) {
    const floorProjectId = await resolveProjectIdFromFloor(body.floorId);
    if (floorProjectId !== projectId) {
      return NextResponse.json({ error: 'Ese piso no pertenece a este proyecto' }, { status: 400 });
    }
  }

  const polygon = sanitizePolygon(body.polygon);

  const access = await requireProjectAccess(projectId, { revalidate: true });
  if (!access) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const { supabase } = access;

  const { data, error } = await supabase
    .from('amenities')
    .insert({
      project_id: projectId,
      building_id: body.buildingId ?? null,
      name: sanitizeText(body.name, 150),
      description: sanitizeMultiline(body.description, 2000) || null,
      images: body.images ?? [],
      category: sanitizeText(body.category, 40) || null,
      specs: sanitizeSpecs(body.specs),
      location: sanitizeText(body.location, 80) || null,
      floor_id: body.floorId ?? null,
      pin: sanitizePoint(body.pin),
      polygon: polygon.length ? polygon : null,
      tour_node_id: body.tourNodeId ?? null,
      tour_3d_url: body.tour3dUrl ?? null,
      sort_order: body.sortOrder ?? 0,
      visible: body.visible ?? true,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
