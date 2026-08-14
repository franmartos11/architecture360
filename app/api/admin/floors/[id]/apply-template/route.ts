import { NextResponse } from 'next/server';
import { requireAdminUser } from '@/lib/supabase/require-admin';
import { createAdminClient } from '@/lib/supabase/admin';

// Aplica el "piso tipo" de un piso de referencia a OTRO piso que ya existe
// (a diferencia de /duplicate, que siempre crea un piso nuevo) — para
// cuando el piso destino ya se creó (ej. desde el wizard, con su propio
// plano) pero todavía no tiene unidades. Clona cada unidad del piso de
// origen —código remapeado, polígono, ambientes, tour y pines incluidos—
// salvo que ya exista una unidad con ese código en el piso destino, en
// cuyo caso esa se salta para no pisar datos cargados a mano.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAdminUser();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const { id: targetFloorId } = await params;
  const body = await request.json();
  if (!body.sourceFloorId) {
    return NextResponse.json({ error: 'Falta sourceFloorId' }, { status: 400 });
  }
  if (body.sourceFloorId === targetFloorId) {
    return NextResponse.json({ error: 'El piso de origen y destino no pueden ser el mismo' }, { status: 400 });
  }

  const admin = createAdminClient();

  const [{ data: sourceFloor, error: sourceErr }, { data: targetFloor, error: targetErr }] = await Promise.all([
    admin.from('floors').select('*').eq('id', body.sourceFloorId).maybeSingle(),
    admin.from('floors').select('*').eq('id', targetFloorId).maybeSingle(),
  ]);
  if (sourceErr) return NextResponse.json({ error: sourceErr.message }, { status: 500 });
  if (targetErr) return NextResponse.json({ error: targetErr.message }, { status: 500 });
  if (!sourceFloor || !targetFloor) return NextResponse.json({ error: 'Piso no encontrado' }, { status: 404 });

  const [{ data: sourceUnits, error: sourceUnitsErr }, { data: targetUnits, error: targetUnitsErr }] = await Promise.all([
    admin.from('units').select('*').eq('floor_id', body.sourceFloorId),
    admin.from('units').select('code').eq('floor_id', targetFloorId),
  ]);
  if (sourceUnitsErr) return NextResponse.json({ error: sourceUnitsErr.message }, { status: 500 });
  if (targetUnitsErr) return NextResponse.json({ error: targetUnitsErr.message }, { status: 500 });

  const oldNumTag = String(sourceFloor.number).padStart(2, '0');
  const newNumTag = String(targetFloor.number).padStart(2, '0');
  const remapCode = (code: string) =>
    oldNumTag !== newNumTag && code.includes(oldNumTag) ? code.replace(oldNumTag, newNumTag) : code;

  const existingCodes = new Set((targetUnits ?? []).map(u => u.code));
  const toClone = (sourceUnits ?? []).filter(u => !existingCodes.has(remapCode(u.code)));
  const skipped = (sourceUnits?.length ?? 0) - toClone.length;

  let unitsCreated = 0;
  if (toClone.length > 0) {
    const clones = toClone.map(u => ({
      floor_id: targetFloorId,
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
    const { error: insertErr } = await admin.from('units').insert(clones);
    if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 });
    unitsCreated = clones.length;
  }

  const sourceDots: { unitId: string; x: number; y: number; color?: string; style?: string }[] = sourceFloor.unit_dots ?? [];
  const clonedCodes = new Set(toClone.map(u => remapCode(u.code)));
  const remappedDots = sourceDots
    .map(d => ({ ...d, unitId: remapCode(d.unitId) }))
    .filter(d => clonedCodes.has(d.unitId));
  if (remappedDots.length > 0) {
    const existingDots: typeof sourceDots = targetFloor.unit_dots ?? [];
    const nextDots = [...existingDots.filter(d => !clonedCodes.has(d.unitId)), ...remappedDots];
    const { error: floorUpdateErr } = await admin.from('floors').update({ unit_dots: nextDots }).eq('id', targetFloorId);
    if (floorUpdateErr) return NextResponse.json({ error: floorUpdateErr.message }, { status: 500 });
  }

  return NextResponse.json({ unitsCreated, skipped });
}
