/** Link a la ficha PDF de una unidad (uuid), con el ref de la inmobiliaria si lo hay. */
export function fichaHref(slug: string, unitDbId: string, ref: string | null): string {
  const base = `/api/ficha/${encodeURIComponent(slug)}/${encodeURIComponent(unitDbId)}`;
  return ref ? `${base}?ref=${encodeURIComponent(ref)}` : base;
}
