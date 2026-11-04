import { redirect } from 'next/navigation';
import { resolveActiveProjectId, requireProjectAccess } from '@/lib/supabase/require-project-access';
import { canonicalProjectType, getProjectTypeConfig, PROJECT_STRUCTURES, DEFAULT_PROJECT_TYPE } from '@/lib/project-types';
import GuidedLoad from '@/components/admin/guided/GuidedLoad';
import type { ProjectType } from '@/types';

// Carga guiada por tipo de proyecto (edificio, dúplex, casa, loteo,
// proyecto único — y sus variantes "solo para mostrar"). Es a donde
// llega un proyecto recién creado desde "Mis proyectos". El shell del
// panel (sidebar/topbar) lo pone el layout del grupo, igual que en el
// resto de las pantallas del proyecto.
export default async function CargaGuiadaPage() {
  const projectId = await resolveActiveProjectId();
  if (!projectId) redirect('/admin/proyectos');
  const access = await requireProjectAccess(projectId);
  if (!access) redirect('/admin/proyectos');

  const { data: p } = await access.supabase
    .from('projects')
    .select('id, slug, name, project_type, sale_mode, masterplan_image, tagline, location, academic_year')
    .eq('id', projectId)
    .maybeSingle();
  if (!p) redirect('/admin/proyectos');

  const canonical = canonicalProjectType(p.project_type ?? '');
  const projectType = (canonical in PROJECT_STRUCTURES ? canonical : DEFAULT_PROJECT_TYPE) as ProjectType;
  const { saleMode } = getProjectTypeConfig(projectType, p.sale_mode ?? '');

  return (
    <GuidedLoad
      project={{
        id: p.id,
        slug: p.slug,
        name: p.name,
        projectType,
        saleMode,
        masterplanImage: p.masterplan_image ?? null,
        tagline: p.tagline ?? null,
        location: p.location ?? null,
        academicYear: p.academic_year ?? null,
      }}
    />
  );
}
