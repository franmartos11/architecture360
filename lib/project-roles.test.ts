import { describe, it, expect } from 'vitest';
import { rankToRole, hasRole, canManageMember, isMemberRole, ROLE_RANK, MEMBER_ROLES } from './project-roles';

describe('project-roles', () => {
  it('rankToRole mapea rangos y devuelve null fuera de 1..4', () => {
    expect(rankToRole(0)).toBeNull();
    expect(rankToRole(5)).toBeNull();
    expect(rankToRole(1)).toBe('editor');
    expect(rankToRole(4)).toBe('dueño');
  });

  it('hasRole compara por rango', () => {
    expect(hasRole('gestor', 'editor')).toBe(true);
    expect(hasRole('editor', 'gestor')).toBe(false);
    expect(hasRole(null, 'editor')).toBe(false);
  });

  it('canManageMember respeta la jerarquía', () => {
    expect(canManageMember('dueño', 'administrador')).toBe(true);
    expect(canManageMember('administrador', 'gestor')).toBe(true);
    expect(canManageMember('administrador', 'administrador')).toBe(false);
    expect(canManageMember('gestor', 'editor')).toBe(false);
  });

  it('isMemberRole excluye al dueño', () => {
    expect(isMemberRole('dueño')).toBe(false);
    expect(isMemberRole('editor')).toBe(true);
    expect(isMemberRole(3)).toBe(false);
  });

  it('constantes consistentes', () => {
    expect(ROLE_RANK).toEqual({ editor: 1, gestor: 2, administrador: 3, dueño: 4 });
    expect(MEMBER_ROLES).toEqual(['editor', 'gestor', 'administrador']);
  });
});
