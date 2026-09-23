import { describe, it, expect } from 'vitest';
import { flattenBuildingTree, type NestedBuildingRow } from './building-tree';
import type { BuildingRow, FloorRow, UnitRow } from '@/types/database';

function building(id: string, over: Partial<BuildingRow> = {}): BuildingRow {
  return { id, project_id: 'p1', name: `Torre ${id}`, slug: `torre-${id}`, ...over } as BuildingRow;
}
function floor(id: string, building_id: string, number: number): FloorRow {
  return { id, building_id, number } as FloorRow;
}
function unit(id: string, floor_id: string, code: string): UnitRow {
  return { id, floor_id, code } as UnitRow;
}

describe('flattenBuildingTree', () => {
  it('desarma el árbol en tres listas planas', () => {
    const nested: NestedBuildingRow[] = [
      {
        ...building('b1'),
        floors: [
          { ...floor('f1', 'b1', 1), units: [unit('u1', 'f1', 'A01'), unit('u2', 'f1', 'A02')] },
          { ...floor('f2', 'b1', 2), units: [unit('u3', 'f2', 'B01')] },
        ],
      },
    ];

    const { buildings, floors, units } = flattenBuildingTree(nested);

    expect(buildings.map(b => b.id)).toEqual(['b1']);
    expect(floors.map(f => f.id)).toEqual(['f1', 'f2']);
    expect(units.map(u => u.id)).toEqual(['u1', 'u2', 'u3']);
  });

  it('no deja las claves anidadas colgando en las filas planas', () => {
    const nested: NestedBuildingRow[] = [
      { ...building('b1'), floors: [{ ...floor('f1', 'b1', 1), units: [unit('u1', 'f1', 'A01')] }] },
    ];

    const { buildings, floors } = flattenBuildingTree(nested);

    expect(buildings[0]).not.toHaveProperty('floors');
    expect(floors[0]).not.toHaveProperty('units');
  });

  it('respeta el orden: los pisos de cada edificio antes que los del siguiente', () => {
    const nested: NestedBuildingRow[] = [
      { ...building('b1'), floors: [{ ...floor('f1', 'b1', 4), units: [unit('u1', 'f1', 'A')] }] },
      {
        ...building('b2'),
        floors: [
          { ...floor('f2', 'b2', 9), units: [unit('u2', 'f2', 'B')] },
          { ...floor('f3', 'b2', 1), units: [unit('u3', 'f3', 'C')] },
        ],
      },
    ];

    const { floors, units } = flattenBuildingTree(nested);

    // El orden es el del embed, no un orden numérico: mapProject depende de
    // que sea el mismo que traían las consultas sueltas.
    expect(floors.map(f => f.number)).toEqual([4, 9, 1]);
    expect(units.map(u => u.code)).toEqual(['A', 'B', 'C']);
  });

  it('tolera un edificio sin pisos y un piso sin unidades', () => {
    const nested: NestedBuildingRow[] = [
      { ...building('b1'), floors: [] },
      { ...building('b2'), floors: [{ ...floor('f1', 'b2', 1), units: [] }] },
      { ...building('b3'), floors: null },
      { ...building('b4'), floors: [{ ...floor('f2', 'b4', 1), units: null }] },
    ];

    const { buildings, floors, units } = flattenBuildingTree(nested);

    expect(buildings).toHaveLength(4);
    expect(floors.map(f => f.id)).toEqual(['f1', 'f2']);
    expect(units).toEqual([]);
  });

  it('un proyecto sin edificios da las tres listas vacías', () => {
    expect(flattenBuildingTree([])).toEqual({ buildings: [], floors: [], units: [] });
  });
});
