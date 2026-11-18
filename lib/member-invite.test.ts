import { describe, it, expect } from 'vitest';
import { planMemberInvite } from './member-invite';

const base = { actorRole: 'dueño' as const, role: 'editor' as const, targetId: 'u2', ownerId: 'u1', existing: null };

describe('planMemberInvite', () => {
  it('un administrador no puede invitar administradores', () => {
    expect(planMemberInvite({ ...base, actorRole: 'administrador', role: 'administrador' })).toEqual({
      error: 'No podés invitar con ese rol',
      status: 403,
    });
  });

  it('no deja invitar a la dueña del proyecto', () => {
    expect(planMemberInvite({ ...base, targetId: 'u1' })).toEqual({
      error: 'Esa persona ya es la dueña del proyecto',
      status: 409,
    });
  });

  it('rechaza si ya es parte del equipo', () => {
    expect(planMemberInvite({ ...base, existing: { id: 'm1', status: 'accepted' } })).toEqual({
      error: 'Esa persona ya es parte del equipo',
      status: 409,
    });
  });

  it('rechaza si la invitación sigue pendiente', () => {
    expect(planMemberInvite({ ...base, existing: { id: 'm1', status: 'pending' } })).toEqual({
      error: 'Ya la invitaste: está pendiente de que acepte',
      status: 409,
    });
  });

  it('reinvita a quien rechazó', () => {
    expect(planMemberInvite({ ...base, existing: { id: 'm1', status: 'declined' } })).toEqual({
      action: 'reinvite',
      id: 'm1',
    });
  });

  it('inserta si no hay fila previa', () => {
    expect(planMemberInvite(base)).toEqual({ action: 'insert' });
  });

  it('evalúa el rol antes que el resto', () => {
    expect(planMemberInvite({ ...base, actorRole: 'administrador', role: 'administrador', targetId: 'u1' })).toMatchObject({ status: 403 });
  });
});
