import { NextResponse } from 'next/server';
import { resolveProjectIdFromFloor, requireProjectAccess } from '@/lib/supabase/require-project-access';
import { sanitizeText } from '@/lib/sanitize';

// Duplica un piso entero: clona cada unidad del piso de origen —incluyendo
// polígono, ambientes, tour 360° y fotos— porque cuando el layout se repite,
// esa geometría suele calzar pixel a pixel en el piso destino, y le pasa
// también el plano (en la mayoría de los edificios los pisos repetidos
// comparten la misma imagen).
//
// El destino puede no existir todavía (se crea) o ya existir con ese número
// — que es lo normal, porque el wizard auto-crea Piso 1..N al dar de alta el
// edificio. En ese caso se COMPLETA el piso que ya está en vez de fallar
// contra el único (building_id, number), y se completa sin pisar: el plano,
// el tipo y las unidades que el admin ya cargó a mano se respetan.
//
// El código de cada unidad se intenta re-numerar reemplazando el número
// de piso de origen por el nuevo (ej. "A01-01" → "A02-01"); si no lo
// encuentra en el código, lo deja igual (el admin lo ajusta a mano).
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: sourceFloorId } = await params;
  const projectId = await resolveProjectIdFromFloor(sourceFloorId);
  if (!projectId) return NextResponse.json({ error: 'Piso de origen no encontrado' }, { status: 404 });

  const access = await requireProjectAccess(projectId, { revalidate: true });
  if (!access) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const { supabase } = access;

  const body = await request.json();
  if (body.number === undefined || !body.label || typeof body.label !== 'string') {
    return NextResponse.json({ error: 'Faltan number y/o label para el piso nuevo' }, { status: 400 });
  }
  const label = sanitizeText(body.label, 100);

  const { data: sourceFloor, error: floorErr } = await supabase
    .from('floors')
    .select('*')
    .eq('id', sourceFloorId)
    .maybeSingle();
  if (floorErr) return NextResponse.json({ error: floorErr.message }, { status: 500 });
  if (!sourceFloor) return NextResponse.json({ error: 'Piso de origen no encontrado' }, { status: 404 });

  const { data: existingFloor, error: existingErr } = await supabase
    .from('floors')
    .select('*')
    .eq('building_id', sourceFloor.building_id)
    .eq('number', body.number)
    .maybeSingle();
  if (existingErr) return NextResponse.json({ error: existingErr.message }, { status: 500 });
  if (existingFloor?.id === sourceFloorId) {
    return NextResponse.json({ error: `El piso de origen ya es el número ${body.number}` }, { status: 400 });
  }

  const includeUnits = body.includeUnits !== false;

  const oldNumTag = String(sourceFloor.number).padStart(2, '0');
  const newNumTag = String(body.number).padStart(2, '0');
  const remapCode = (code: string) =>
    oldNumTag !== newNumTag && code.includes(oldNumTag) ? code.replace(oldNumTag, newNumTag) : code;

  const cloneUnit = (u: Record<string, unknown>, floorId: string) => ({
    floor_id: floorId,
    code: remapCode(u.code as string),
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
  });

  const sourceDots: { unitId: string; x: number; y: number; color?: string; style?: string }[] = sourceFloor.unit_dots ?? [];
  const remappedDots = includeUnits ? sourceDots.map(d => ({ ...d, unitId: remapCode(d.unitId) })) : [];

  if (!existingFloor) {
    const { data: newFloor, error: newFloorErr } = await supabase
      .from('floors')
      .insert({
        building_id: sourceFloor.building_id,
        number: body.number,
        label,
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
        const clones = sourceUnits.map(u => cloneUnit(u, newFloor.id));
        const { error: insertErr } = await supabase.from('units').insert(clones);
        if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 });
        unitsCopied = clones.length;
      }
    }

    return NextResponse.json({ floor: newFloor, unitsCopied, skipped: 0, mode: 'created' }, { status: 201 });
  }

  // El piso destino ya existe: lo completamos. Las unidades cuyo código ya
  // está en el destino se saltean —igual que en /apply-template— para no
  // pisar lo que se cargó a mano.
  let unitsCopied = 0;
  let skipped = 0;
  let clonedCodes = new Set<string>();
  if (includeUnits) {
    const [{ data: sourceUnits, error: sourceUnitsErr }, { data: targetUnits, error: targetUnitsErr }] = await Promise.all([
      supabase.from('units').select('*').eq('floor_id', sourceFloorId),
      supabase.from('units').select('code').eq('floor_id', existingFloor.id),
    ]);
    if (sourceUnitsErr) return NextResponse.json({ error: sourceUnitsErr.message }, { status: 500 });
    if (targetUnitsErr) return NextResponse.json({ error: targetUnitsErr.message }, { status: 500 });

    const existingCodes = new Set((targetUnits ?? []).map(u => u.code));
    const toClone = (sourceUnits ?? []).filter(u => !existingCodes.has(remapCode(u.code)));
    skipped = (sourceUnits?.length ?? 0) - toClone.length;

    if (toClone.length > 0) {
      const clones = toClone.map(u => cloneUnit(u, existingFloor.id));
      const { error: insertErr } = await supabase.from('units').insert(clones);
      if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 });
      unitsCopied = clones.length;
      clonedCodes = new Set(clones.map(c => c.code));
    }
  }

  // La etiqueta sí se reemplaza: el patrón es un campo explícito del diálogo.
  // El plano y el tipo solo se completan si el destino los tiene vacíos.
  const updates: Record<string, unknown> = { label };
  if (!existingFloor.plan_image && sourceFloor.plan_image) updates.plan_image = sourceFloor.plan_image;
  if (existingFloor.floor_kind === 'units' && sourceFloor.floor_kind !== 'units') updates.floor_kind = sourceFloor.floor_kind;
  if (!existingFloor.floor_kind_description && sourceFloor.floor_kind_description) {
    updates.floor_kind_description = sourceFloor.floor_kind_description;
  }

  const newDots = remappedDots.filter(d => clonedCodes.has(d.unitId));
  if (newDots.length > 0) {
    const existingDots: typeof sourceDots = existingFloor.unit_dots ?? [];
    updates.unit_dots = [...existingDots.filter(d => !clonedCodes.has(d.unitId)), ...newDots];
  }

  const { data: filledFloor, error: updateErr } = await supabase
    .from('floors')
    .update(updates)
    .eq('id', existingFloor.id)
    .select()
    .single();
  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

  return NextResponse.json({ floor: filledFloor, unitsCopied, skipped, mode: 'filled' });
}
