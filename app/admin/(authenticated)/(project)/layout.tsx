import { redirect } from 'next/navigation';
import { resolveActiveProjectId, requireProjectAccess } from '@/lib/supabase/require-project-access';
import ProjectAdminShell from './ProjectAdminShell';

// Todo lo que cuelga de este grupo de rutas (dashboard, edificios,
// inventario, leads, configuración, wizard, proyecto) necesita un
// proyecto activo — se resuelve y se valida acá, del lado del servidor,
// antes de renderizar nada. Si no hay ninguno (cuenta nueva, cookie
// vencida, lo que sea) manda directo a "Mis proyectos" en vez de mostrar
// un sidebar de edición sin nada que editar.
export default async function ProjectAdminLayout({ children }: { children: React.ReactNode }) {
  const projectId = await resolveActiveProjectId();
  if (!projectId) redirect('/admin/proyectos');

  const access = await requireProjectAccess(projectId);
  if (!access) redirect('/admin/proyectos');

  const { data: project } = await access.supabase
    .from('projects')
    .select('id, slug, name, project_type, sale_mode')
    .eq('id', projectId)
    .maybeSingle();
  if (!project) redirect('/admin/proyectos');

  return (
    <ProjectAdminShell project={project} userEmail={access.user.email ?? null}>
      {children}
    </ProjectAdminShell>
  );
}
