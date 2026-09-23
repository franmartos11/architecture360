import type { BuildingRow, FloorRow, UnitRow } from '@/types/database';

/**
 * Las filas tal como las devuelve el embed de PostgREST
 * (`buildings(*, floors(*, units(*)))`): cada nivel trae al de abajo adentro.
 */
export type NestedFloorRow = FloorRow & { units?: UnitRow[] | null };
export type NestedBuildingRow = BuildingRow & { floors?: NestedFloorRow[] | null };

export interface FlatBuildingTree {
  buildings: BuildingRow[];
  floors: FloorRow[];
  units: UnitRow[];
}

/**
 * Desarma el árbol embebido en las tres listas planas que consume mapProject.
 *
 * Importa el orden: mapProject recorre las filas tal como vienen, así que el
 * recorrido es el mismo que producían las consultas sueltas que esto
 * reemplazó (buildings en orden, y dentro de cada uno sus floors, y dentro de
 * cada floor sus units). Un edificio sin pisos, o un piso sin unidades,
 * vienen como [] o null según el caso — de ahí los `?? []`.
 */
export function flattenBuildingTree(nested: NestedBuildingRow[]): FlatBuildingTree {
  const nestedFloors = nested.flatMap(b => b.floors ?? []);
  return {
    buildings: nested.map(({ floors: _floors, ...building }) => building),
    floors: nestedFloors.map(({ units: _units, ...floor }) => floor),
    units: nestedFloors.flatMap(f => f.units ?? []),
  };
}
