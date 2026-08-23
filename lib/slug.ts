import type { SupabaseClient } from '@supabase/supabase-js';

// Fuente única para convertir texto libre en un slug de URL — antes había
// 4 copias casi idénticas (proyectos, portfolio, TourEditor, UnitRoomsEditor)
// con calidad dispareja.
export function slugify(text: string): string {
  return text
    .normalize('NFD')
    .replace(new RegExp('[\\u0300-\\u036f]', 'g'), '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

interface EnsureUniqueSlugOptions {
  table: string;
  column: string;
  base: string;
  /** Restringe la unicidad a un subconjunto (ej. slug único por proyecto, no global). */
  scope?: { column: string; value: string };
}

// Genera el primer slug libre a partir de `base`: "torre-del-mar",
// "torre-del-mar-2", "torre-del-mar-3"... Consulta la tabla real (a
// diferencia de un Set en memoria) para que la unicidad sea contra la
// base, no contra lo que haya cargado el cliente hasta ahora.
export async function ensureUniqueSlug(supabase: SupabaseClient, { table, column, base, scope }: EnsureUniqueSlugOptions): Promise<string> {
  const safeBase = base || 'sin-nombre';

  let query = supabase.from(table).select(column).like(column, `${safeBase}%`);
  if (scope) query = query.eq(scope.column, scope.value);

  const { data, error } = await query;
  if (error) throw error;

  const rows = (data ?? []) as unknown as Record<string, string>[];
  const taken = new Set(rows.map(row => row[column]));
  if (!taken.has(safeBase)) return safeBase;

  let n = 2;
  while (taken.has(`${safeBase}-${n}`)) n++;
  return `${safeBase}-${n}`;
}
