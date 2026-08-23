import { NextResponse } from 'next/server';
import { requireProjectAccess, resolveProjectIdFromFloor } from '@/lib/supabase/require-project-access';

// Duplica un piso entero: crea un piso nuevo (mismo plano por default, ya
// que en la mayoría de los edificios los pisos repetidos comparten la
// misma imagen) y clona cada unidad del piso de origen — incluyendo
// polígono, ambientes, tour 360° y fotos — porque cuando el layout se
// repite, esa geometría suele calzar pixel a pixel en el piso nuevo.
// El código de cada unidad se intenta re-numerar reemplazando el número
// de piso de origen por el nuevo (ej. "A01-01" → "A02-01"); si no lo
// encuentra en el código, lo deja igual (el admin lo ajusta a mano).
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: sourceFloorId } = await params;
  const projectId = await resolveProjectIdFromFloor(sourceFloorId);
  if (!projectId) return NextResponse.json({ error: 'Piso de origen no encontrado' }, { status: 404 });

  const access = await requireProjectAccess(projectId);
  if (!access) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const { supabase } = access;

  const body = await request.json();
  if (body.number === undefined || !body.label) {
    return NextResponse.json({ error: 'Faltan number y/o label para el piso nuevo' }, { status: 400 });
  }

  const { data: sourceFloor, error: floorErr } = await supabase
    .from('floors')
    .select('*')
    .eq('id', sourceFloorId)
    .maybeSingle();
  if (floorErr) return NextResponse.json({ error: floorErr.message }, { status: 500 });
  if (!sourceFloor) return NextResponse.json({ error: 'Piso de origen no encontrado' }, { status: 404 });

  const includeUnits = body.includeUnits !== false;

  const oldNumTag = String(sourceFloor.number).padStart(2, '0');
  const newNumTag = String(body.number).padStart(2, '0');
  const remapCode = (code: string) =>
    oldNumTag !== newNumTag && code.includes(oldNumTag) ? code.replace(oldNumTag, newNumTag) : code;

  const sourceDots: { unitId: string; x: number; y: number; color?: string; style?: string }[] = sourceFloor.unit_dots ?? [];
  const remappedDots = includeUnits ? sourceDots.map(d => ({ ...d, unitId: remapCode(d.unitId) })) : [];

  const { data: newFloor, error: newFloorErr } = await supabase
    .from('floors')
    .insert({
      building_id: sourceFloor.building_id,
      number: body.number,
      label: body.label,
      plan_image: sourceFloor.plan_image,
      unit_dots: remappedDots,
      floor_kind: sourceFloor.floor_kind,
      floor_kind_description: sourceFloor.floor_kind_description,
    })
    .select()
    .single();
  if (newFloorErr) return NextResponse.json({ error: newFloorErr.message }, { status: 500 });

  let unitsCopied = 0;
  if (includeUnits) {
    const { data: sourceUnits, error: unitsErr } = await supabase
      .from('units')
      .select('*')
      .eq('floor_id', sourceFloorId);
    if (unitsErr) return NextResponse.json({ error: unitsErr.message }, { status: 500 });

    if (sourceUnits && sourceUnits.length > 0) {
      const clones = sourceUnits.map(u => ({
        floor_id: newFloor.id,
        code: remapCode(u.code),
        model_name: u.model_name,
        type: u.type,
        total_area: u.total_area,
        inner_area: u.inner_area,
        balcony_area: u.balcony_area,
        external_area: u.external_area,
        bedrooms: u.bedrooms,
        bathrooms: u.bathrooms,
        has_service_room: u.has_service_room,
        price: u.price,
        status: u.status,
        orientation: u.orientation,
        interior_image_url: u.interior_image_url,
        gallery_images: u.gallery_images,
        floor_plan_3d_url: u.floor_plan_3d_url,
        plan_3d_url: u.plan_3d_url,
        technical_plan_url: u.technical_plan_url,
        room_plan_image: u.room_plan_image,
        polygon: u.polygon,
        rooms: u.rooms,
        tour_image_url: u.tour_image_url,
        tour_data: u.tour_data,
      }));

      const { error: insertErr } = await supabase.from('units').insert(clones);
      if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 });
      unitsCopied = clones.length;
    }
  }

  return NextResponse.json({ floor: newFloor, unitsCopied }, { status: 201 });
}
