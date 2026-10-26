import { describe, it, expect } from 'vitest';
import { deriveUnitType, unitTypeLabel, hasRoomProgram, roomCounts, synthesizeRoomProgram, allProgramRooms, bearingToCardinal, parseOrientation, roomFeatureOptions, drawnParkingSpots, parkingFloorGroups, remapParkingSpotFloors, parsePriceInput, priceChangeFromInput, areaMismatch, UNIT_CURRENCIES, fmtM2, formatPrice } from './units';
import type { ParkingSpot, Room, UnitParkingSpot } from '@/types';

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

describe('cocheras marcadas en el plano', () => {
  const square = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];

  it('descarta las que no se pueden pintar: sin plano del piso o sin forma cerrada', () => {
    const spots: UnitParkingSpot[] = [
      { floorId: 'ss1', polygon: square, planImage: '/planos/ss1.png' },
      { floorId: 'ss1', polygon: square },                                 // el piso perdió su plano
      { floorId: 'ss1', polygon: [{ x: 1, y: 1 }], planImage: '/x.png' },  // forma incompleta
    ];
    expect(drawnParkingSpots(spots)).toHaveLength(1);
    expect(drawnParkingSpots(undefined)).toEqual([]);
  });

  it('agrupa por piso: dos espacios en el mismo subsuelo comparten un solo plano', () => {
    const spots: UnitParkingSpot[] = [
      { floorId: 'ss1', label: 'C-12', polygon: square, planImage: '/ss1.png', floorLabel: 'Subsuelo 1' },
      { floorId: 'ss2', label: 'C-40', polygon: square, planImage: '/ss2.png', floorLabel: 'Subsuelo 2' },
      { floorId: 'ss1', label: 'C-13', polygon: square, planImage: '/ss1.png', floorLabel: 'Subsuelo 1' },
    ];
    const groups = parkingFloorGroups(spots);
    expect(groups.map(g => g.floorId)).toEqual(['ss1', 'ss2']);
    expect(groups[0].spots).toHaveLength(2);
    expect(groups[0].planImage).toBe('/ss1.png');
    expect(groups[0].label).toBe('Subsuelo 1');
    expect(parkingFloorGroups([])).toEqual([]);
  });

  // Usado al duplicar un edificio o un proyecto entero (Hallazgo 1 de la
  // ronda de corrección): la cochera copiada tiene que apuntar al piso YA
  // duplicado, no al original.
  describe('remapParkingSpotFloors', () => {
    it('remapea el floorId de cada cochera con el mapa viejo→nuevo', () => {
      const spots: ParkingSpot[] = [
        { floorId: 'ss1-viejo', label: 'C-12', polygon: square },
        { floorId: 'ss2-viejo', polygon: square },
      ];
      const floorIdMap = new Map([['ss1-viejo', 'ss1-nuevo'], ['ss2-viejo', 'ss2-nuevo']]);
      expect(remapParkingSpotFloors(spots, floorIdMap)).toEqual([
        { floorId: 'ss1-nuevo', label: 'C-12', polygon: square },
        { floorId: 'ss2-nuevo', polygon: square },
      ]);
    });

    it('descarta las que apuntan a un piso fuera del mapa (huérfanas) en vez de copiarlas rotas', () => {
      const spots: ParkingSpot[] = [{ floorId: 'piso-borrado', polygon: square }];
      expect(remapParkingSpotFloors(spots, new Map([['otro', 'otro-nuevo']]))).toEqual([]);
    });

    it('null/undefined se tratan como sin cocheras', () => {
      expect(remapParkingSpotFloors(null, new Map())).toEqual([]);
      expect(remapParkingSpotFloors(undefined, new Map())).toEqual([]);
    });
  });
});

// Precio vacío = "Consultar" (null). Un 0 tipeado a propósito sí se guarda como 0.
describe('parsePriceInput', () => {
  it('vacío o solo espacios → null (Consultar)', () => {
    expect(parsePriceInput('')).toBeNull();
    expect(parsePriceInput('   ')).toBeNull();
  });

  it('"0" tipeado a propósito → 0, no null', () => {
    expect(parsePriceInput('0')).toBe(0);
  });

  it('números válidos', () => {
    expect(parsePriceInput('125000')).toBe(125000);
    expect(parsePriceInput('1500.5')).toBe(1500.5);
  });

  it('negativos y basura → undefined (inválido: NO es lo mismo que vacío)', () => {
    expect(parsePriceInput('-3')).toBeUndefined();
    expect(parsePriceInput('abc')).toBeUndefined();
    expect(parsePriceInput('Infinity')).toBeUndefined();
  });
});

describe('priceChangeFromInput', () => {
  const input = (value: string, badInput = false) => ({ value, validity: { badInput } });

  it('vacío sobre un precio cargado → pasa a null (Consultar)', () => {
    expect(priceChangeFromInput(input(''), 120000)).toEqual({ price: null });
  });

  it('sin cambios → null (no hay PATCH)', () => {
    expect(priceChangeFromInput(input('120000'), 120000)).toBeNull();
    expect(priceChangeFromInput(input(''), null)).toBeNull();
  });

  it('"0" tipeado a propósito → guarda 0', () => {
    expect(priceChangeFromInput(input('0'), null)).toEqual({ price: 0 });
  });

  it('negativo no pisa el precio existente y restaura el campo', () => {
    const el = input('-5');
    expect(priceChangeFromInput(el, 120000)).toBeNull();
    expect(el.value).toBe('120000');
  });

  it('badInput (el browser reporta value "" para "1e") no borra el precio y restaura el campo', () => {
    const el = input('', true);
    expect(priceChangeFromInput(el, 120000)).toBeNull();
    expect(el.value).toBe('120000');
  });

});

describe('areaMismatch', () => {
  it('partes que suman el total → false', () => {
    expect(areaMismatch(80, [70, 6, 4])).toBe(false);
  });

  it('diferencia dentro de la tolerancia (0.5) → false', () => {
    expect(areaMismatch(80, [70, 6, 4.4])).toBe(false);
  });

  it('partes que no suman → true', () => {
    expect(areaMismatch(80, [60, 6, 0])).toBe(true);
  });

  it('sin total o sin partes cargadas → false', () => {
    expect(areaMismatch(null, [60])).toBe(false);
    expect(areaMismatch(80, [null, 0, 0])).toBe(false);
  });
});

describe('UNIT_CURRENCIES', () => {
  it.each([...UNIT_CURRENCIES])('%s tiene formato válido en formatPrice', (c) => {
    expect(() => formatPrice(1000, c)).not.toThrow();
    expect(formatPrice(1000, c)).toMatch(/1.?000/);
  });
});

describe('fmtM2', () => {
  it('quita colas de float y ceros de más', () => {
    expect(fmtM2(80.00000001)).toBe('80');
    expect(fmtM2(65.5)).toBe('65.5');
    expect(fmtM2(10.456)).toBe('10.46');
  });
});
