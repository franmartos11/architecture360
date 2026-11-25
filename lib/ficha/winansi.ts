// La ficha PDF usa la Helvetica que trae react-pdf, que solo sabe dibujar los
// caracteres de WinAnsi (Latin-1 más comillas tipográficas, rayas, €, …). Lo
// que queda afuera (emoji, ≈, →, letras de otros alfabetos) sale como basura.
// En el repo solo hay fuentes .woff2, que react-pdf no lee, así que en vez de
// sumar una TTF se limpia el texto antes de dibujarlo: equivalente seguro si
// lo hay, la letra sin la marca si es una tilde de otro idioma, y si no se
// descarta.

// Los 27 caracteres que WinAnsi agrega en 0x80–0x9F, fuera de Latin-1.
const WIN_ANSI_EXTRA = new Set('€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ');

const isWinAnsiChar = (ch: string) => {
  const c = ch.codePointAt(0)!;
  return c === 0x09 || c === 0x0a || c === 0x0d || (c >= 0x20 && c <= 0x7e) || (c >= 0xa0 && c <= 0xff) || WIN_ANSI_EXTRA.has(ch);
};

export const isWinAnsi = (text: string) => [...text].every(isWinAnsiChar);

const REPLACEMENTS: Record<string, string> = {
  '≈': '~', '∼': '~', '≃': '~',
  '→': '->', '←': '<-', '↔': '<->', '⇒': '=>', '⇐': '<=', '➔': '->', '➜': '->',
  '≤': '<=', '≥': '>=', '≠': '!=',
  '−': '-', '‐': '-', '‑': '-', '‒': '-', '―': '—', '⁃': '-',
  '′': "'", '″': '"', '‛': "'", '‟': '"', '❛': "'", '❜': "'", '❝': '"', '❞': '"',
  '⁄': '/', '∕': '/', '∙': '·', '⋅': '·', '‧': '·', '・': '·',
  '⁰': '0', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9',
  '₀': '0', '₁': '1', '₂': '2', '₃': '3', '₄': '4', '₅': '5', '₆': '6', '₇': '7', '₈': '8', '₉': '9',
  'ł': 'l', 'Ł': 'L', 'đ': 'd', 'Đ': 'D', 'ı': 'i', 'ħ': 'h',
  '№': 'N°', '★': '*', '☆': '*', '✱': '*',
  // Espacios: el angosto que usan algunos formatos de número queda duro (no
  // separa "US$" del monto); el resto, espacio común.
  '\u202F': '\u00A0', '\u2007': '\u00A0',
  '\u2000': ' ', '\u2001': ' ', '\u2002': ' ', '\u2003': ' ', '\u2004': ' ', '\u2005': ' ',
  '\u2006': ' ', '\u2008': ' ', '\u2009': ' ', '\u200A': ' ', '\u205F': ' ', '\u3000': ' ',
  '\u2028': '\n', '\u2029': '\n',
  // Invisibles (unen emoji, marcan dirección, BOM): se sacan sin más.
  '\u200B': '', '\u200C': '', '\u200D': '', '\u2060': '', '\uFEFF': '', '\u200E': '', '\u200F': '',
};

/** Texto que Helvetica (WinAnsi) dibuja bien. */
export function toWinAnsi(text: string): string {
  let out = '';
  let dropped = false;
  for (const ch of text.normalize('NFC')) {
    if (isWinAnsiChar(ch)) { out += ch; continue; }
    if (Object.hasOwn(REPLACEMENTS, ch)) { out += REPLACEMENTS[ch]; continue; }
    // Ş, Ő, ă…: la letra base, si es dibujable.
    const base = ch.normalize('NFD').replace(/[\u0300-\u036F]/g, '');
    if (base && base !== ch && isWinAnsi(base)) { out += base; continue; }
    dropped = true;
  }
  // Un emoji entre dos palabras deja dos espacios; uno al final, uno colgando.
  return dropped ? out.replace(/[ \u00A0]{2,}/g, ' ').replace(/^ +| +$/gm, '') : out;
}
