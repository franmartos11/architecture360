import { NextResponse } from 'next/server';
import { requireProjectAccess, resolveProjectIdFromFloor, resolveRequestedProjectId } from '@/lib/supabase/require-project-access';
import { isValidEnum, UNIT_STATUSES } from '@/lib/validate';
import { getProjectTypeConfig, buildingAgreement } from '@/lib/project-types';
import { sanitizeText } from '@/lib/sanitize';

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
  if (!body.floorId || !body.code || typeof body.code !== 'string' || !body.type) {
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

  // Tipos sin "paso de unidades" (hoy: casas) tienen el building COMO la
  // unidad — no admiten una segunda. El cliente ya oculta el alta múltiple
  // para estos casos (ver FloorUnitsEditor.tsx), pero eso no alcanza: sin
  // este chequeo acá, cualquier llamada directa al endpoint (o una carrera
  // entre pantallas) podía crear una segunda unidad huérfana en el mismo
  // piso.
  const { data: project } = await sessionClient.from('projects').select('project_type, sale_mode').eq('id', projectId).maybeSingle();
  const typeConfig = getProjectTypeConfig(project?.project_type ?? '', project?.sale_mode ?? '');
  if (!typeConfig.hasUnitStep) {
    const { count } = await sessionClient
      .from('units')
      .select('id', { count: 'exact', head: true })
      .eq('floor_id', body.floorId);
    if ((count ?? 0) > 0) {
      const bAgree = buildingAgreement(typeConfig);
      return NextResponse.json({
        error: `${bAgree.Esta} ${typeConfig.buildingLabel.toLowerCase()} ya tiene su ${typeConfig.unitLabel.toLowerCase()} cargada — no admite más de una.`,
      }, { status: 409 });
    }
  }

  const { data, error } = await sessionClient
    .from('units')
    .insert({
      floor_id: body.floorId,
      code: sanitizeText(body.code, 60),
      model_name: sanitizeText(body.modelName, 150) || null,
      type: body.type,
      total_area: body.totalArea ?? null,
      inner_area: body.innerArea ?? null,
      balcony_area: body.balconyArea ?? 0,
      external_area: body.externalArea ?? 0,
      bedrooms: body.bedrooms ?? 0,
      bathrooms: body.bathrooms ?? 1,
      has_service_room: body.hasServiceRoom ?? false,
      lot_size: body.lotSize ?? null,
      ceiling_height: body.ceilingHeight ?? null,
      garage_spaces: body.garageSpaces ?? 0,
      garage_type: body.garageType ?? null,
      living_rooms: body.livingRooms ?? 1,
      kitchens: body.kitchens ?? 1,
      other_rooms_count: body.otherRoomsCount ?? 0,
      other_rooms_description: sanitizeText(body.otherRoomsDescription, 200) || null,
      hoa_fee: body.hoaFee ?? null,
      floors_count: body.floorsCount ?? 1,
      price: body.price ?? null,
      currency: sanitizeText(body.currency, 3) || 'USD',
      status: body.status ?? 'available',
      orientation: sanitizeText(body.orientation, 10) || null,
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
