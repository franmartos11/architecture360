import { NextResponse } from 'next/server';
import { requireAdminUser } from '@/lib/supabase/require-admin';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAdminUser();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const { id } = await params;
  const admin = createAdminClient();

  const { data: building, error } = await admin.from('buildings').select('*').eq('id', id).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!building) return NextResponse.json({ error: 'Edificio no encontrado' }, { status: 404 });

  const { data: floors } = await admin
    .from('floors')
    .select('*')
    .eq('building_id', id)
    .order('number');

  // Datos mínimos de las unidades de todos los pisos, solo para poder
  // mostrar un indicador de completitud (fotos/precio faltantes) por piso.
  const floorIds = (floors ?? []).map(f => f.id);
  const { data: units } = floorIds.length
    ? await admin.from('units').select('floor_id, interior_image_url, price').in('floor_id', floorIds)
    : { data: [] };

  return NextResponse.json({ building, floors: floors ?? [], units: units ?? [] });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAdminUser();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const { id } = await params;
  const body = await request.json();
  const admin = createAdminClient();

  const updates: Record<string, unknown> = {};
  if (body.name !== undefined) updates.name = body.name;
  if (body.slug !== undefined) updates.slug = body.slug;
  if (body.totalFloors !== undefined) updates.total_floors = body.totalFloors;
  if (body.amenitiesTour !== undefined) updates.amenities_tour = body.amenitiesTour;
  if (body.coverImage !== undefined) updates.cover_image = body.coverImage;

  const { data, error } = await admin.from('buildings').update(updates).eq('id', id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAdminUser();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const { id } = await params;
  const admin = createAdminClient();

  const { data: building } = await admin.from('buildings').select('project_id').eq('id', id).maybeSingle();
  if (!building) return NextResponse.json({ error: 'Edificio no encontrado' }, { status: 404 });

  const { count } = await admin
    .from('buildings')
    .select('id', { count: 'exact', head: true })
    .eq('project_id', building.project_id);
  if ((count ?? 0) <= 1) {
    return NextResponse.json({ error: 'No se puede borrar el único edificio del proyecto.' }, { status: 400 });
  }

  // Cascade en la base se lleva pisos, unidades y hotspots que apunten a este edificio.
  const { error } = await admin.from('buildings').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
