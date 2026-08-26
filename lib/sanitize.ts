import sanitizeHtml from 'sanitize-html';

// Todo el texto libre de este proyecto se renderiza como texto plano en
// JSX (React ya escapa eso solo) — nunca con dangerouslySetInnerHTML. Por
// eso acá no se "permite" ningún tag: cualquier HTML que llegue en un
// input se saca por completo, para que lo que quede guardado en la base
// sea siempre texto plano, sin importar qué haga el frontend con eso el
// día de mañana.
const STRIP_ALL_TAGS: sanitizeHtml.IOptions = {
  allowedTags: [],
  allowedAttributes: {},
  // Sin esto, sanitize-html inserta un salto de línea entre bloques (ej.
  // el contenido de un <p></p> injectado) — no queremos que un intento de
  // HTML injection termine reformateando el texto, solo que desaparezca.
  textFilter: (text) => text,
};

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
};

// sanitize-html devuelve HTML (sin tags, pero con el texto todavía
// entity-encoded: "&" queda como "&amp;") porque está pensado para volver
// a insertarse como HTML. Acá el destino es texto plano (todo se renderiza
// en JSX, que escapa solo al mostrarlo), así que hay que decodificar las
// entidades de vuelta a sus caracteres — si no, un simple "&" en un
// comentario se guardaría y mostraría después como "&amp;" literal.
// Seguro de hacer DESPUÉS de sacar los tags: ya no hay markup que
// "reaparezca" al decodificar, solo caracteres sueltos.
function decodeHtmlEntities(input: string): string {
  return input.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (match, entity: string) => {
    if (entity[0] === '#') {
      const code = entity[1] === 'x' || entity[1] === 'X' ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    return NAMED_ENTITIES[entity] ?? match;
  });
}

/**
 * Texto libre que va a la base de datos: saca cualquier tag HTML, normaliza
 * espacios en blanco y recorta a `maxLength` si se pasa. Usar en TODO
 * campo de texto que un usuario pueda escribir (nombre, bio, comentario,
 * mensaje, descripción) antes del insert/update — sin excepción, aunque
 * hoy nada lo renderice como HTML: es la garantía de que lo guardado en
 * la base ya es seguro por sí mismo, no depende de que el frontend siga
 * portándose bien.
 */
export function sanitizeText(input: unknown, maxLength?: number): string {
  if (typeof input !== 'string') return '';
  const stripped = decodeHtmlEntities(sanitizeHtml(input, STRIP_ALL_TAGS)).trim().replace(/\s+/g, ' ');
  return maxLength ? stripped.slice(0, maxLength) : stripped;
}

/**
 * Igual que sanitizeText pero preserva saltos de línea simples (para
 * comentarios, mensajes y descripciones largas, donde "\n\n" separa
 * párrafos y no tiene sentido aplastarlo a un solo espacio).
 */
export function sanitizeMultiline(input: unknown, maxLength?: number): string {
  if (typeof input !== 'string') return '';
  const stripped = decodeHtmlEntities(sanitizeHtml(input, STRIP_ALL_TAGS))
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return maxLength ? stripped.slice(0, maxLength) : stripped;
}

/**
 * Devuelve el string tal cual, sanitizado a texto plano, o `null` si
 * queda vacío — para columnas opcionales donde "no cargado" se guarda
 * como null en vez de string vacío (el patrón que ya usa el resto del
 * proyecto en los inserts admin).
 */
export function sanitizeOptionalText(input: unknown, maxLength?: number): string | null {
  const text = sanitizeText(input, maxLength);
  return text || null;
}

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/**
 * Escapa texto para interpolarlo dentro de un template de HTML (ej. el
 * cuerpo de un email armado a mano con template strings) — a diferencia
 * de sanitizeText, acá el objetivo NO es guardar en la base sino mostrar
 * el valor tal cual pero sin que pueda inyectar markup en el HTML que lo
 * rodea.
 */
export function escapeHtml(input: unknown): string {
  if (typeof input !== 'string') return '';
  return input.replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch]);
}
