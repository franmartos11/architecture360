// ¿El sitio muestra el chat? public_project_chat (security definer) responde
// solo si el proyecto está publicado y el chat web encendido. Si la función no
// existe todavía o falla, no hay chat (como el número de WhatsApp).
type Rpc = (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }>;

export async function leerChatPublico(rpc: Rpc, projectId: string): Promise<{ nombreBot: string | null } | undefined> {
  try {
    const { data, error } = await rpc('public_project_chat', { p_project_id: projectId });
    if (error || !data || typeof data !== 'object') return undefined;
    const nombre = (data as { nombre_bot?: unknown }).nombre_bot;
    return { nombreBot: typeof nombre === 'string' && nombre.trim() ? nombre.trim() : null };
  } catch {
    return undefined;
  }
}
