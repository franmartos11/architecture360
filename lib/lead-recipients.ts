import { hasRole, type MemberRole } from '@/lib/project-roles';

// Quiénes reciben el aviso de un lead nuevo: el dueño y el equipo comercial
// (gestores y administradores ya aceptados). Los editores no gestionan
// leads y los pendientes todavía no son parte del proyecto, así que no
// reciben nada. El Set evita duplicados y conserva el orden: dueño primero.
export function leadRecipientIds(
  ownerId: string,
  members: { user_id: string; role: MemberRole; status: string }[]
): string[] {
  const ids = new Set<string>([ownerId]);
  for (const m of members) {
    if (m.status === 'accepted' && hasRole(m.role, 'gestor')) ids.add(m.user_id);
  }
  return [...ids];
}
