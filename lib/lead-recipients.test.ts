import { describe, it, expect } from 'vitest';
import { leadRecipientIds } from './lead-recipients';

describe('leadRecipientIds', () => {
  it('incluye al dueño primero y a gestores/administradores aceptados', () => {
    expect(leadRecipientIds('o', [
      { user_id: 'e', role: 'editor', status: 'accepted' },
      { user_id: 'g', role: 'gestor', status: 'accepted' },
      { user_id: 'a', role: 'administrador', status: 'accepted' },
      { user_id: 'p', role: 'gestor', status: 'pending' },
    ])).toEqual(['o', 'g', 'a']);
  });

  it('no duplica al dueño ni a un miembro repetido', () => {
    expect(leadRecipientIds('o', [
      { user_id: 'o', role: 'administrador', status: 'accepted' },
      { user_id: 'g', role: 'gestor', status: 'accepted' },
      { user_id: 'g', role: 'gestor', status: 'accepted' },
    ])).toEqual(['o', 'g']);
  });
});
