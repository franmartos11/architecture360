// Categorías sugeridas para agrupar amenities (pileta → "Aire libre", gym →
// "Bienestar", etc.) — libres, no un enum cerrado en la base: esto solo
// alimenta el datalist del editor admin para que no haya que tipear desde
// cero, pero cualquier texto libre es válido.
export const AMENITY_CATEGORY_SUGGESTIONS = [
  'Aire libre',
  'Bienestar',
  'Social',
  'Trabajo',
  'Servicios',
] as const;

/**
 * Suma los m² de las specs "Superficie" de cada amenity ("240 m²",
 * "1.200 m2", "85,5 m²"). null si ninguna trae un valor parseable, para
 * que la UI no muestre un "0 m²" engañoso.
 */
export function totalCommonArea(amenities: { specs?: { key: string; value: string }[] }[]): number | null {
  let total = 0;
  let found = false;
  for (const a of amenities) {
    const spec = a.specs?.find(s => /superficie/i.test(s.key));
    const match = spec?.value.match(/(\d[\d.]*(?:,\d+)?)\s*m/i);
    if (!match) continue;
    const n = Number(match[1].replace(/\./g, '').replace(',', '.'));
    if (!Number.isFinite(n)) continue;
    total += n;
    found = true;
  }
  return found ? Math.round(total) : null;
}

/** Centro (promedio de vértices) de un polígono en % — donde va el pin si no se ubicó a mano. */
export function polygonCenter(points: { x: number; y: number }[]): { x: number; y: number } {
  const x = points.reduce((s, p) => s + p.x, 0) / points.length;
  const y = points.reduce((s, p) => s + p.y, 0) / points.length;
  return { x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100 };
}
