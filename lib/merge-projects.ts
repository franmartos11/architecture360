import type { MemberRole, ProjectRole } from './project-roles';

type WithId = { id: string; created_at: string };

// Une los proyectos propios con los compartidos vía project_members. Si un
// proyecto aparece en ambas listas gana 'dueño' (el rol más alto). Las
// membresías con project nulo son de proyectos borrados o que RLS no deja ver.
export function mergeProjectsWithRoles<T extends WithId>(
  owned: T[],
  memberships: { role: MemberRole; project: T | null }[],
): (T & { role: ProjectRole })[] {
  const byId = new Map<string, T & { role: ProjectRole }>();
  for (const m of memberships) {
    if (m.project) byId.set(m.project.id, { ...m.project, role: m.role });
  }
  for (const p of owned) byId.set(p.id, { ...p, role: 'dueño' });
  return [...byId.values()].sort((a, b) => b.created_at.localeCompare(a.created_at));
}
