import { describe, it, expect } from 'vitest';
import { fillMissing, unitCopyPatch, isUnitColumnEmpty } from './unit-copy';

describe('fillMissing', () => {
  const isEmpty = (_k: string, v: unknown) => v === '' || v == null;

  it('completa solo lo vacío y respeta lo cargado', () => {
    const r = fillMissing({ a: '', b: 'mío', c: '' }, { a: 'x', b: 'otro', c: '' }, isEmpty);
    expect(r.next).toEqual({ a: 'x', b: 'mío', c: '' });
    expect(r.filled).toEqual(['a']);
    expect(r.kept).toEqual(['b']);
  });

  it('no cuenta como "mantenido" un campo que ya es igual al de la fuente', () => {
    const r = fillMissing({ a: 'igual' }, { a: 'igual' }, isEmpty);
    expect(r.filled).toEqual([]);
    expect(r.kept).toEqual([]);
  });

  it('solo toca las claves pedidas', () => {
    const r = fillMissing({ a: '', code: '' }, { a: 'x', code: 'A01' }, isEmpty, ['a']);
    expect(r.next).toEqual({ a: 'x', code: '' });
  });
});

describe('isUnitColumnEmpty', () => {
  it('trata los defaults de la tabla como vacíos', () => {
    expect(isUnitColumnEmpty('bathrooms', 1, {})).toBe(true);
    expect(isUnitColumnEmpty('currency', 'USD', {})).toBe(true);
    expect(isUnitColumnEmpty('balcony_area', 0, {})).toBe(true);
    expect(isUnitColumnEmpty('features', [], {})).toBe(true);
    expect(isUnitColumnEmpty('bathrooms', 2, {})).toBe(false);
  });

  it('la tipología de alta ("2 dormitorios") es vacía solo si los dormitorios también son default', () => {
    expect(isUnitColumnEmpty('type', '2 dormitorios', { bedrooms: 0 })).toBe(true);
    expect(isUnitColumnEmpty('type', '2 dormitorios', { bedrooms: 2 })).toBe(false);
    expect(isUnitColumnEmpty('type', 'penthouse', { bedrooms: 0 })).toBe(false);
  });
});

describe('unitCopyPatch', () => {
  const target = {
    code: 'B02', status: 'available', model_name: 'Suite', type: '2 dormitorios', bedrooms: 0, bathrooms: 1,
    total_area: null, price: 120000, currency: 'USD', features: [],
  };
  const source = {
    code: 'A01', status: 'sold', model_name: 'Garden', type: '3 dormitorios', bedrooms: 3, bathrooms: 2,
    total_area: 95, price: 150000, currency: 'ARS', features: ['Balcón'],
  };

  it('arma el PATCH solo con lo que falta, en claves de la API', () => {
    const r = unitCopyPatch(target, source);
    expect(r.patch).toEqual({
      type: '3 dormitorios', bedrooms: 3, bathrooms: 2, totalArea: 95, currency: 'ARS', features: ['Balcón'],
    });
  });

  it('nunca copia código ni estado (copiar de una vendida no la marca vendida)', () => {
    const r = unitCopyPatch(target, source);
    expect(r.patch).not.toHaveProperty('code');
    expect(r.patch).not.toHaveProperty('status');
  });

  it('informa con etiquetas qué completa y qué mantiene', () => {
    const r = unitCopyPatch(target, source);
    expect(r.filledLabels).toContain('Superficie total');
    expect(r.keptLabels).toEqual(expect.arrayContaining(['Modelo', 'Precio']));
  });
});
