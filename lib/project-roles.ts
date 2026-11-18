// Sin 'server-only': lo usan tanto las rutas API como los componentes del
// cliente (para ocultar controles que el rol no puede usar). La autorización
// real vive en la base (RLS + project_role_rank) y en requireProjectAccess;
// esto es solo la tabla de rangos y las reglas de jerarquía.

export type ProjectRole = 'editor' | 'gestor' | 'administrador' | 'dueño';
export type MemberRole = Exclude<ProjectRole, 'dueño'>;

// El dueño no es un rol asignable: sale de projects.owner_id, no de la
// tabla de miembros. Por eso la lista de roles de miembro lo excluye.
export const MEMBER_ROLES: readonly MemberRole[] = ['editor', 'gestor', 'administrador'];

// Mismos valores que devuelve project_role_rank() en SQL (0 = sin acceso).
export const ROLE_RANK: Record<ProjectRole, number> = {
  editor: 1,
  gestor: 2,
  administrador: 3,
  dueño: 4,
};

export const ROLE_LABELS: Record<ProjectRole, string> = {
  editor: 'Editor',
  gestor: 'Gestor',
  administrador: 'Administrador',
  dueño: 'Dueño',
};

export function rankToRole(rank: number): ProjectRole | null {
  switch (rank) {
    case 1: return 'editor';
    case 2: return 'gestor';
    case 3: return 'administrador';
    case 4: return 'dueño';
    default: return null;
  }
}

export function hasRole(role: ProjectRole | null, min: ProjectRole): boolean {
  return role !== null && ROLE_RANK[role] >= ROLE_RANK[min];
}

// El dueño gestiona a todos; el administrador solo a quienes están por
// debajo de él (no a otros administradores). Gestor y editor, a nadie.
export function canManageMember(actor: ProjectRole, target: MemberRole): boolean {
  if (actor === 'dueño') return true;
  if (actor === 'administrador') return target === 'editor' || target === 'gestor';
  return false;
}

export function isMemberRole(v: unknown): v is MemberRole {
  return typeof v === 'string' && (MEMBER_ROLES as readonly string[]).includes(v);
}
