import { NextResponse } from 'next/server';
import { requireProjectAccess, resolveProjectIdFromFloor, resolveRequestedProjectId } from '@/lib/supabase/require-project-access';
import { isValidEnum, UNIT_STATUSES } from '@/lib/validate';

// GET /api/admin/units            → todas las unidades del proyecto activo,
//                                    con edificio/piso resueltos (para el
//                                    listado global de Inventario).
// GET /api/admin/units?floorId=.. → solo las unidades de ese piso (valida
//                                    que ese piso sea del proyecto activo).
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const floorId = searchParams.get('floorId');

  if (floorId) {
    const projectId = await resolveProjectIdFromFloor(floorId);
    if (!projectId) return NextResponse.json({ error: 'Piso no encontrado' }, { status: 404 });
    const access = await requireProjectAccess(projectId);
    if (!access) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

    const { data: units, error } = await access.supabase.from('units').select('*').eq('floor_id', floorId).order('code');
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(units ?? []);
  }

  // Listado global: solo unidades del proyecto activo — sin este filtro, el
  // panel de un proyecto mostraría inventario mezclado con el de otros.
  const projectId = await resolveRequestedProjectId(request);
  if (!projectId) return NextResponse.json({ error: 'Proyecto no encontrado' }, { status: 404 });
  const access = await requireProjectAccess(projectId);
  if (!access) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const { supabase } = access;

  const { data: buildings } = await supabase.from('buildings').select('id, slug, name').eq('project_id', projectId);
  const buildingIds = (buildings ?? []).map(b => b.id);
  const { data: floors } = buildingIds.length
    ? await supabase.from('floors').select('id, number, building_id').in('building_id', buildingIds)
    : { data: [] };
  const floorIds = (floors ?? []).map(f => f.id);
  if (floorIds.length === 0) return NextResponse.json([]);

  const { data: units, error } = await supabase.from('units').select('*').in('floor_id', floorIds).order('code');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

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
  const body = await request.json();
  if (!body.floorId || !body.code || !body.type) {
    return NextResponse.json({ error: 'Faltan floorId, code y/o type' }, { status: 400 });
  }
  if (body.status !== undefined && !isValidEnum(body.status, UNIT_STATUSES)) {
    return NextResponse.json({ error: `status debe ser uno de: ${UNIT_STATUSES.join(', ')}` }, { status: 400 });
  }

  const projectId = await resolveProjectIdFromFloor(body.floorId);
  if (!projectId) return NextResponse.json({ error: 'Piso no encontrado' }, { status: 404 });
  const access = await requireProjectAccess(projectId);
  if (!access) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const { supabase: sessionClient } = access;

  const { data, error } = await sessionClient
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
      currency: body.currency ?? 'USD',
      status: body.status ?? 'available',
      orientation: body.orientation ?? null,
      interior_image_url: body.interiorImageUrl ?? null,
      gallery_images: body.galleryImages ?? [],
      floor_plan_3d_url: body.floorPlan3dUrl ?? null,
      plan_3d_url: body.plan3dUrl ?? null,
      technical_plan_url: body.technicalPlanUrl ?? null,
      // Solo llegan cuando la unidad se crea a partir de "Duplicar" —
      // deptos idénticos comparten ambientes y recorrido 360°.
      room_plan_image: body.roomPlanImage ?? null,
      rooms: body.rooms ?? null,
      tour_image_url: body.tourImageUrl ?? null,
      tour_data: body.tourData ?? null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
