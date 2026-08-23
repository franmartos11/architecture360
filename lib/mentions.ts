// Mismo charset que HANDLE_RE (lib/validate.ts) — evita levantar un
// "@algo" que no podría ser un handle real (mayúsculas, puntuación, etc).
const MENTION_RE = /@([a-z0-9-]{3,40})/g;

// Handles únicos mencionados en un texto de post — usado tanto para
// notificar a los mencionados como para linkificar el render.
export function extractMentionedHandles(text: string): string[] {
  const handles = new Set<string>();
  for (const match of text.matchAll(MENTION_RE)) handles.add(match[1]);
  return [...handles];
}
