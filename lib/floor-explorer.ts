import type { Amenity, Floor, Unit, UnitParkingSpot } from '@/types';
import { polygonCenter } from '@/lib/amenities';

export interface FloorParkingSpot {
  /** `${unit.id}#${índice}` — una unidad puede tener varias cocheras. */
  key: string;
  unit: Unit;
  spot: UnitParkingSpot;
  center: { x: number; y: number };
}

/** Cocheras dibujadas sobre el plano de un piso, con su unidad dueña. */
export function parkingSpotsOnFloor(units: Unit[], floorId: string): FloorParkingSpot[] {
  const out: FloorParkingSpot[] = [];
  for (const unit of units) {
    (unit.parkingSpots ?? []).forEach((spot, i) => {
      if (spot.floorId !== floorId || spot.polygon.length < 3) return;
      out.push({ key: `${unit.id}#${i}`, unit, spot, center: polygonCenter(spot.polygon) });
    });
  }
  return out.sort((a, b) => spotLabel(a).localeCompare(spotLabel(b), 'es', { numeric: true }));
}

export function spotLabel(s: Pick<FloorParkingSpot, 'spot' | 'unit'>): string {
  return s.spot.label || `Cochera ${s.unit.name}`;
}

/** Amenities ubicadas en algún piso de esta torre (tienen floorId de uno de sus pisos). */
export function amenitiesPlacedIn(amenities: Amenity[], floors: Floor[]): Amenity[] {
  const ids = new Set(floors.map(f => f.id));
  return amenities.filter(a => a.floorId && ids.has(a.floorId) && a.pin);
}

export function floorName(floor: Pick<Floor, 'number' | 'label'>): string {
  if (floor.label) return floor.label;
  return floor.number === 0 ? 'Planta baja' : `Piso ${floor.number}`;
}

/** "Cowork en piso 5 · Piscina, Gimnasio y SUM en piso 10" — agrupado por piso, de abajo hacia arriba. */
export function amenitiesWhereLabel(placed: Amenity[], floors: Floor[]): string {
  const byFloor = new Map<string, string[]>();
  for (const a of placed) byFloor.set(a.floorId!, [...(byFloor.get(a.floorId!) ?? []), a.name]);
  return floors
    .filter(f => byFloor.has(f.id))
    .sort((a, b) => a.number - b.number)
    .map(f => `${joinNames(byFloor.get(f.id)!)} en ${floorName(f).replace(/^Piso\b/, 'piso')}`)
    .join(' · ');
}

function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} y ${names[names.length - 1]}`;
}

/** El piso de la torre con más amenities ubicadas — a donde lleva "ver amenities". */
export function mainAmenityFloor(placed: Amenity[], floors: Floor[]): Floor | undefined {
  let best: Floor | undefined;
  let bestCount = 0;
  for (const f of floors) {
    const n = placed.filter(a => a.floorId === f.id).length;
    if (n > bestCount) { best = f; bestCount = n; }
  }
  return best;
}
