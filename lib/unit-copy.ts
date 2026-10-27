// "Copiar datos de otra unidad": completa lo que falta, nunca pisa lo que
// ya se cargó a mano (mismo criterio que duplicar/clonar pisos). Un campo
// en su default de alta cuenta como vacío. Código y estado no se copian
// nunca: el código es único y el estado es de ESTA unidad (copiar de una
// vendida no tiene que marcar esta como vendida).

export type FillResult<T> = { next: T; filled: (keyof T)[]; kept: (keyof T)[] };

export function fillMissing<T extends Record<string, unknown>>(
  target: T,
  source: Partial<T>,
  isEmpty: (key: keyof T, value: unknown, target: T) => boolean,
  keys: (keyof T)[] = Object.keys(source) as (keyof T)[],
): FillResult<T> {
  const next = { ...target };
  const filled: (keyof T)[] = [];
  const kept: (keyof T)[] = [];
  for (const k of keys) {
    const src = source[k];
    if (src === undefined || isEmpty(k, src, target)) continue;
    if (isEmpty(k, target[k], target)) {
      next[k] = src as T[keyof T];
      filled.push(k);
    } else if (JSON.stringify(target[k]) !== JSON.stringify(src)) {
      kept.push(k);
    }
  }
  return { next, filled, kept };
}

// Columnas copiables de `units` → clave del PATCH /api/admin/units/[id] y
// etiqueta para contarle al usuario qué se completa. Sin code/status, ni
// lo que depende de la posición en el plano (polígono, cocheras marcadas,
// ambientes/tour: eso lo copia "Copiar diseño" en Ambientes).
export const UNIT_COPY_FIELDS = [
  { col: 'model_name', key: 'modelName', label: 'Modelo' },
  { col: 'category', key: 'category', label: 'Categoría' },
  { col: 'type', key: 'type', label: 'Tipología' },
  { col: 'total_area', key: 'totalArea', label: 'Superficie total' },
  { col: 'inner_area', key: 'innerArea', label: 'Superficie cubierta' },
  { col: 'balcony_area', key: 'balconyArea', label: 'Superficie de balcón' },
  { col: 'external_area', key: 'externalArea', label: 'Superficie exterior' },
  { col: 'bedrooms', key: 'bedrooms', label: 'Dormitorios' },
  { col: 'bathrooms', key: 'bathrooms', label: 'Baños' },
  { col: 'has_service_room', key: 'hasServiceRoom', label: 'Cuarto de servicio' },
  { col: 'lot_size', key: 'lotSize', label: 'Terreno' },
  { col: 'ceiling_height', key: 'ceilingHeight', label: 'Altura de techo' },
  { col: 'garage_spaces', key: 'garageSpaces', label: 'Cocheras' },
  { col: 'garage_type', key: 'garageType', label: 'Tipo de cochera' },
  { col: 'garage_covered', key: 'garageCovered', label: 'Cocheras cubiertas' },
  { col: 'garage_uncovered', key: 'garageUncovered', label: 'Cocheras descubiertas' },
  { col: 'condition', key: 'condition', label: 'Estado de la obra' },
  { col: 'features', key: 'features', label: 'Características' },
  { col: 'living_rooms', key: 'livingRooms', label: 'Livings' },
  { col: 'kitchens', key: 'kitchens', label: 'Cocinas' },
  { col: 'other_rooms_count', key: 'otherRoomsCount', label: 'Otros ambientes' },
  { col: 'other_rooms_description', key: 'otherRoomsDescription', label: 'Detalle de otros ambientes' },
  { col: 'hoa_fee', key: 'hoaFee', label: 'Expensas' },
  { col: 'floors_count', key: 'floorsCount', label: 'Cantidad de plantas' },
  { col: 'price', key: 'price', label: 'Precio' },
  { col: 'currency', key: 'currency', label: 'Moneda' },
  { col: 'orientation', key: 'orientation', label: 'Orientación' },
  { col: 'interior_image_url', key: 'interiorImageUrl', label: 'Imagen principal' },
  { col: 'gallery_images', key: 'galleryImages', label: 'Galería' },
  { col: 'floor_plan_3d_url', key: 'floorPlan3dUrl', label: 'Planta 3D' },
  { col: 'plan_3d_url', key: 'plan3dUrl', label: 'Plano 3D' },
  { col: 'technical_plan_url', key: 'technicalPlanUrl', label: 'Plano técnico' },
] as const;

// Defaults de alta de la tabla `units` (supabase/schema.sql) — un valor
// así no lo cargó nadie a mano.
const UNIT_COLUMN_DEFAULTS: Record<string, unknown> = {
  balcony_area: 0, external_area: 0, bedrooms: 0, bathrooms: 1, has_service_room: false,
  garage_spaces: 0, garage_covered: 0, garage_uncovered: 0, living_rooms: 1, kitchens: 1,
  other_rooms_count: 0, floors_count: 1, currency: 'USD', category: 'vivienda', total_area: 0, inner_area: 0, price: 0,
};

// Tipología con la que el server da de alta una unidad sin datos
// (api/admin/buildings, provision-structure).
const DEFAULT_UNIT_TYPE = '2 dormitorios';

export function isUnitColumnEmpty(col: string, value: unknown, row: Record<string, unknown>): boolean {
  if (value == null || value === '') return true;
  if (Array.isArray(value)) return value.length === 0;
  // La tipología de alta solo es "vacía" si los dormitorios tampoco se
  // tocaron — si no, es un 2 dormitorios de verdad.
  if (col === 'type') return value === DEFAULT_UNIT_TYPE && isUnitColumnEmpty('bedrooms', row.bedrooms, row);
  return col in UNIT_COLUMN_DEFAULTS && UNIT_COLUMN_DEFAULTS[col] === value;
}

export function unitCopyPatch(target: Record<string, unknown>, source: Record<string, unknown>) {
  const cols = UNIT_COPY_FIELDS.map(f => f.col as string);
  const { filled, kept } = fillMissing(target, source, (col, v, row) => isUnitColumnEmpty(col as string, v, row), cols);
  const byCol = Object.fromEntries(UNIT_COPY_FIELDS.map(f => [f.col, f]));
  const patch: Record<string, unknown> = {};
  for (const col of filled) patch[byCol[col as string].key] = source[col as string];
  return {
    patch,
    filledLabels: filled.map(c => byCol[c as string].label),
    keptLabels: kept.map(c => byCol[c as string].label),
  };
}
