import { canManageMember, type MemberRole, type ProjectRole } from '@/lib/project-roles';

export type MemberInvitePlan =
  | { action: 'insert' }
  | { action: 'reinvite'; id: string }
  | { error: string; status: 400 | 403 | 409 };

// Decide qué hacer al invitar, sin tocar la base: así las reglas (en
// particular "quien rechazó se puede reinvitar") quedan testeables. El orden
// importa: primero el permiso, para no revelarle a quien no podía invitar si
// una persona ya es parte del equipo.
export function planMemberInvite(input: {
  actorRole: ProjectRole;
  role: MemberRole;
  targetId: string;
  ownerId: string;
  existing: { id: string; status: 'pending' | 'accepted' | 'declined' } | null;
}): MemberInvitePlan {
  const { actorRole, role, targetId, ownerId, existing } = input;
  if (!canManageMember(actorRole, role)) return { error: 'No podés invitar con ese rol', status: 403 };
  if (targetId === ownerId) return { error: 'Esa persona ya es la dueña del proyecto', status: 409 };
  if (existing?.status === 'accepted') return { error: 'Esa persona ya es parte del equipo', status: 409 };
  if (existing?.status === 'pending') return { error: 'Ya la invitaste: está pendiente de que acepte', status: 409 };
  // El unique(project_id, user_id) haría chocar un insert nuevo contra la
  // fila rechazada; se reutiliza esa fila.
  if (existing?.status === 'declined') return { action: 'reinvite', id: existing.id };
  return { action: 'insert' };
}
