import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * El dominio propio ACTIVO de cada proyecto (el primero que se activó), para
 * mostrar y copiar la dirección definitiva en el panel. Va con el cliente de
 * sesión: el dueño lee los dominios de sus proyectos (policy "owner read").
 *
 * Es información de presentación: si la consulta falla (por ejemplo, la tabla
 * project_domains todavía no existe porque no se corrió schema.sql) se devuelve
 * un mapa vacío y el panel sigue mostrando el link de la plataforma. No hace
 * falta tumbar una pantalla por esto.
 */
export async function getActiveDomains(supabase: SupabaseClient, projectIds: string[]): Promise<Map<string, string>> {
  const byProject = new Map<string, string>();
  if (projectIds.length === 0) return byProject;

  const { data, error } = await supabase
    .from('project_domains')
    .select('project_id, hostname')
    .in('project_id', projectIds)
    .eq('status', 'active')
    .order('created_at', { ascending: true });
  if (error || !data) return byProject;

  for (const row of data as { project_id: string; hostname: string }[]) {
    if (!byProject.has(row.project_id)) byProject.set(row.project_id, row.hostname); // el más antiguo
  }
  return byProject;
}
