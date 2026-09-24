import { NextResponse } from 'next/server';
import { requireProjectAccess, resolveRequestedProjectId } from '@/lib/supabase/require-project-access';
import { isValidEnum, UNIT_STATUSES } from '@/lib/validate';
import type { UnitStatus } from '@/types';

// Techo generoso (ningún proyecto real se acerca) para no dejar la
// operación abierta a un body arbitrariamente grande.
const MAX_IDS = 500;

interface PriceAdjustment {
  mode: 'pct' | 'fixed';
  sign: 'increase' | 'decrease';
  amount: number;
}

function isValidPriceAdjustment(v: unknown): v is PriceAdjustment {
  if (!v || typeof v !== 'object') return false;
  const a = v as Record<string, unknown>;
  return (
    (a.mode === 'pct' || a.mode === 'fixed') &&
    (a.sign === 'increase' || a.sign === 'decrease') &&
    typeof a.amount === 'number' && a.amount > 0
  );
}

/**
 * Cambio de estado o de precio sobre un lote de unidades, en un solo pedido.
 *
 * Antes esto lo hacía el cliente: un fetch PATCH por unidad seleccionada, en
 * paralelo. Con más de 120 unidades (el límite de admin-write en proxy.ts,
 * pensado para una escritura por vez, no para un fan-out de cientos) el resto
 * se perdía en silencio — el toast decía igual "actualizado" sin distinguir
 * cuántas realmente se guardaron. Acá el fan-out sigue existiendo (son N
 * updates a Supabase), pero pasa DENTRO de un único request HTTP, así que
 * cuenta una sola vez contra ese límite y se puede reportar qué unidad falló
 * y por qué.
 *
 * El precio nuevo de cada unidad se calcula acá, con el precio que hay en la
 * base en este momento — no con el que el navegador tenía en pantalla, que
 * pudo quedar viejo si alguien más editó esa unidad mientras tanto.
 */
export async function PATCH(request: Request) {
  const body = await request.json();
  const ids: unknown = body?.ids;
  if (!Array.isArray(ids) || ids.length === 0 || !ids.every(id => typeof id === 'string')) {
    return NextResponse.json({ error: 'Falta ids: un array de ids de unidades' }, { status: 400 });
  }
  if (ids.length > MAX_IDS) {
    return NextResponse.json({ error: `No se puede editar más de ${MAX_IDS} unidades por vez.` }, { status: 400 });
  }

  const hasStatus = body.status !== undefined;
  const hasPriceAdjustment = body.priceAdjustment !== undefined;
  if (hasStatus === hasPriceAdjustment) {
    // Ni las dos ni ninguna: cada llamada hace UNA cosa (mismo criterio que
    // la UI, que ofrece "cambiar estado" y "ajustar precio" por separado).
    return NextResponse.json({ error: 'Mandá status o priceAdjustment, no ninguno ni los dos' }, { status: 400 });
  }
  if (hasStatus && !isValidEnum(body.status, UNIT_STATUSES)) {
    return NextResponse.json({ error: `status debe ser uno de: ${UNIT_STATUSES.join(', ')}` }, { status: 400 });
  }
  if (hasPriceAdjustment && !isValidPriceAdjustment(body.priceAdjustment)) {
    return NextResponse.json({ error: 'priceAdjustment inválido: { mode, sign, amount }' }, { status: 400 });
  }

  const projectId = await resolveRequestedProjectId(request);
  if (!projectId) return NextResponse.json({ error: 'Proyecto no encontrado' }, { status: 404 });
  const access = await requireProjectAccess(projectId, { revalidate: true });
  if (!access) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const { supabase } = access;

  // No confiar en que los ids que mandó el cliente sean del proyecto activo:
  // sin este cruce, cualquiera con sesión en un proyecto propio podría
  // pasar ids de unidades de OTRO proyecto (el suyo o no) y editarlas.
  const { data: buildings } = await supabase.from('buildings').select('id').eq('project_id', projectId);
  const buildingIds = (buildings ?? []).map(b => b.id as string);
  const { data: floors } = buildingIds.length
    ? await supabase.from('floors').select('id').in('building_id', buildingIds)
    : { data: [] };
  const floorIds = new Set((floors ?? []).map(f => f.id as string));

  const { data: unitRows, error: fetchError } = floorIds.size
    ? await supabase.from('units').select('id, floor_id, price').in('id', ids)
    : { data: [], error: null };
  if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 });

  const ownUnits = ((unitRows ?? []) as { id: string; floor_id: string; price: number | null }[])
    .filter(u => floorIds.has(u.floor_id));
  const ownIds = new Set(ownUnits.map(u => u.id));

  const skipped: { id: string; reason: string }[] = ids
    .filter(id => !ownIds.has(id))
    .map(id => ({ id, reason: 'No pertenece a este proyecto' }));

  if (hasStatus) {
    const targetIds = [...ownIds];
    if (targetIds.length === 0) return NextResponse.json({ updated: [], skipped });

    const { data: updated, error } = await supabase
      .from('units')
      .update({ status: body.status as UnitStatus, updated_at: new Date().toISOString() })
      .in('id', targetIds)
      .select('id');
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const updatedIds = new Set((updated ?? []).map(u => (u as { id: string }).id));
    for (const id of targetIds) {
      if (!updatedIds.has(id)) skipped.push({ id, reason: 'No se pudo actualizar' });
    }
    return NextResponse.json({ updated: [...updatedIds], skipped });
  }

  // Ajuste de precio: cada unidad termina en un valor distinto (según el
  // suyo propio), así que no hay un único UPDATE que sirva para todas —
  // sigue siendo una escritura por unidad, pero las N corren en paralelo
  // adentro de este mismo request en vez de ser N requests del navegador.
  const { mode, sign, amount } = body.priceAdjustment as PriceAdjustment;
  const withPrice = ownUnits.filter(u => u.price != null);
  for (const u of ownUnits) {
    if (u.price == null) skipped.push({ id: u.id, reason: 'Sin precio cargado' });
  }

  const results = await Promise.all(withPrice.map(async u => {
    const current = u.price as number;
    const delta = mode === 'pct' ? Math.round(current * (amount / 100)) : amount;
    const newPrice = Math.max(0, sign === 'increase' ? current + delta : current - delta);
    const { error } = await supabase
      .from('units')
      .update({ price: newPrice, updated_at: new Date().toISOString() })
      .eq('id', u.id);
    return { id: u.id, price: newPrice, ok: !error, error: error?.message };
  }));

  const updated = results.filter(r => r.ok).map(r => ({ id: r.id, price: r.price }));
  for (const r of results) {
    if (!r.ok) skipped.push({ id: r.id, reason: r.error ?? 'No se pudo actualizar' });
  }

  return NextResponse.json({ updated, skipped });
}
