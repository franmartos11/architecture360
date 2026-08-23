import { NextResponse } from 'next/server';
import { requireProjectAccess, resolveProjectIdFromAmenity, resolveProjectIdFromBuilding } from '@/lib/supabase/require-project-access';

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const projectId = await resolveProjectIdFromAmenity(id);
  if (!projectId) return NextResponse.json({ error: 'Amenity no encontrada' }, { status: 404 });

  const body = await request.json();
  if (body.buildingId) {
    const buildingProjectId = await resolveProjectIdFromBuilding(body.buildingId);
    if (buildingProjectId !== projectId) {
      return NextResponse.json({ error: 'Ese edificio no pertenece a este proyecto' }, { status: 400 });
    }
  }

  const access = await requireProjectAccess(projectId);
  if (!access) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const { supabase } = access;

  const updates: Record<string, unknown> = {};
  if (body.buildingId !== undefined) updates.building_id = body.buildingId;
  if (body.name !== undefined) updates.name = body.name;
  if (body.description !== undefined) updates.description = body.description;
  if (body.images !== undefined) updates.images = body.images;
  if (body.tourNodeId !== undefined) updates.tour_node_id = body.tourNodeId;
  if (body.tour3dUrl !== undefined) updates.tour_3d_url = body.tour3dUrl;
  if (body.sortOrder !== undefined) updates.sort_order = body.sortOrder;

  const { data, error } = await supabase.from('amenities').update(updates).eq('id', id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const projectId = await resolveProjectIdFromAmenity(id);
  if (!projectId) return NextResponse.json({ error: 'Amenity no encontrada' }, { status: 404 });

  const access = await requireProjectAccess(projectId);
  if (!access) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const { supabase } = access;

  const { error } = await supabase.from('amenities').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
