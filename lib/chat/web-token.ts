// Token de la charla del chat web en el navegador: localStorage por proyecto,
// con vencimiento. Sin el token no se puede leer ni seguir la charla (spec:
// docs/superpowers/specs/2026-11-24-chat-web-design.md). Todo con try/catch:
// en modo privado o con el storage bloqueado, el chat arranca de cero.

export const DIAS_CHAT = 30;
const MS_DIA = 86_400_000;
const clave = (slug: string) => `atrium_chat_${slug}`;

export function leerTokenChat(s: Storage | null, slug: string, ahora: number): string | null {
  if (!s) return null;
  try {
    const v = JSON.parse(s.getItem(clave(slug)) ?? 'null') as { token?: unknown; at?: unknown } | null;
    if (!v || typeof v.token !== 'string' || typeof v.at !== 'number') return null;
    return ahora - v.at > DIAS_CHAT * MS_DIA ? null : v.token;
  } catch {
    return null;
  }
}

export function guardarTokenChat(s: Storage | null, slug: string, token: string, ahora: number): void {
  try {
    s?.setItem(clave(slug), JSON.stringify({ token, at: ahora }));
  } catch {
    /* sin storage: la charla no se retoma */
  }
}

export function borrarTokenChat(s: Storage | null, slug: string): void {
  try {
    s?.removeItem(clave(slug));
  } catch {
    /* nada */
  }
}
