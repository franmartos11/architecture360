import { describe, expect, it } from 'vitest';
import { huellaToken, nuevoToken } from './token';

const T = '11111111-1111-4111-8111-111111111111';

describe('token de la charla web', () => {
  it('la base guarda una huella con forma de uuid, distinta del token', () => {
    const h = huellaToken(T);
    expect(h).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(h).not.toBe(T);
    expect(huellaToken(T)).toBe(h);
    expect(huellaToken(T.toUpperCase())).toBe(h);
    expect(huellaToken('22222222-2222-4222-8222-222222222222')).not.toBe(h);
  });

  it('tokens nuevos al azar', () => {
    expect(nuevoToken()).toMatch(/^[0-9a-f-]{36}$/);
    expect(nuevoToken()).not.toBe(nuevoToken());
  });
});
