import { describe, it, expect } from 'vitest';
import { isValidEnum, HANDLE_RE, UNIT_STATUSES, POI_CATEGORIES } from './validate';

describe('isValidEnum', () => {
  it('acepta valores dentro de la lista', () => {
    expect(isValidEnum('available', UNIT_STATUSES)).toBe(true);
    expect(isValidEnum('colegio', POI_CATEGORIES)).toBe(true);
  });

  it('rechaza valores fuera de la lista', () => {
    expect(isValidEnum('vendido', UNIT_STATUSES)).toBe(false);
  });

  it('rechaza valores no-string', () => {
    expect(isValidEnum(123, UNIT_STATUSES)).toBe(false);
    expect(isValidEnum(undefined, UNIT_STATUSES)).toBe(false);
    expect(isValidEnum(null, UNIT_STATUSES)).toBe(false);
  });
});

describe('HANDLE_RE', () => {
  it('acepta handles válidos', () => {
    expect(HANDLE_RE.test('juana-perez')).toBe(true);
    expect(HANDLE_RE.test('estudio123')).toBe(true);
    expect(HANDLE_RE.test('abc')).toBe(true);
  });

  it('rechaza mayúsculas, espacios y símbolos', () => {
    expect(HANDLE_RE.test('Juana-Perez')).toBe(false);
    expect(HANDLE_RE.test('juana perez')).toBe(false);
    expect(HANDLE_RE.test('juana@perez')).toBe(false);
  });

  it('rechaza por longitud (menos de 3 o más de 40 caracteres)', () => {
    expect(HANDLE_RE.test('ab')).toBe(false);
    expect(HANDLE_RE.test('a'.repeat(41))).toBe(false);
    expect(HANDLE_RE.test('a'.repeat(40))).toBe(true);
  });
});
