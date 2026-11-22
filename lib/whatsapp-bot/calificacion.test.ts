import { describe, expect, it } from 'vitest';
import { filasCalificacion, mezclarCalificacion, normalizarCalificacion, textoCalificacion } from './calificacion';

const AHORA = new Date('2026-11-20T12:00:00.000Z');

describe('normalizarCalificacion', () => {
  it('recorta textos, descarta vacíos y ambientes absurdos', () => {
    expect(
      normalizarCalificacion({ temperatura: 'tibio', presupuesto: '  ', ambientes: 0, plazo: ' 2027 ', proposito: null, financiacion: null }, AHORA),
    ).toEqual({ temperatura: 'tibio', presupuesto: null, ambientes: null, plazo: '2027', proposito: null, financiacion: null, actualizada_at: AHORA.toISOString() });
    expect(normalizarCalificacion({ temperatura: 'frio', ambientes: 2.5 }, AHORA).ambientes).toBeNull();
  });
});

describe('mezclarCalificacion', () => {
  it('lo nuevo manda y lo que no vino conserva lo anterior', () => {
    const previa = normalizarCalificacion({ temperatura: 'tibio', presupuesto: 'USD 100.000', ambientes: 2, financiacion: true }, AHORA);
    const nueva = normalizarCalificacion({ temperatura: 'caliente', plazo: 'marzo', ambientes: 3 }, AHORA);
    expect(mezclarCalificacion(previa, nueva)).toMatchObject({
      temperatura: 'caliente', presupuesto: 'USD 100.000', ambientes: 3, plazo: 'marzo', financiacion: true,
    });
    expect(mezclarCalificacion(null, nueva)).toBe(nueva);
  });
});

describe('textos', () => {
  const c = normalizarCalificacion(
    { temperatura: 'caliente', presupuesto: 'USD 120.000', ambientes: 3, plazo: '2027', proposito: 'vivir', financiacion: false },
    AHORA,
  );
  it('una línea para el aviso', () => {
    expect(textoCalificacion(c)).toBe('Caliente · presupuesto USD 120.000 · 3 amb · para vivir · plazo: 2027 · sin financiación');
  });
  it('filas para el panel, sin las vacías', () => {
    expect(filasCalificacion(c).map(([k]) => k)).toEqual(['Interés', 'Presupuesto', 'Ambientes', 'Para', 'Plazo', 'Financiación']);
    expect(filasCalificacion(normalizarCalificacion({ temperatura: 'frio' }, AHORA))).toEqual([['Interés', 'Frío']]);
  });
});
