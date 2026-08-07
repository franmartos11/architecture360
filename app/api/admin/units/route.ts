import { NextResponse } from 'next/server';
import { requireAdminUser } from '@/lib/supabase/require-admin';
import { createAdminClient } from '@/lib/supabase/admin';

// GET /api/admin/units            → todas las unidades del proyecto, con
//                                    edificio/piso resueltos (para el
//                                    listado global de Inventario).
// GET /api/admin/units?floorId=.. → solo las unidades de ese piso.
export async function GET(request: Request) {
  const user = await requireAdminUser();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const floorId = searchParams.get('floorId');

  const admin = createAdminClient();
  let query = admin.from('units').select('*').order('code');
  if (floorId) query = query.eq('floor_id', floorId);

  const { data: units, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (floorId) {
    // El llamador ya sabe el edificio/piso (viene de esa pantalla).
    return NextResponse.json(units ?? []);
  }

  // Listado global: enriquecer cada unidad con edificio/piso para mostrarlos.
  const { data: floors } = await admin.from('floors').select('id, number, building_id');
  const { data: buildings } = await admin.from('buildings').select('id, slug, name');
  const floorById = new Map((floors ?? []).map(f => [f.id, f]));
  const buildingById = new Map((buildings ?? []).map(b => [b.id, b]));

  const enriched = (units ?? []).map(u => {
    const floor = floorById.get(u.floor_id);
    const building = floor ? buildingById.get(floor.building_id) : undefined;
    return {
      ...u,
      floor_number: floor?.number ?? null,
      building_slug: building?.slug ?? null,
      building_name: building?.name ?? null,
    };
  });

  return NextResponse.json(enriched);
}

export async function POST(request: Request) {
  const user = await requireAdminUser();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const body = await request.json();
  if (!body.floorId || !body.code || !body.type) {
    return NextResponse.json({ error: 'Faltan floorId, code y/o type' }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('units')
    .insert({
      floor_id: body.floorId,
      code: body.code,
      model_name: body.modelName ?? null,
      type: body.type,
      total_area: body.totalArea ?? null,
      inner_area: body.innerArea ?? null,
      balcony_area: body.balconyArea ?? 0,
      external_area: body.externalArea ?? 0,
      bedrooms: body.bedrooms ?? 0,
      bathrooms: body.bathrooms ?? 1,
      has_service_room: body.hasServiceRoom ?? false,
      price: body.price ?? null,
      status: body.status ?? 'available',
      orientation: body.orientation ?? null,
      interior_image_url: body.interiorImageUrl ?? null,
      gallery_images: body.galleryImages ?? [],
      floor_plan_3d_url: body.floorPlan3dUrl ?? null,
      plan_3d_url: body.plan3dUrl ?? null,
      technical_plan_url: body.technicalPlanUrl ?? null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
