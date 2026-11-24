import type { PoiCategory } from '@/types';

// Lógica pura del buscador de lugares (Places API New) del admin — sin
// fetch ni DOM, la usan la ruta /api/admin/places-search y el panel de
// búsqueda de Ubicación.

export interface PlaceResult {
  placeId: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  category: PoiCategory;
}

// Orden importa: el primer grupo que matchee gana. Salud va antes que
// comercio porque Google marca las farmacias también como `store`.
const CATEGORY_TYPES: [PoiCategory, string[]][] = [
  ['colegio', ['school', 'primary_school', 'secondary_school', 'preschool', 'university', 'educational_institution']],
  ['salud', ['hospital', 'doctor', 'pharmacy', 'drugstore', 'dentist', 'dental_clinic', 'medical_lab', 'physiotherapist']],
  ['transporte', ['bus_station', 'bus_stop', 'train_station', 'subway_station', 'transit_station', 'light_rail_station', 'airport', 'taxi_stand']],
  ['comercio', ['supermarket', 'grocery_store', 'shopping_mall', 'store', 'convenience_store', 'department_store', 'bakery', 'market']],
  ['entretenimiento', ['park', 'gym', 'sports_club', 'stadium', 'sports_complex', 'movie_theater', 'amusement_park', 'night_club', 'tourist_attraction']],
];

export function categoryFromGoogleTypes(types: string[] | undefined): PoiCategory {
  if (!types?.length) return 'otro';
  for (const [category, list] of CATEGORY_TYPES) {
    if (types.some(t => list.includes(t))) return category;
  }
  return 'otro';
}

export function distanceMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function formatDistance(m: number): string {
  if (m < 1000) return `${Math.round(m)} m`;
  return `${(m / 1000).toFixed(1).replace('.', ',')} km`;
}

function normalizeName(s: string): string {
  return s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim().replace(/\s+/g, ' ');
}

const SAME_PLACE_METERS = 50;

// Un resultado de Google cuenta como "ya agregado" si hay un POI con el
// mismo nombre (sin tildes/mayúsculas) a menos de 50 m — el nombre solo no
// alcanza (cadenas de farmacias), la distancia sola tampoco (galerías).
export function isAlreadyAdded(
  place: { name: string; lat: number; lng: number },
  pois: { name: string; latitude: number | null; longitude: number | null }[],
): boolean {
  const name = normalizeName(place.name);
  return pois.some(p =>
    p.latitude != null && p.longitude != null &&
    normalizeName(p.name) === name &&
    distanceMeters({ lat: p.latitude, lng: p.longitude }, place) < SAME_PLACE_METERS
  );
}
