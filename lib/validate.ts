// Validación mínima de shape para los endpoints admin — no hay una lib
// como zod en el proyecto todavía, así que esto cubre lo esencial: los
// campos que tienen un `check` constraint en Postgres (status, category)
// se validan acá para devolver un error legible en vez de dejar que el
// mensaje crudo de Postgres llegue al toast del admin.
export function isValidEnum<T extends string>(value: unknown, allowed: readonly T[]): value is T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value);
}

export const UNIT_STATUSES = ['available', 'reserved', 'sold'] as const;
export const POI_CATEGORIES = ['colegio', 'salud', 'comercio', 'transporte', 'entretenimiento', 'otro'] as const;
