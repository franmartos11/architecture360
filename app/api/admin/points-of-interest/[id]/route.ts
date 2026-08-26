import { NextResponse } from 'next/server';
import { requireProjectAccess, resolveProjectIdFromPoi } from '@/lib/supabase/require-project-access';
import { isValidEnum, POI_CATEGORIES } from '@/lib/validate';
import { sanitizeText } from '@/lib/sanitize';

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const projectId = await resolveProjectIdFromPoi(id);
  if (!projectId) return NextResponse.json({ error: 'Punto de interés no encontrado' }, { status: 404 });

  const access = await requireProjectAccess(projectId);
  if (!access) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const { supabase } = access;

  const body = await request.json();
  if (body.category !== undefined && !isValidEnum(body.category, POI_CATEGORIES)) {
    return NextResponse.json({ error: `category debe ser uno de: ${POI_CATEGORIES.join(', ')}` }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};
  if (body.name !== undefined) updates.name = sanitizeText(body.name, 150);
  if (body.category !== undefined) updates.category = body.category;
  if (body.description !== undefined) updates.description = sanitizeText(body.description, 500) || null;
  if (body.distanceLabel !== undefined) updates.distance_label = sanitizeText(body.distanceLabel, 100) || null;
  if (body.image !== undefined) updates.image = body.image;
  if (body.latitude !== undefined) updates.latitude = body.latitude;
  if (body.longitude !== undefined) updates.longitude = body.longitude;
  if (body.sortOrder !== undefined) updates.sort_order = body.sortOrder;
  if (body.walkMinutes !== undefined) updates.walk_minutes = body.walkMinutes != null ? Number(body.walkMinutes) : null;
  if (body.driveMinutes !== undefined) updates.drive_minutes = body.driveMinutes != null ? Number(body.driveMinutes) : null;
  if (body.bikeMinutes !== undefined) updates.bike_minutes = body.bikeMinutes != null ? Number(body.bikeMinutes) : null;

  const { data, error } = await supabase.from('points_of_interest').update(updates).eq('id', id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const projectId = await resolveProjectIdFromPoi(id);
  if (!projectId) return NextResponse.json({ error: 'Punto de interés no encontrado' }, { status: 404 });

  const access = await requireProjectAccess(projectId);
  if (!access) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const { supabase } = access;

  const { error } = await supabase.from('points_of_interest').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
