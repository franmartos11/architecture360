import { describe, it, expect } from 'vitest';
import { parkingSpotsOnFloor, spotLabel, amenitiesPlacedIn, amenitiesWhereLabel, mainAmenityFloor } from './floor-explorer';
import type { Amenity, Floor, Unit } from '@/types';

const square = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];

const floor = (id: string, number: number, label = `Piso ${number}`): Floor => ({ id, number, label, planImage: '', unitDots: [] });
const unit = (id: string, parkingSpots?: Unit['parkingSpots']) => ({ id, name: id, parkingSpots }) as Unit;
const amenity = (id: string, floorId?: string, pin = true): Amenity =>
  ({ id, name: id, images: [], floorId, pin: pin ? { x: 1, y: 1 } : undefined });

describe('parkingSpotsOnFloor', () => {
  it('junta las cocheras de ese piso con su dueña, ordenadas por etiqueta', () => {
    const units = [
      unit('A1', [{ floorId: 'ss1', label: 'C-10', polygon: square }, { floorId: 'ss2', label: 'C-01', polygon: square }]),
      unit('A2', [{ floorId: 'ss1', label: 'C-2', polygon: square }]),
      unit('A3'),
    ];
    const spots = parkingSpotsOnFloor(units, 'ss1');
    expect(spots.map(s => s.key)).toEqual(['A2#0', 'A1#0']);
    expect(spots[0].center).toEqual({ x: 5, y: 5 });
  });

  it('ignora cocheras sin polígono dibujado', () => {
    expect(parkingSpotsOnFloor([unit('A1', [{ floorId: 'ss1', polygon: [] }])], 'ss1')).toEqual([]);
  });

  it('sin etiqueta, la cochera se nombra por su unidad', () => {
    expect(spotLabel({ unit: unit('B04'), spot: { floorId: 'ss1', polygon: square } })).toBe('Cochera B04');
  });
});

describe('amenities en la torre', () => {
  const floors = [floor('f5', 5), floor('f10', 10), floor('pb', 0, '')];
  const placed = amenitiesPlacedIn([
    amenity('Piscina', 'f10'), amenity('Cowork', 'f5'), amenity('SUM', 'f10'),
    amenity('Otra torre', 'x9'), amenity('Sin pin', 'f5', false), amenity('Sin piso'),
  ], floors);

  it('solo cuenta las ubicadas (con pin) en pisos de esta torre', () => {
    expect(placed.map(a => a.id)).toEqual(['Piscina', 'Cowork', 'SUM']);
  });

  it('arma el resumen por piso, de abajo hacia arriba', () => {
    expect(amenitiesWhereLabel(placed, floors)).toBe('Cowork en piso 5 · Piscina y SUM en piso 10');
    expect(amenitiesWhereLabel([amenity('Lobby', 'pb')], floors)).toBe('Lobby en Planta baja');
  });

  it('el piso principal de amenities es el que más tiene', () => {
    expect(mainAmenityFloor(placed, floors)?.id).toBe('f10');
    expect(mainAmenityFloor([], floors)).toBeUndefined();
  });
});
