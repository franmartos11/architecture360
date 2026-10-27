import type { UnitRow as DbUnitRow } from '@/types/database';
import type { UnitStatus, UnitType, UnitCategory, TourData } from '@/types';

// Forma canónica en camelCase de los campos editables de una unidad —
// puente entre la fila snake_case que devuelve Supabase y los componentes
// de grupo (components/admin/unit-groups/*), que no conocen la forma de
// la tabla. bedrooms/bathrooms son `number` (columnas NOT NULL): el form
// guarda 0 al vaciar el input, nunca null (ver DatosGroup).
export interface UnitFormValues {
  code: string;
  totalArea: number | null;
  modelName: string | null;
  type: UnitType;
  category: UnitCategory;
  bedrooms: number;
  bathrooms: number;
  hasServiceRoom: boolean;
  orientation: string | null;
  innerArea: number | null;
  balconyArea: number;
  externalArea: number;
  price: number | null;
  currency: string;
  status: UnitStatus;
  interiorImageUrl: string | null;
  galleryImages: string[];
  floorPlan3dUrl: string | null;
  plan3dUrl: string | null;
  technicalPlanUrl: string | null;
  tourData: TourData | null;
}

export function toFormValues(row: DbUnitRow): UnitFormValues {
  return {
    code: row.code,
    totalArea: row.total_area,
    modelName: row.model_name,
    type: row.type,
    // Base sin la columna todavía → vivienda (y como solo viaja en el
    // PATCH cuando se cambia, no rompe el guardado del resto).
    category: row.category ?? 'vivienda',
    bedrooms: row.bedrooms,
    bathrooms: row.bathrooms,
    hasServiceRoom: row.has_service_room,
    orientation: row.orientation,
    innerArea: row.inner_area,
    balconyArea: row.balcony_area,
    externalArea: row.external_area,
    price: row.price,
    currency: row.currency,
    status: row.status,
    interiorImageUrl: row.interior_image_url,
    galleryImages: row.gallery_images,
    floorPlan3dUrl: row.floor_plan_3d_url,
    plan3dUrl: row.plan_3d_url,
    technicalPlanUrl: row.technical_plan_url,
    tourData: row.tour_data,
  };
}

const FIELD_TO_COLUMN: Record<keyof UnitFormValues, keyof DbUnitRow> = {
  code: 'code',
  totalArea: 'total_area',
  modelName: 'model_name',
  type: 'type',
  category: 'category',
  bedrooms: 'bedrooms',
  bathrooms: 'bathrooms',
  hasServiceRoom: 'has_service_room',
  orientation: 'orientation',
  innerArea: 'inner_area',
  balconyArea: 'balcony_area',
  externalArea: 'external_area',
  price: 'price',
  currency: 'currency',
  status: 'status',
  interiorImageUrl: 'interior_image_url',
  galleryImages: 'gallery_images',
  floorPlan3dUrl: 'floor_plan_3d_url',
  plan3dUrl: 'plan_3d_url',
  technicalPlanUrl: 'technical_plan_url',
  tourData: 'tour_data',
};

// Traduce un patch en camelCase (lo que manda un grupo por onChange, y lo
// que ya acepta el PATCH de /api/admin/units/[id]) a las columnas
// snake_case de la fila — para el merge optimista del estado local.
export function toDbShape(patch: Partial<UnitFormValues>): Partial<DbUnitRow> {
  const out: Partial<DbUnitRow> = {};
  for (const [key, value] of Object.entries(patch)) {
    const column = FIELD_TO_COLUMN[key as keyof UnitFormValues];
    if (column) (out as Record<string, unknown>)[column] = value;
  }
  return out;
}

// Props comunes a todos los componentes de grupo de campos
// (components/admin/unit-groups/*Group.tsx) — no saben si onChange termina
// en un PATCH optimista (shell) o en un borrador local (wizard, fase 2).
export interface UnitGroupProps {
  values: UnitFormValues;
  onChange: (patch: Partial<UnitFormValues>) => void;
}

export type CountInputChange =
  | { action: 'skip' }
  | { action: 'restore' }
  | { action: 'save'; value: number };

// Para el onBlur de Dormitorios/Baños (columnas NOT NULL): vacío guarda 0.
// En type="number" el browser reporta value === '' para texto imposible
// ("2e"); con badInput no se confunde con "vacío": se restaura el valor
// guardado. Pura: el que llama escribe el DOM en 'restore'.
export function countInputChange(
  input: { value: string; badInput: boolean },
  stored: number,
  opts: { integer: boolean },
): CountInputChange {
  if (input.badInput) return { action: 'restore' };
  if (input.value.trim() === '') return stored === 0 ? { action: 'skip' } : { action: 'save', value: 0 };
  const v = Number(input.value);
  if (!Number.isFinite(v) || v < 0) return { action: 'restore' };
  if (opts.integer && !Number.isInteger(v)) return { action: 'restore' };
  return v === stored ? { action: 'skip' } : { action: 'save', value: v };
}

// Nombres de los 3 planos de una unidad, tal como los usa el sitio público
// (Planta3DTab, PlanoTab, ComparePaneContent). Una sola fuente para que la
// solapa "Planos" y el editor del wizard no los llamen distinto.
export const UNIT_PLAN_FIELDS: readonly {
  key: 'floorPlan3dUrl' | 'plan3dUrl' | 'technicalPlanUrl';
  label: string;
  hint: string;
}[] = [
  { key: 'floorPlan3dUrl', label: 'Planta 3D (render)', hint: 'Se muestra en la solapa "Planta 3D" de la unidad.' },
  { key: 'plan3dUrl', label: 'Plano técnico 3D', hint: 'Esquema 3D de la planta; se usa si no hay plano 2D.' },
  { key: 'technicalPlanUrl', label: 'Plano técnico 2D', hint: 'Plano con cotas y rótulos. Si no cargás plano de ambientes, es la base de la solapa "Plano".' },
];
