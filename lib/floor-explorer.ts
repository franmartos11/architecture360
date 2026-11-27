import { etiquetaPiso } from '@/lib/i18n/catalogo';
import type { Amenity, Floor, Unit, UnitParkingSpot } from '@/types';
import { polygonCenter } from '@/lib/amenities';
import type { Locale } from '@/lib/i18n/locales';
import { crearT } from '@/lib/i18n/t';

export interface FloorParkingSpot {
  /** `${unit.id}#${índice}` — una unidad puede tener varias cocheras. */
  key: string;
  unit: Unit;
  spot: UnitParkingSpot;
  center: { x: number; y: number };
}

/** Cocheras dibujadas sobre el plano de un piso, con su unidad dueña. */
export function parkingSpotsOnFloor(units: Unit[], floorId: string, locale: Locale = 'es'): FloorParkingSpot[] {
  const out: FloorParkingSpot[] = [];
  for (const unit of units) {
    (unit.parkingSpots ?? []).forEach((spot, i) => {
      if (spot.floorId !== floorId || spot.polygon.length < 3) return;
      out.push({ key: `${unit.id}#${i}`, unit, spot, center: polygonCenter(spot.polygon) });
    });
  }
  return out.sort((a, b) => spotLabel(a, locale).localeCompare(spotLabel(b, locale), locale, { numeric: true }));
}

export function spotLabel(s: Pick<FloorParkingSpot, 'spot' | 'unit'>, locale: Locale = 'es'): string {
  return s.spot.label || crearT(locale)('plano.cocheraN', { nombre: s.unit.name });
}

/** Amenities ubicadas en algún piso de esta torre (tienen floorId de uno de sus pisos). */
export function amenitiesPlacedIn(amenities: Amenity[], floors: Floor[]): Amenity[] {
  const ids = new Set(floors.map(f => f.id));
  return amenities.filter(a => a.floorId && ids.has(a.floorId) && a.pin);
}

/** Nombre del piso: la etiqueta cargada (dato de la desarrolladora) o "Planta baja" / "Piso N" en el idioma pedido. */
export function floorName(floor: Pick<Floor, 'number' | 'label'>, locale: Locale = 'es'): string {
  // Los que genera la plataforma ("Piso 3", "Planta baja") salen en el idioma del sitio.
  if (floor.label) return etiquetaPiso(floor.label, locale);
  const t = crearT(locale);
  return floor.number === 0 ? t('plano.piso.plantaBaja') : t('plano.piso.n', { n: floor.number });
}

/** "Cowork en piso 5 · Piscina, Gimnasio y SUM en piso 10" — agrupado por piso, de abajo hacia arriba. */
export function amenitiesWhereLabel(placed: Amenity[], floors: Floor[], locale: Locale = 'es'): string {
  const t = crearT(locale);
  const piso = t('plano.piso.n', { n: '' }).trim();
  const byFloor = new Map<string, string[]>();
  for (const a of placed) byFloor.set(a.floorId!, [...(byFloor.get(a.floorId!) ?? []), a.name]);
  return floors
    .filter(f => byFloor.has(f.id))
    .sort((a, b) => a.number - b.number)
    .map(f => {
      const nombre = floorName(f, locale);
      // "Piso 5" va en minúscula dentro de la frase; una etiqueta propia ("Terraza") queda igual.
      const enFrase = nombre.startsWith(`${piso} `) ? piso.toLowerCase() + nombre.slice(piso.length) : nombre;
      return t('plano.piso.amenitiesEn', { nombres: joinNames(byFloor.get(f.id)!, locale), piso: enFrase });
    })
    .join(' · ');
}

function joinNames(names: string[], locale: Locale): string {
  if (names.length <= 1) return names[0] ?? '';
  return crearT(locale)('plano.piso.y', { lista: names.slice(0, -1).join(', '), ultimo: names[names.length - 1] });
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
