// Un <input type="number"> rechaza EN SILENCIO cualquier texto pegado que no
// sea un número JS ("85 m²", "USD 150.000", "65,5") y el campo queda vacío.
// Esto lo lleva a un número válido entendiendo el formato argentino (punto
// de miles, coma decimal) y el inglés (coma de miles, punto decimal).
export function parsePastedNumber(text: string): string | null {
  // El primer número del texto — así el "2" de "m2" no se le pega.
  const match = text.match(/-?\d[\d.,]*/);
  if (!match) return null;
  const negative = match[0].startsWith('-');
  let s = match[0].replace(/-/g, '').replace(/[.,]+$/, '');
  const lastDot = s.lastIndexOf('.');
  const lastComma = s.lastIndexOf(',');
  if (lastDot >= 0 && lastComma >= 0) {
    // El separador que aparece último es el decimal.
    const dec = lastDot > lastComma ? '.' : ',';
    const thou = dec === '.' ? ',' : '.';
    s = s.split(thou).join('').replace(dec, '.');
  } else if (lastComma >= 0) {
    // Solo comas: "1,234,567" (grupos de 3) son miles; si no, coma decimal.
    s = isThousandsGrouping(s, ',') ? s.split(',').join('') : s.replace(',', '.');
  } else if (lastDot >= 0) {
    // Solo puntos: "150.000" / "1.234.567" son miles (es-AR); "65.5" decimal.
    if (isThousandsGrouping(s, '.')) s = s.split('.').join('');
  }
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return `${negative ? '-' : ''}${s.replace(/^0+(?=\d)/, '')}`;
}

function isThousandsGrouping(s: string, sep: string): boolean {
  const parts = s.split(sep);
  return parts.length > 1 && parts[0].length >= 1 && parts[0].length <= 3 && parts.slice(1).every(p => p.length === 3);
}
