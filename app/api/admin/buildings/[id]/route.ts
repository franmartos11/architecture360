import { NextResponse } from 'next/server';
import { requireProjectAccess, resolveProjectIdFromBuilding } from '@/lib/supabase/require-project-access';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const projectId = await resolveProjectIdFromBuilding(id);
  if (!projectId) return NextResponse.json({ error: 'Edificio no encontrado' }, { status: 404 });

  const access = await requireProjectAccess(projectId);
  if (!access) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const { supabase } = access;

  const { data: building, error } = await supabase.from('buildings').select('*').eq('id', id).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!building) return NextResponse.json({ error: 'Edificio no encontrado' }, { status: 404 });

  const { data: floors } = await supabase
    .from('floors')
    .select('*')
    .eq('building_id', id)
    .order('number');

  // Datos mínimos de las unidades de todos los pisos, solo para poder
  // mostrar un indicador de completitud (fotos/precio faltantes) por piso.
  const floorIds = (floors ?? []).map(f => f.id);
  const { data: units } = floorIds.length
    ? await supabase.from('units').select('floor_id, interior_image_url, price').in('floor_id', floorIds)
    : { data: [] };

  return NextResponse.json({ building, floors: floors ?? [], units: units ?? [] });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const projectId = await resolveProjectIdFromBuilding(id);
  if (!projectId) return NextResponse.json({ error: 'Edificio no encontrado' }, { status: 404 });

  const access = await requireProjectAccess(projectId);
  if (!access) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const { supabase } = access;

  const body = await request.json();

  // slug queda afuera a propósito: es inmutable después de creado (ver
  // lib/slug.ts) para no romper links ya compartidos si renombran el edificio.
  const updates: Record<string, unknown> = {};
  if (body.name !== undefined) updates.name = body.name;
  if (body.totalFloors !== undefined) updates.total_floors = body.totalFloors;
  if (body.amenitiesTour !== undefined) updates.amenities_tour = body.amenitiesTour;
  if (body.coverImage !== undefined) updates.cover_image = body.coverImage;
  if (body.tourOrientationDegrees !== undefined) updates.tour_orientation_degrees = body.tourOrientationDegrees;

  const { data, error } = await supabase.from('buildings').update(updates).eq('id', id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const projectId = await resolveProjectIdFromBuilding(id);
  if (!projectId) return NextResponse.json({ error: 'Edificio no encontrado' }, { status: 404 });

  const access = await requireProjectAccess(projectId);
  if (!access) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const { supabase } = access;

  const { count } = await supabase
    .from('buildings')
    .select('id', { count: 'exact', head: true })
    .eq('project_id', projectId);
  if ((count ?? 0) <= 1) {
    return NextResponse.json({ error: 'No se puede borrar el único edificio del proyecto.' }, { status: 400 });
  }

  // Cascade en la base se lleva pisos, unidades y hotspots que apunten a este edificio.
  const { error } = await supabase.from('buildings').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
