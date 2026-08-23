import { NextResponse } from 'next/server';
import { requireProjectAccess, resolveProjectIdFromHotspot, resolveProjectIdFromBuilding } from '@/lib/supabase/require-project-access';

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const projectId = await resolveProjectIdFromHotspot(id);
  if (!projectId) return NextResponse.json({ error: 'Hotspot no encontrado' }, { status: 404 });

  const body = await request.json();
  if (body.buildingId !== undefined) {
    const newBuildingProjectId = await resolveProjectIdFromBuilding(body.buildingId);
    if (newBuildingProjectId !== projectId) {
      return NextResponse.json({ error: 'Ese edificio no pertenece a este proyecto' }, { status: 400 });
    }
  }

  const access = await requireProjectAccess(projectId);
  if (!access) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const { supabase } = access;

  const updates: Record<string, unknown> = {};
  if (body.buildingId !== undefined) updates.building_id = body.buildingId;
  if (body.x !== undefined) updates.x = body.x;
  if (body.y !== undefined) updates.y = body.y;
  if (body.polygon !== undefined) updates.polygon = body.polygon;

  const { data, error } = await supabase.from('aerial_hotspots').update(updates).eq('id', id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const projectId = await resolveProjectIdFromHotspot(id);
  if (!projectId) return NextResponse.json({ error: 'Hotspot no encontrado' }, { status: 404 });

  const access = await requireProjectAccess(projectId);
  if (!access) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const { supabase } = access;

  const { error } = await supabase.from('aerial_hotspots').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
