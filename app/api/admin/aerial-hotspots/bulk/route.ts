import { NextResponse } from 'next/server';
import { resolveProjectIdFromSlide, resolveProjectIdFromBuilding, requireProjectAccess } from '@/lib/supabase/require-project-access';
import { serverError } from '@/lib/api-errors';
import { readJsonObject, validateJson } from '@/lib/api-validate';
import { aerialHotspotBulkSchema } from '@/lib/content-schemas';

// "Guardar todo" desde /admin/proyecto/aereas/[slideId]: la pantalla ahora
// trabaja sobre todas las vistas aéreas del proyecto a la vez, así que en
// vez de mandar un POST/PATCH por edificio (como hace el endpoint singular
// de esta misma carpeta) se manda una sola tanda con todo lo pendiente.
// Hace upsert por fila (slide_id, building_id): PATCH si ya existe esa
// combinación, INSERT si no.

interface BulkItem {
  slideId: string;
  buildingId: string;
  x: number;
  y: number;
  polygon?: { x: number; y: number }[];
}

function isValidItem(item: unknown): item is BulkItem {
  if (!item || typeof item !== 'object') return false;
  const it = item as Record<string, unknown>;
  return (
    typeof it.slideId === 'string' &&
    typeof it.buildingId === 'string' &&
    typeof it.x === 'number' &&
    typeof it.y === 'number'
  );
}

export async function POST(request: Request) {
  const raw = await readJsonObject(request);
  if ('error' in raw) return raw.error;
  const rawItems: unknown[] = Array.isArray(raw.data.items) ? raw.data.items : [];
  if (rawItems.length === 0 || !rawItems.every(isValidItem)) {
    return NextResponse.json(
      { error: 'Faltan items válidos: cada uno necesita slideId, buildingId, x e y' },
      { status: 400 }
    );
  }
  // Forma y topes (hasta 200 items, polígonos de hasta 500 puntos, coordenadas acotadas).
  const parsed = validateJson({ items: rawItems }, aerialHotspotBulkSchema);
  if ('error' in parsed) return parsed.error;
  const items: BulkItem[] = parsed.data.items.map(i => ({ ...i, polygon: i.polygon ?? undefined }));

  // No confiamos en nada del body: cada slide y cada edificio mencionado
  // tiene que existir y pertenecer al MISMO proyecto (mismo chequeo que
  // hace el POST singular, pero para toda la tanda de una).
  const uniqueSlideIds = [...new Set(items.map(i => i.slideId))];
  const uniqueBuildingIds = [...new Set(items.map(i => i.buildingId))];

  const [slideProjectIds, buildingProjectIds] = await Promise.all([
    Promise.all(uniqueSlideIds.map(resolveProjectIdFromSlide)),
    Promise.all(uniqueBuildingIds.map(resolveProjectIdFromBuilding)),
  ]);

  if (slideProjectIds.some(id => !id) || buildingProjectIds.some(id => !id)) {
    return NextResponse.json({ error: 'Vista aérea o edificio no encontrado' }, { status: 404 });
  }

  const allProjectIds = new Set([...slideProjectIds, ...buildingProjectIds] as string[]);
  if (allProjectIds.size > 1) {
    return NextResponse.json(
      { error: 'Las vistas aéreas y los edificios no pertenecen todos al mismo proyecto' },
      { status: 400 }
    );
  }
  const projectId = [...allProjectIds][0];

  const access = await requireProjectAccess(projectId, { revalidate: true });
  if (!access) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const { supabase } = access;

  // Trae de una sola vez los hotspots ya guardados para las slides
  // involucradas, para saber cuáles items son PATCH y cuáles INSERT.
  const { data: existingHotspots, error: existingError } = await supabase
    .from('aerial_hotspots')
    .select('id, slide_id, building_id')
    .in('slide_id', uniqueSlideIds);
  if (existingError) return serverError(existingError);

  const existingIdByKey = new Map<string, string>();
  for (const h of (existingHotspots ?? []) as { id: string; slide_id: string; building_id: string }[]) {
    existingIdByKey.set(`${h.slide_id}:${h.building_id}`, h.id);
  }

  // Un resultado por ítem (no todo-o-nada): si uno falla en la escritura,
  // el resto de la tanda igual se guarda, y la UI puede mostrar cuál quedó
  // pendiente.
  const results = await Promise.all(
    items.map(async item => {
      const key = `${item.slideId}:${item.buildingId}`;
      const existingId = existingIdByKey.get(key);
      const payload = { x: item.x, y: item.y, polygon: item.polygon ?? null };

      const { data, error } = existingId
        ? await supabase.from('aerial_hotspots').update(payload).eq('id', existingId).select().single()
        : await supabase
            .from('aerial_hotspots')
            .insert({ slide_id: item.slideId, building_id: item.buildingId, ...payload })
            .select()
            .single();

      if (error) console.error('[aerial-hotspots/bulk] no se pudo guardar', item.slideId, item.buildingId, error);
      return {
        slideId: item.slideId,
        buildingId: item.buildingId,
        success: !error,
        data: error ? null : data,
        error: error ? 'No se pudo guardar' : null,
      };
    })
  );

  return NextResponse.json({ results });
}
