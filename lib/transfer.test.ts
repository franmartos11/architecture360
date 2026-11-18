import { describe, it, expect } from 'vitest';
import { validateTransferTarget } from './transfer';

const base = { ownerId: 'u1', ownerHasHandle: true, targetId: 'u2' as string | null, hasPending: false };

describe('validateTransferTarget', () => {
  it('exige que la persona dueña tenga handle', () => {
    expect(validateTransferTarget({ ...base, ownerHasHandle: false })).toEqual({
      error: 'Necesitás un perfil con handle para transferir',
      status: 400,
    });
  });

  it('404 si no existe el perfil destino', () => {
    expect(validateTransferTarget({ ...base, targetId: null })).toEqual({
      error: 'No existe ningún perfil con ese handle',
      status: 404,
    });
  });

  it('rechaza transferir a uno mismo', () => {
    expect(validateTransferTarget({ ...base, targetId: 'u1' })).toEqual({
      error: 'Ya sos el dueño de este proyecto',
      status: 400,
    });
  });

  it('rechaza si ya hay una pendiente', () => {
    expect(validateTransferTarget({ ...base, hasPending: true })).toEqual({
      error: 'Ya hay una transferencia pendiente: cancelala primero',
      status: 409,
    });
  });

  it('devuelve null cuando todo está bien', () => {
    expect(validateTransferTarget(base)).toBeNull();
  });

  it('respeta el orden: sin handle gana sobre el resto', () => {
    expect(validateTransferTarget({ ownerId: 'u1', ownerHasHandle: false, targetId: null, hasPending: true })?.status).toBe(400);
  });
});
