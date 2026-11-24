import type { Room, UnitLevel } from '@/types';

// Plantas de una unidad multinivel (dúplex, casa de 2+ pisos).
//
// La planta baja vive en las columnas de siempre de la unidad
// (room_plan_image = plano, floor_plan_3d_url = render); cada planta de más
// es un elemento de `levels` (planImage / plan3dImage). Acá se unifica eso
// bajo un índice de planta: 0 = planta baja, k = levels[k-1].

/** Nombre por defecto de la planta extra `index` (1-based). */
export function levelLabel(index: number, floorsCount: number): string {
  return floorsCount === 2 ? 'Planta alta' : `Piso ${index}`;
}

/** Nombre por defecto de una planta (0 = planta baja). */
export function plantaLabel(planta: number, floorsCount: number): string {
  return planta === 0 ? 'Planta baja' : levelLabel(planta, floorsCount);
}

/**
 * Niveles extra completos para `floorsCount` plantas: conserva los
 * existentes tal cual y agrega vacíos para los que falten. Nunca recorta
 * (bajar la cantidad de plantas no borra lo cargado).
 */
export function ensureLevels(levels: UnitLevel[] | null | undefined, floorsCount: number): UnitLevel[] {
  const current = levels ?? [];
  const total = Math.max(current.length, floorsCount - 1);
  return Array.from({ length: total }, (_, i) => current[i] ?? {
    id: `piso-${i + 1}`,
    label: levelLabel(i + 1, floorsCount),
    planImage: null,
    plan3dImage: null,
    rooms: [],
  });
}

export type SlotKind = 'plano' | 'render';

export interface LevelUnitLike {
  code: string;
  floors_count: number;
  room_plan_image: string | null;
  floor_plan_3d_url: string | null;
  levels: UnitLevel[] | null;
}

/** Cantidad de plantas de la unidad, contando niveles cargados de más. */
function plantasOf(u: LevelUnitLike): number {
  return Math.max(1, u.floors_count, (u.levels?.length ?? 0) + 1);
}

export function readSlot(u: LevelUnitLike, planta: number, kind: SlotKind): string | null {
  if (planta === 0) return (kind === 'plano' ? u.room_plan_image : u.floor_plan_3d_url) || null;
  const lvl = u.levels?.[planta - 1];
  if (!lvl) return null;
  return (kind === 'plano' ? lvl.planImage : lvl.plan3dImage) || null;
}

/**
 * Valor compartido de un casillero entre las unidades de un modelo: el
 * primero cargado, y qué unidades tienen otro distinto (esas no se pisan).
 */
export function modelSlotValue(units: LevelUnitLike[], planta: number, kind: SlotKind): { value: string | null; differing: string[] } {
  let value: string | null = null;
  const differing: string[] = [];
  for (const u of units) {
    const v = readSlot(u, planta, kind);
    if (!v) continue;
    if (value === null) value = v;
    else if (v !== value) differing.push(u.code);
  }
  return { value, differing };
}

/** Qué unidades tienen `value` en ese casillero y cuáles lo tienen vacío. */
export function slotCoverage(units: LevelUnitLike[], planta: number, kind: SlotKind, value: string): { have: string[]; empty: string[] } {
  const have: string[] = [];
  const empty: string[] = [];
  for (const u of units) {
    const v = readSlot(u, planta, kind);
    if (v === value) have.push(u.code);
    else if (!v) empty.push(u.code);
  }
  return { have, empty };
}

export type PlantaValues = { plano?: string | null; render?: string | null }[];

export interface FillPlantasResult {
  patch: { roomPlanImage?: string; floorPlan3dUrl?: string; levels?: UnitLevel[] };
  kept: { planta: number; kind: SlotKind }[];
  filled: number;
}

/**
 * Completa los casilleros vacíos de una unidad con `values` (índice =
 * planta). Lo ya cargado con otro valor se mantiene y se informa en `kept`
 * — salvo que sea el valor que el modelo compartía (`previous`): eso no es
 * algo cargado a mano en esta unidad, y reemplazarlo es lo que permite
 * corregir una imagen aplicada por error.
 */
export function fillPlantas(u: LevelUnitLike, values: PlantaValues, previous: PlantaValues = []): FillPlantasResult {
  const patch: FillPlantasResult['patch'] = {};
  const kept: FillPlantasResult['kept'] = [];
  let filled = 0;
  const total = Math.min(values.length, plantasOf(u));
  let levels: UnitLevel[] | null = null;

  for (let planta = 0; planta < total; planta++) {
    for (const kind of ['plano', 'render'] as const) {
      const next = values[planta]?.[kind];
      if (!next) continue;
      const current = readSlot(u, planta, kind);
      if (current === next) continue;
      if (current && current !== previous[planta]?.[kind]) { kept.push({ planta, kind }); continue; }
      filled++;
      if (planta === 0) {
        if (kind === 'plano') patch.roomPlanImage = next; else patch.floorPlan3dUrl = next;
        continue;
      }
      levels ??= ensureLevels(u.levels, plantasOf(u));
      const i = planta - 1;
      levels[i] = { ...levels[i], ...(kind === 'plano' ? { planImage: next } : { plan3dImage: next }) };
    }
  }
  if (levels) patch.levels = levels;
  return { patch, kept, filled };
}

// ─── Ambientes de una casa agrupados por planta ─────────────────────
// El flujo guiado de Casa edita todos los ambientes en una sola lista con
// un `group` por ambiente: 'pb' / 'ext' (se guardan en units.rooms) o
// 'nivel-k' (se guardan en levels[k-1].rooms, que es lo que lee el sitio).

type GroupedRoom = Room & { group?: string };

/** Lista única para editar: planta baja + ambientes de cada nivel con su group. */
export function roomsWithGroups<T extends GroupedRoom>(rooms: T[] | null, levels: UnitLevel[] | null): T[] {
  // Lo guardado en units.rooms ES planta baja: sin group (lo cargaron otros
  // editores) queda en 'pb'; 'pa' es el formato viejo del flujo guiado.
  const base = (rooms ?? []).map(r => (r.group === 'pa' ? { ...r, group: 'nivel-1' } : r.group ? r : { ...r, group: 'pb' }));
  const upper = (levels ?? []).flatMap((l, i) => (l.rooms as T[]).map(r => ({ ...r, group: `nivel-${i + 1}` })));
  return [...base, ...upper];
}

/** Inversa de roomsWithGroups: reparte por group sin tocar plano/render de cada nivel. */
export function splitRoomsByGroup<T extends GroupedRoom>(rooms: T[], levels: UnitLevel[] | null, floorsCount: number): { rooms: T[]; levels: UnitLevel[]; floorsCount: number } {
  const levelOf = (r: T) => {
    const m = /^nivel-(\d+)$/.exec(r.group ?? '');
    return m ? Number(m[1]) : 0;
  };
  const maxLevel = Math.max(0, ...rooms.map(levelOf));
  // Solo los niveles que ya existían o que usa algún ambiente: no se
  // inventa una planta vacía (el sitio la mostraría "sin plano").
  const keep = Math.max(levels?.length ?? 0, maxLevel);
  const next = ensureLevels(levels, Math.max(floorsCount, maxLevel + 1)).slice(0, keep).map(l => ({ ...l, rooms: [] as Room[] }));
  const base: T[] = [];
  for (const r of rooms) {
    const k = levelOf(r);
    if (k === 0) base.push(r); else next[k - 1].rooms.push(r);
  }
  // Si quedan más niveles que plantas declaradas (p. ej. un 'pa' viejo en
  // una casa de 1 planta) se sube la cantidad: si no, los editores, que
  // dimensionan las plantas por floors_count, no mostrarían ese nivel.
  return { rooms: base, levels: next, floorsCount: Math.max(floorsCount, next.length + 1) };
}
