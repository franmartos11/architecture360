import type { UnitRow as DbUnitRow } from '@/types/database';
import type { UnitStatus, UnitType, TourData } from '@/types';

// Forma canónica en camelCase de los campos editables de una unidad —
// puente entre la fila snake_case que devuelve Supabase y los componentes
// de grupo (components/admin/unit-groups/*), que no conocen la forma de
// la tabla. bedrooms/bathrooms quedan `number | null` (no `number`, aunque
// así está tipada la columna) porque el form permite vaciar el input y
// mandar null en el PATCH — comportamiento preexistente, no un campo nuevo.
export interface UnitFormValues {
  code: string;
  totalArea: number | null;
  modelName: string | null;
  type: UnitType;
  bedrooms: number | null;
  bathrooms: number | null;
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
