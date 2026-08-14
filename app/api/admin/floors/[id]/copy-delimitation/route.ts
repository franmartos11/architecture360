import { NextResponse } from 'next/server';
import { requireAdminUser } from '@/lib/supabase/require-admin';
import { createAdminClient } from '@/lib/supabase/admin';

// Copia polígono + pin de cada depto de un piso de referencia a este piso —
// para cuando los pisos ya tienen sus unidades cargadas (ej. vía CSV o uno
// por uno) pero no se usó "Duplicar piso" para heredar la geometría. Empareja
// unidades por código, remapeando el número de piso igual que el duplicado
// (ej. "A03-01" en el piso 3 calza con "A05-01" en el piso 5).
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAdminUser();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const { id: targetFloorId } = await params;
  const body = await request.json();
  if (!body.sourceFloorId) {
    return NextResponse.json({ error: 'Falta sourceFloorId' }, { status: 400 });
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
    admin.from('units').select('id, code, polygon').eq('floor_id', body.sourceFloorId),
    admin.from('units').select('id, code').eq('floor_id', targetFloorId),
  ]);
  if (sourceUnitsErr) return NextResponse.json({ error: sourceUnitsErr.message }, { status: 500 });
  if (targetUnitsErr) return NextResponse.json({ error: targetUnitsErr.message }, { status: 500 });

  const oldNumTag = String(sourceFloor.number).padStart(2, '0');
  const newNumTag = String(targetFloor.number).padStart(2, '0');
  const remapCode = (code: string) =>
    oldNumTag !== newNumTag && code.includes(oldNumTag) ? code.replace(oldNumTag, newNumTag) : code;

  const targetByCode = new Map((targetUnits ?? []).map(u => [u.code, u]));
  const sourceDots: { unitId: string; x: number; y: number; color?: string; style?: string }[] = sourceFloor.unit_dots ?? [];
  const sourceDotByCode = new Map(sourceDots.map(d => [d.unitId, d]));

  let unitsUpdated = 0;
  const nextDots = [...(targetFloor.unit_dots ?? [])];

  for (const su of sourceUnits ?? []) {
    if (!su.polygon || su.polygon.length === 0) continue;
    const expectedCode = remapCode(su.code);
    const target = targetByCode.get(expectedCode);
    if (!target) continue;

    const { error: updateErr } = await admin.from('units').update({ polygon: su.polygon }).eq('id', target.id);
    if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });
    unitsUpdated++;

    const sourceDot = sourceDotByCode.get(su.code);
    if (sourceDot) {
      const idx = nextDots.findIndex(d => d.unitId === expectedCode);
      const remappedDot = { ...sourceDot, unitId: expectedCode };
      if (idx >= 0) nextDots[idx] = remappedDot; else nextDots.push(remappedDot);
    }
  }

  if (unitsUpdated > 0) {
    const { error: floorUpdateErr } = await admin.from('floors').update({ unit_dots: nextDots }).eq('id', targetFloorId);
    if (floorUpdateErr) return NextResponse.json({ error: floorUpdateErr.message }, { status: 500 });
  }

  return NextResponse.json({ unitsUpdated });
}
