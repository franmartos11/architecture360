import { NextResponse } from 'next/server';
import { requireProjectAccess, resolveRequestedProjectId, resolveProjectIdFromBuilding } from '@/lib/supabase/require-project-access';
import { sanitizeText, sanitizeMultiline } from '@/lib/sanitize';

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

  const access = await requireProjectAccess(projectId);
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
      tour_node_id: body.tourNodeId ?? null,
      tour_3d_url: body.tour3dUrl ?? null,
      sort_order: body.sortOrder ?? 0,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
