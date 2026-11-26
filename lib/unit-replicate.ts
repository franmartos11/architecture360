import type { UnitRow } from '@/types/database';

export type ReplicateGroup = 'design' | 'media' | 'tour' | 'specs';

export const REPLICATE_GROUPS: { id: ReplicateGroup; label: string; cols: readonly (keyof UnitRow)[] }[] = [
  {
    id: 'design',
    label: 'Plano de ambientes y plantas',
    cols: ['room_plan_image', 'rooms', 'levels', 'floors_count'],
  },
  {
    id: 'media',
    label: 'Fotos y planos',
    cols: ['interior_image_url', 'gallery_images', 'floor_plan_3d_url', 'plan_3d_url', 'technical_plan_url'],
  },
  {
    id: 'tour',
    label: 'Recorrido 360°',
    cols: ['tour_data', 'tour_image_url'],
  },
  {
    id: 'specs',
    label: 'Datos y superficies',
    cols: [
      'model_name', 'type', 'category',
      'total_area', 'inner_area', 'balcony_area', 'external_area',
      'bedrooms', 'bathrooms', 'has_service_room', 'lot_size', 'ceiling_height',
      'garage_spaces', 'garage_type', 'garage_covered', 'garage_uncovered',
      'condition', 'features', 'living_rooms', 'kitchens',
      'other_rooms_count', 'other_rooms_description', 'hoa_fee', 'orientation',
    ],
  },
];

/**
 * Arma el payload de UPDATE en Postgres copiando solo los grupos elegidos desde `source`.
 * Nunca incluye `id`, `floor_id`, `code`, `status`, `price`, `currency`, `polygon` ni `parking_spots`.
 */
export function buildReplicationPayload(
  source: Partial<UnitRow>,
  groups: readonly ReplicateGroup[],
): Record<string, unknown> {
  const chosen = new Set(groups);
  const payload: Record<string, unknown> = {};
  for (const group of REPLICATE_GROUPS) {
    if (!chosen.has(group.id)) continue;
    for (const col of group.cols) {
      if (source[col] !== undefined) {
        payload[col] = source[col];
      }
    }
  }
  return payload;
}

export interface ReplicateCandidate {
  id: string;
  code: string;
  model_name?: string | null;
  type?: string | null;
  category?: string | null;
  building_id?: string | null;
  building_name?: string | null;
  floor_number?: number | null;
}

/** Unidades que comparten la misma tipología/modelo que `source`. */
export function sameTypologyCandidates<T extends ReplicateCandidate>(
  source: Pick<ReplicateCandidate, 'id' | 'model_name' | 'type' | 'category'>,
  others: readonly T[],
): T[] {
  const model = source.model_name?.trim().toLowerCase();
  if (model) {
    return others.filter(u => u.id !== source.id && u.model_name?.trim().toLowerCase() === model);
  }
  const type = source.type?.trim().toLowerCase();
  if (!type) return [];
  const cat = source.category ?? 'vivienda';
  return others.filter(
    u => u.id !== source.id && u.type?.trim().toLowerCase() === type && (u.category ?? 'vivienda') === cat,
  );
}

/**
 * Unidades en la misma columna de pisos dentro del mismo edificio
 * (ej. `1A` -> `2A, 3A, 4A`; o `101` -> `201, 301`).
 */
export function sameColumnCandidates<T extends ReplicateCandidate>(
  source: Pick<ReplicateCandidate, 'id' | 'code' | 'building_id'>,
  others: readonly T[],
): T[] {
  const letterMatch = /^\d+([A-Za-z]+)$/.exec(source.code.trim());
  const numMatch = !letterMatch ? /^\d+?(\d{2})$/.exec(source.code.trim()) : null;
  const suffix = letterMatch?.[1]?.toLowerCase() ?? numMatch?.[1] ?? null;
  if (!suffix) return [];

  return others.filter(u => {
    if (u.id === source.id) return false;
    if (source.building_id && u.building_id && u.building_id !== source.building_id) return false;
    const code = u.code.trim();
    if (letterMatch) {
      const m = /^\d+([A-Za-z]+)$/.exec(code);
      return m?.[1]?.toLowerCase() === suffix;
    }
    const m = /^\d+?(\d{2})$/.exec(code);
    return m?.[1] === suffix;
  });
}

/** Qué grupos tiene efectivamente cargados `unit` para preseleccionar en la UI. */
export function defaultReplicateGroups(unit: Partial<UnitRow>): ReplicateGroup[] {
  const out: ReplicateGroup[] = [];
  const hasDesign =
    !!unit.room_plan_image ||
    (Array.isArray(unit.rooms) && unit.rooms.length > 0) ||
    (Array.isArray(unit.levels) && unit.levels.some(l => l.planImage || l.rooms?.length));
  const hasMedia =
    !!unit.interior_image_url ||
    (Array.isArray(unit.gallery_images) && unit.gallery_images.length > 0) ||
    !!unit.floor_plan_3d_url ||
    !!unit.plan_3d_url ||
    !!unit.technical_plan_url;
  const hasTour =
    !!unit.tour_image_url ||
    (Array.isArray(unit.tour_data?.nodes) && unit.tour_data.nodes.length > 0);
  if (hasDesign) out.push('design');
  if (hasMedia) out.push('media');
  if (hasTour) out.push('tour');
  return out;
}
