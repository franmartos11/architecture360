// Encabezado de la ficha PDF: nombre del proyecto a la izquierda, unidad y
// estado a la derecha. react-pdf no achica la letra solo, así que un nombre
// largo crecía hacia abajo (y la columna de la unidad, sin tope, le comía el
// ancho) hasta empujar la ficha a una segunda hoja. Acá se decide de antemano
// tamaño de letra y ancho de cada columna midiendo con las métricas de
// Helvetica-Bold: máximo 2 renglones, achicando la letra y, si ni así entra,
// cortando en una palabra con "…".

/** Ancho útil de la hoja: A4 (595.28 pt) menos los márgenes de 36 pt. */
export const HEADER_WIDTH = 595.28 - 36 * 2;
/** Separación entre las dos columnas (paddingRight de la izquierda). */
export const HEADER_GAP = 12;
const RIGHT_MAX = HEADER_WIDTH * 0.4;
const MAX_LINES = 2;
// Margen contra diferencias de redondeo con el layout de react-pdf.
const SLACK = 4;

export const PROJECT_NAME_SIZES = [20, 17, 14];
export const UNIT_NAME_SIZES = [16, 13, 11];
export const STATUS_SIZE = 8.5;
const STATUS_LETTER_SPACING = 0.5;
const STATUS_DOT = 6 + 4; // punto + margen

// Anchos de Helvetica-Bold (AFM, milésimas de em) del espacio (32) al ~ (126).
const ASCII_WIDTHS = [
  278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611,
  975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778,
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556,
  333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611,
  611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584,
];
const OTHER_WIDTHS: Record<string, number> = {
  '—': 1000, '–': 556, '…': 1000, '·': 278, '“': 500, '”': 500, '‘': 278, '’': 278,
  '°': 400, '²': 333, '³': 333, ' ': 278, 'Æ': 1000, 'æ': 889, 'ß': 611, '€': 556,
};
const DEFAULT_WIDTH = 667;

function charWidth(ch: string): number {
  const code = ch.charCodeAt(0);
  if (code >= 32 && code <= 126) return ASCII_WIDTHS[code - 32];
  if (Object.hasOwn(OTHER_WIDTHS, ch)) return OTHER_WIDTHS[ch];
  // Á, ñ, ü…: miden como su letra base.
  const base = ch.normalize('NFD')[0];
  const b = base.charCodeAt(0);
  return base !== ch && b >= 32 && b <= 126 ? ASCII_WIDTHS[b - 32] : DEFAULT_WIDTH;
}

/** Ancho en pt de un texto en Helvetica-Bold. */
export function textWidth(text: string, fontSize: number, letterSpacing = 0): number {
  let w = 0;
  for (const ch of text) w += (charWidth(ch) / 1000) * fontSize + letterSpacing;
  return w;
}

/** Renglones que ocupa el texto cortando por palabras (como react-pdf). */
export function estimateLines(text: string, fontSize: number, width: number): number {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return 0;
  const space = textWidth(' ', fontSize);
  let lines = 1;
  let current = 0;
  for (const word of words) {
    const w = textWidth(word, fontSize);
    if (current === 0) {
      // Una palabra más ancha que la columna se parte en varios renglones.
      lines += Math.ceil(w / width) - 1;
      current = w > width ? w % width : w;
    } else if (current + space + w <= width) {
      current += space + w;
    } else {
      lines += Math.ceil(w / width);
      current = w > width ? w % width : w;
    }
  }
  return lines;
}

export interface FittedText { text: string; fontSize: number }

/** El tamaño más grande con el que entra en MAX_LINES; si no entra ni con el más chico, se corta. */
function fit(text: string, sizes: number[], width: number): FittedText {
  const budget = width - SLACK;
  for (const fontSize of sizes) {
    if (estimateLines(text, fontSize, budget) <= MAX_LINES) return { text, fontSize };
  }
  const fontSize = sizes[sizes.length - 1];
  const words = text.split(/\s+/).filter(Boolean);
  while (words.length > 1) {
    words.pop();
    const cut = `${words.join(' ').replace(/[\s,.;:—–-]+$/, '')}…`;
    if (estimateLines(cut, fontSize, budget) <= MAX_LINES) return { text: cut, fontSize };
  }
  // Una sola palabra enorme: queda para el maxLines del documento.
  return { text: words[0] ?? '', fontSize };
}

export interface FichaHeaderLayout {
  project: FittedText;
  unit: FittedText;
  /** Ancho de la columna derecha (unidad + estado), en pt. */
  rightWidth: number;
  /** Ancho para el texto de la izquierda (ya descontada la separación). */
  leftWidth: number;
}

export function fichaHeaderLayout(o: { projectName: string; unitName: string; statusLabel?: string | null }): FichaHeaderLayout {
  const statusWidth = o.statusLabel
    ? STATUS_DOT + textWidth(o.statusLabel.toUpperCase(), STATUS_SIZE, STATUS_LETTER_SPACING)
    : 0;
  const unitOneLine = textWidth(o.unitName, UNIT_NAME_SIZES[0]);
  const rightWidth = Math.min(RIGHT_MAX, Math.ceil(Math.max(unitOneLine, statusWidth)) + SLACK);
  const leftWidth = HEADER_WIDTH - rightWidth - HEADER_GAP;
  return {
    project: fit(o.projectName, PROJECT_NAME_SIZES, leftWidth),
    unit: fit(o.unitName, UNIT_NAME_SIZES, rightWidth),
    rightWidth,
    leftWidth,
  };
}
