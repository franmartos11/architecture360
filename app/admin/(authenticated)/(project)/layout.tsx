import { redirect } from 'next/navigation';
import { resolveActiveProjectId, requireProjectAccess } from '@/lib/supabase/require-project-access';
import { getProjectTypeConfig } from '@/lib/project-types';
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

  // Formas "de una sola cosa" (casa, loteo): el sidebar linkea DIRECTO al
  // editor de datos (/edificios/[b]/pisos/[f]) — resuelto acá, del lado del
  // servidor, para no pasar por /admin/edificios → fetch → redirect → fetch
  // de nuevo cada vez que se toca el ítem del menú.
  let singleBuildingHref: string | null = null;
  const cfg = getProjectTypeConfig(project.project_type, project.sale_mode);
  if (cfg.singleBuilding) {
    const { data: b } = await access.supabase
      .from('buildings').select('id').eq('project_id', projectId).order('created_at').limit(1).maybeSingle();
    if (b) {
      const { data: f } = await access.supabase
        .from('floors').select('id').eq('building_id', b.id).order('number').limit(1).maybeSingle();
      if (f) singleBuildingHref = `/admin/edificios/${b.id}/pisos/${f.id}`;
    }
  }

  return (
    <ProjectAdminShell project={project} userEmail={access.user.email ?? null} singleBuildingHref={singleBuildingHref}>
      {children}
    </ProjectAdminShell>
  );
}
