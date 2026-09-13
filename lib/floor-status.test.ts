import { describe, it, expect } from 'vitest';
import { floorStatus, floorStatusLabel, type FloorStatusInput } from './floor-status';

function make(overrides: Partial<FloorStatusInput> = {}): FloorStatusInput {
  return {
    floorKind: 'units',
    hasPlan: true,
    totalUnits: 0,
    missingPhoto: 0,
    missingPrice: 0,
    ...overrides,
  };
}

describe('floorStatus / floorStatusLabel — piso de unidades', () => {
  it('sin plano y sin unidades → empty, "Sin unidades ni plano"', () => {
    const input = make({ hasPlan: false, totalUnits: 0 });
    expect(floorStatus(input)).toBe('empty');
    expect(floorStatusLabel(input)).toBe('Sin unidades ni plano');
  });

  it('con plano y sin unidades → partial, "Sin unidades"', () => {
    const input = make({ hasPlan: true, totalUnits: 0 });
    expect(floorStatus(input)).toBe('partial');
    expect(floorStatusLabel(input)).toBe('Sin unidades');
  });

  it('con unidades, plano, sin faltantes → complete, "Completo"', () => {
    const input = make({ totalUnits: 12, hasPlan: true, missingPhoto: 0, missingPrice: 0 });
    expect(floorStatus(input)).toBe('complete');
    expect(floorStatusLabel(input)).toBe('Completo');
  });

  it('con unidades y fotos faltantes → partial, "3 sin foto"', () => {
    const input = make({ totalUnits: 12, hasPlan: true, missingPhoto: 3, missingPrice: 0 });
    expect(floorStatus(input)).toBe('partial');
    expect(floorStatusLabel(input)).toBe('3 sin foto');
  });

  it('con unidades, fotos y precios faltantes → unidos con " · "', () => {
    const input = make({ totalUnits: 12, hasPlan: true, missingPhoto: 3, missingPrice: 2 });
    expect(floorStatus(input)).toBe('partial');
    expect(floorStatusLabel(input)).toBe('3 sin foto · 2 sin precio');
  });

  it('con unidades pero sin plano → partial, incluye "falta el plano"', () => {
    const input = make({ totalUnits: 12, hasPlan: false, missingPhoto: 0, missingPrice: 0 });
    expect(floorStatus(input)).toBe('partial');
    expect(floorStatusLabel(input)).toBe('falta el plano');
  });

  it('sin plano, con unidades y con fotos faltantes → todo unido', () => {
    const input = make({ totalUnits: 12, hasPlan: false, missingPhoto: 3, missingPrice: 0 });
    expect(floorStatus(input)).toBe('partial');
    expect(floorStatusLabel(input)).toBe('falta el plano · 3 sin foto');
  });
});

describe('floorStatus / floorStatusLabel — piso que no es de unidades', () => {
  it('con plano → complete, "Completo"', () => {
    const input = make({ floorKind: 'amenity', hasPlan: true, totalUnits: 0 });
    expect(floorStatus(input)).toBe('complete');
    expect(floorStatusLabel(input)).toBe('Completo');
  });

  it('sin plano → empty, "Falta el plano"', () => {
    const input = make({ floorKind: 'amenity', hasPlan: false, totalUnits: 0 });
    expect(floorStatus(input)).toBe('empty');
    expect(floorStatusLabel(input)).toBe('Falta el plano');
  });

  it('las unidades no aplican: 0 unidades con plano sigue siendo complete', () => {
    const input = make({ floorKind: 'technical', hasPlan: true, totalUnits: 0, missingPhoto: 5 });
    expect(floorStatus(input)).toBe('complete');
    expect(floorStatusLabel(input)).toBe('Completo');
  });
});
