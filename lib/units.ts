import type { Unit, Room, RoomKind } from '@/types';

// Utilidades de unidades usadas en todo el sitio (producción y admin) —
// antes vivían en data/mockData.ts, que en realidad es solo datos de
// demo; separadas acá para que el nombre del archivo no confunda.

// Nota: recibe la lista de unidades como parámetro (en vez de leer un
// array del módulo) para poder reusarse tanto con datos mock como con
// las unidades ya traídas de Supabase (ver data/project-repository.ts).
export function getUnitsByBuildingAndFloor(unitList: Unit[], buildingId: string, floor: number): Unit[] {
  return unitList.filter(u => u.buildingId === buildingId && u.floor === floor);
}

// Locale por moneda para que el separador de miles/decimales y la posición
// del símbolo salgan como se esperan en cada mercado — USD sigue en
// 'en-US' (comportamiento de siempre) para no cambiarle el formato a las
// unidades ya cargadas que no tocaron este campo nuevo.
const CURRENCY_LOCALE: Record<string, string> = {
  USD: 'en-US',
  ARS: 'es-AR',
  EUR: 'de-DE',
  UYU: 'es-UY',
  BRL: 'pt-BR',
  CLP: 'es-CL',
  MXN: 'es-MX',
  COP: 'es-CO',
  PEN: 'es-PE',
};

export function formatPrice(price: number, currency: string = 'USD'): string {
  const locale = CURRENCY_LOCALE[currency] ?? 'en-US';
  return new Intl.NumberFormat(locale, { style: 'currency', currency, maximumFractionDigits: 0 }).format(price);
}

export function getStatusLabel(status: string): string {
  return { available: 'Disponible para vender', reserved: 'Reservado', sold: 'Vendido' }[status] || status;
}

// Tipología de una unidad derivada de sus dormitorios — para casas, que no
// eligen de una lista fija (una casa puede tener 4, 5, 6+ dormitorios).
// Genera los mismos strings que ya usa el catálogo de departamentos para
// los primeros valores, así los filtros públicos agrupan bien.
export function deriveUnitType(bedrooms: number): string {
  const n = Math.max(0, Math.floor(bedrooms || 0));
  if (n === 0) return 'monoambiente';
  if (n === 1) return '1 dormitorio';
  return `${n} dormitorios`;
}

// ─── Orientación ───────────────────────────────────────────────────
// Se carga en un solo lugar: la brújula del paso "Datos" (para casa).
// Se guarda en units.orientation como los grados hacia donde MIRA la
// unidad (texto, ej. "45"). Valores viejos son un cardinal libre ("NE").

const CARDINALS_8 = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];

export function bearingToCardinal(deg: number): string {
  const norm = ((deg % 360) + 360) % 360;
  return CARDINALS_8[Math.round(norm / 45) % 8];
}

// Devuelve los grados de mira (para el visor 360° / indicador de sol) y el
// cardinal para mostrar. Un valor viejo no numérico se toma como cardinal.
export function parseOrientation(raw: string | null | undefined): { degrees?: number; cardinal?: string } {
  if (!raw) return {};
  const n = Number(raw);
  if (Number.isFinite(n) && raw.trim() !== '') {
    const deg = ((n % 360) + 360) % 360;
    return { degrees: deg, cardinal: bearingToCardinal(deg) };
  }
  return { cardinal: raw };
}

// Etiqueta para mostrar una tipología cualquiera (conocida o derivada) —
// reemplaza al viejo Record exhaustivo, que se rompía apenas aparecía un
// valor fuera del enum (ej. "5 dormitorios").
export function unitTypeLabel(type: string): string {
  if (!type) return '';
  return type.charAt(0).toUpperCase() + type.slice(1);
}

// ─── Programa de ambientes de una casa ─────────────────────────────

export const ROOM_KIND_LABEL: Record<RoomKind, string> = {
  bedroom: 'Dormitorio',
  bathroom: 'Baño',
  kitchen: 'Cocina',
  living: 'Living',
  dining: 'Comedor',
  studio: 'Escritorio',
  laundry: 'Lavadero',
  storage: 'Depósito',
  other: 'Ambiente',
};

// Características ofrecidas según el tipo de ambiente — así una cocina no
// muestra "En suite" ni un depósito "Con placard".
export const ROOM_FEATURES_BY_KIND: Record<RoomKind, string[]> = {
  bedroom: ['En suite', 'Con placard', 'Vestidor', 'Con balcón', 'Aire acondicionado'],
  bathroom: ['Con bañera', 'Con ducha', 'Toilette', 'Doble bacha'],
  kitchen: ['Isla', 'Desayunador', 'Integrada al living', 'Con lavadero'],
  living: ['Con balcón', 'Con hogar', 'Doble altura', 'Aire acondicionado'],
  dining: ['Integrado al living', 'Con balcón'],
  studio: ['Con placard', 'Con balcón', 'Aire acondicionado'],
  laundry: ['Con pileta', 'Con guardado'],
  storage: [],
  other: ['Con balcón', 'Aire acondicionado'],
};

export function roomFeatureOptions(kind: RoomKind | undefined): string[] {
  return ROOM_FEATURES_BY_KIND[kind ?? 'other'] ?? [];
}

// ─── Comodidades de una casa (Unit.features) ────────────────────────
// Lista libre de tags — agregar una opción nueva es sumarla acá, sin
// tocar la base (la columna es text[]). Se muestra como chips agrupados
// en el form de "Datos" y en el visor público.
export const UNIT_FEATURE_GROUPS: { label: string; options: string[] }[] = [
  { label: 'Exteriores', options: ['Patio', 'Jardín', 'Pileta', 'Quincho', 'Parrilla', 'Terraza'] },
  { label: 'Climatización', options: ['Losa radiante', 'Radiadores', 'Tiro balanceado', 'Aire split', 'Aire central'] },
  { label: 'Otros', options: ['Amoblada', 'Semiamoblada', 'Cocina equipada', 'Gas natural', 'Apto crédito'] },
];

export const ALL_UNIT_FEATURES: string[] = UNIT_FEATURE_GROUPS.flatMap(g => g.options);

// Estado / antigüedad de la casa.
export const UNIT_CONDITION_OPTIONS: { value: NonNullable<Unit['condition']>; label: string }[] = [
  { value: 'a_estrenar', label: 'A estrenar' },
  { value: 'en_construccion', label: 'En construcción' },
  { value: 'en_pozo', label: 'En pozo' },
  { value: 'usada', label: 'Usada' },
];

export function unitConditionLabel(condition: Unit['condition'] | null | undefined): string {
  return UNIT_CONDITION_OPTIONS.find(o => o.value === condition)?.label ?? '';
}

// "2 cocheras (1 cubierta, 1 descubierta)" — usa el desglose si está, y si
// no cae al par viejo garageSpaces/garageType.
export function cocheraLabel(u: Pick<Unit, 'garageSpaces' | 'garageType' | 'garageCovered' | 'garageUncovered'>): string {
  const cov = u.garageCovered ?? 0;
  const unc = u.garageUncovered ?? 0;
  const total = cov + unc || u.garageSpaces || 0;
  if (total === 0) return '';
  const noun = `${total} cochera${total !== 1 ? 's' : ''}`;
  if (cov > 0 && unc > 0) return `${noun} (${cov} cubierta${cov !== 1 ? 's' : ''}, ${unc} descubierta${unc !== 1 ? 's' : ''})`;
  if (cov > 0) return `${noun} cubierta${cov !== 1 ? 's' : ''}`;
  if (unc > 0) return `${noun} descubierta${unc !== 1 ? 's' : ''}`;
  return u.garageType ? `${noun} (${u.garageType})` : noun;
}

// Todos los ambientes de una unidad — la planta baja (rooms) más los de
// cada planta extra (levels[].rooms). Para casas de 2+ pisos, los conteos
// y el display público tienen que sumar todas las plantas, no solo la baja.
export function allProgramRooms(
  rooms: Room[] | null | undefined,
  levels?: { rooms: Room[] }[] | null,
): Room[] {
  return [...(rooms ?? []), ...((levels ?? []).flatMap(l => l.rooms ?? []))];
}

// Un ambiente "cuenta" para el programa solo si tiene tipo asignado — los
// que vienen del delimitador viejo (nombre + polígono, sin kind) no.
export function hasRoomProgram(rooms: Room[] | null | undefined): boolean {
  return (rooms ?? []).some(r => !!r.kind);
}

// Conteos por tipo de ambiente — la fuente de verdad cuando hay programa
// cargado (reemplaza a los contadores planos bedrooms/bathrooms/etc.).
export function roomCounts(rooms: Room[] | null | undefined) {
  const r = rooms ?? [];
  const n = (k: RoomKind) => r.filter(x => x.kind === k).length;
  return {
    bedrooms: n('bedroom'),
    bathrooms: n('bathroom'),
    living: n('living'),
    kitchen: n('kitchen'),
    // "otros" = todo lo que no es dormitorio/baño/living/cocina
    other: r.filter(x => x.kind && !['bedroom', 'bathroom', 'living', 'kitchen'].includes(x.kind)).length,
  };
}

// Genera un programa de ambientes a partir de los contadores planos de una
// unidad — para migrar una casa vieja (o el esqueleto recién creado) sin
// que el usuario tenga que tipear cada ambiente de cero. Devuelve [] si no
// hay nada que generar.
export function synthesizeRoomProgram(u: {
  bedrooms?: number; bathrooms?: number; livingRooms?: number; kitchens?: number;
  otherRoomsCount?: number; otherRoomsDescription?: string;
}): Room[] {
  const out: Room[] = [];
  let i = 0;
  const push = (kind: RoomKind, name: string) => out.push({ id: `r-syn-${i++}`, name, kind });
  const many = (kind: RoomKind, count: number, base: string) => {
    const c = Math.max(0, Math.floor(count || 0));
    if (c === 1) push(kind, base);
    else for (let k = 1; k <= c; k++) push(kind, `${base} ${k}`);
  };
  many('bedroom', u.bedrooms ?? 0, 'Dormitorio');
  many('bathroom', Math.round(u.bathrooms ?? 0), 'Baño');
  many('living', u.livingRooms ?? 0, 'Living');
  many('kitchen', u.kitchens ?? 0, 'Cocina');
  const otherName = u.otherRoomsDescription?.trim();
  many('other', u.otherRoomsCount ?? 0, otherName || 'Ambiente');
  return out;
}

export function getStatusColor(status: string): string {
  return { available: '#22c55e', reserved: '#eab308', sold: '#ef4444' }[status] || '#94a3b8';
}

// Score de similitud (0-100) entre dos unidades, para ordenar el picker
// del comparador por "parecido" a la unidad que se está viendo. Pondera
// m² total (lo que más pesa a la hora de comparar dos deptos), dormitorios,
// baños y tipología — nada de esto requiere datos que no tengamos ya.
export function similarityScore(a: Unit, b: Unit): number {
  const areaScore = a.totalArea > 0 && b.totalArea > 0
    ? Math.max(0, 1 - Math.abs(a.totalArea - b.totalArea) / Math.max(a.totalArea, b.totalArea))
    : 0;
  const bedroomsScore = Math.max(0, 1 - Math.abs(a.bedrooms - b.bedrooms) / 3);
  const bathroomsScore = Math.max(0, 1 - Math.abs(a.bathrooms - b.bathrooms) / 3);
  const typeScore = a.type === b.type ? 1 : 0;

  const total = areaScore * 0.5 + bedroomsScore * 0.2 + bathroomsScore * 0.15 + typeScore * 0.15;
  return Math.round(total * 100);
}
