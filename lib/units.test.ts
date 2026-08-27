import { describe, it, expect } from 'vitest';
import { deriveUnitType, unitTypeLabel, hasRoomProgram, roomCounts, synthesizeRoomProgram, allProgramRooms, bearingToCardinal, parseOrientation, roomFeatureOptions } from './units';
import type { Room } from '@/types';

describe('deriveUnitType', () => {
  it('genera los strings del catálogo para los primeros valores', () => {
    expect(deriveUnitType(0)).toBe('monoambiente');
    expect(deriveUnitType(1)).toBe('1 dormitorio');
    expect(deriveUnitType(2)).toBe('2 dormitorios');
    expect(deriveUnitType(3)).toBe('3 dormitorios');
  });

  it('no tiene techo — una casa puede tener 4, 5, 6+ dormitorios', () => {
    expect(deriveUnitType(4)).toBe('4 dormitorios');
    expect(deriveUnitType(6)).toBe('6 dormitorios');
  });

  it('tolera basura (negativos, NaN, decimales)', () => {
    expect(deriveUnitType(-2)).toBe('monoambiente');
    expect(deriveUnitType(NaN)).toBe('monoambiente');
    expect(deriveUnitType(2.7)).toBe('2 dormitorios');
  });
});

describe('unitTypeLabel', () => {
  it('capitaliza cualquier valor, conocido o derivado', () => {
    expect(unitTypeLabel('penthouse')).toBe('Penthouse');
    expect(unitTypeLabel('5 dormitorios')).toBe('5 dormitorios');
    expect(unitTypeLabel('')).toBe('');
  });
});

describe('orientación', () => {
  it('bearingToCardinal mapea grados a los 8 rumbos', () => {
    expect(bearingToCardinal(0)).toBe('N');
    expect(bearingToCardinal(45)).toBe('NE');
    expect(bearingToCardinal(90)).toBe('E');
    expect(bearingToCardinal(200)).toBe('S');
    expect(bearingToCardinal(-45)).toBe('NO');
    expect(bearingToCardinal(360)).toBe('N');
  });

  it('parseOrientation: valor numérico → grados + cardinal; valor viejo → cardinal crudo', () => {
    expect(parseOrientation('45')).toEqual({ degrees: 45, cardinal: 'NE' });
    expect(parseOrientation('315')).toEqual({ degrees: 315, cardinal: 'NO' });
    expect(parseOrientation('NE')).toEqual({ cardinal: 'NE' });
    expect(parseOrientation('')).toEqual({});
    expect(parseOrientation(null)).toEqual({});
  });
});

describe('programa de ambientes', () => {
  const program: Room[] = [
    { id: '1', name: 'Dorm 1', kind: 'bedroom' },
    { id: '2', name: 'Dorm 2', kind: 'bedroom' },
    { id: '3', name: 'Baño', kind: 'bathroom' },
    { id: '4', name: 'Living', kind: 'living' },
    { id: '5', name: 'Lavadero', kind: 'laundry' },
  ];

  it('hasRoomProgram solo cuenta ambientes con kind (los polígono-solo no)', () => {
    expect(hasRoomProgram(program)).toBe(true);
    expect(hasRoomProgram([{ id: 'a', name: 'x', polygon: [{ x: 0, y: 0 }] }])).toBe(false);
    expect(hasRoomProgram([])).toBe(false);
    expect(hasRoomProgram(null)).toBe(false);
  });

  it('roomCounts agrupa por tipo; "other" es todo lo que no es dorm/baño/living/cocina', () => {
    expect(roomCounts(program)).toEqual({ bedrooms: 2, bathrooms: 1, living: 1, kitchen: 0, other: 1 });
  });

  it('synthesizeRoomProgram arma la lista desde los contadores planos', () => {
    const rooms = synthesizeRoomProgram({ bedrooms: 3, bathrooms: 2, livingRooms: 1, kitchens: 1, otherRoomsCount: 1, otherRoomsDescription: 'Playroom' });
    expect(rooms.map(r => r.kind)).toEqual(['bedroom', 'bedroom', 'bedroom', 'bathroom', 'bathroom', 'living', 'kitchen', 'other']);
    expect(rooms.map(r => r.name)).toEqual(['Dormitorio 1', 'Dormitorio 2', 'Dormitorio 3', 'Baño 1', 'Baño 2', 'Living', 'Cocina', 'Playroom']);
    // round-trip: los conteos derivados coinciden con los originales
    expect(roomCounts(rooms)).toEqual({ bedrooms: 3, bathrooms: 2, living: 1, kitchen: 1, other: 1 });
  });

  it('synthesizeRoomProgram devuelve [] si no hay nada', () => {
    expect(synthesizeRoomProgram({})).toEqual([]);
  });

  it('roomFeatureOptions ofrece características según el tipo — una cocina no tiene "En suite"', () => {
    expect(roomFeatureOptions('bedroom')).toContain('En suite');
    expect(roomFeatureOptions('kitchen')).not.toContain('En suite');
    expect(roomFeatureOptions('kitchen')).toContain('Isla');
    expect(roomFeatureOptions('storage')).toEqual([]);
    expect(roomFeatureOptions(undefined)).toEqual(roomFeatureOptions('other'));
  });

  it('allProgramRooms suma planta baja + niveles (casa de 2+ pisos)', () => {
    const base: Room[] = [{ id: '1', name: 'Living', kind: 'living' }, { id: '2', name: 'Cocina', kind: 'kitchen' }];
    const levels = [{ rooms: [{ id: '3', name: 'Dorm', kind: 'bedroom' as const }, { id: '4', name: 'Baño', kind: 'bathroom' as const }] }];
    const all = allProgramRooms(base, levels);
    expect(all).toHaveLength(4);
    expect(roomCounts(all)).toEqual({ bedrooms: 1, bathrooms: 1, living: 1, kitchen: 1, other: 0 });
    expect(allProgramRooms(base, null)).toHaveLength(2);
    expect(allProgramRooms(null, null)).toEqual([]);
  });
});
