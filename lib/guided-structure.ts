// Lógica pura de la carga guiada (/admin/carga): arma, a partir de las
// pocas decisiones que toma el usuario en el paso 1 de cada flujo, la
// estructura completa de edificios → pisos → unidades que después se
// inserta de una sola vez (POST /api/admin/guided). Vive separada de la
// ruta para poder probarla sin base y para que la pantalla muestre la
// vista previa ("Así queda") con exactamente los mismos códigos que se
// van a crear.

import type { FloorKind } from '@/types';

export interface PlannedUnit {
  code: string;
  type: string;
  /** Posición dentro del piso tipo (0 = A / 01). null en pisos distintos (PB, PH). */
  position: number | null;
  modelName?: string | null;
  bedrooms?: number;
  bathrooms?: number;
  floorsCount?: number;
  innerArea?: number | null;
  lotSize?: number | null;
  garageSpaces?: number;
}

export interface PlannedFloor {
  number: number;
  label: string;
  floorKind: FloorKind;
  floorKindDescription?: string | null;
  /** 'typical' = piso tipo; 'pb' / 'ph' = los distintos; 'single' = piso invisible de formas sin pisos. */
  role: 'typical' | 'pb' | 'ph' | 'single' | 'level';
  planImage?: string | null;
  units: PlannedUnit[];
}

export interface PlannedBuilding {
  name: string;
  floors: PlannedFloor[];
}

export const MAX_PLANNED_UNITS = 2000;

// ─── Edificio ──────────────────────────────────────────────────────

export type GroundFloorUse = 'none' | 'amenities' | 'locales' | 'cocheras' | 'unidades';
export type NumberingScheme = 'letter' | 'number' | 'custom';

export interface TowerInput {
  name: string;
  /** Pisos tipo (sin contar PB ni PH). */
  floors: number;
  perFloor: number;
  groundFloor: GroundFloorUse;
  /** Penthouses en un último piso distinto — 0 = no hay último piso distinto. */
  penthouses: number;
  /** Pisos tipo con otra cantidad de unidades: número de piso → unidades. */
  floorOverrides?: Record<number, number>;
}

export const GROUND_FLOOR_OPTIONS: { value: GroundFloorUse; label: string }[] = [
  { value: 'none', label: 'Sin planta baja' },
  { value: 'amenities', label: 'Amenities' },
  { value: 'locales', label: 'Locales' },
  { value: 'cocheras', label: 'Cocheras' },
  { value: 'unidades', label: 'Unidades' },
];

export function positionLetter(i: number): string {
  // A..Z, después AA, AB… — más de 26 por piso es raro pero no imposible.
  let n = i;
  let s = '';
  do {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return s;
}

/**
 * Prefijo por torre cuando hay más de una — el sitio público identifica cada
 * unidad por su código, así que "1A" en dos torres sería ambiguo. Usa la
 * inicial de la última palabra del nombre ("Torre Norte" → N); si dos
 * torres chocan, cae a T1, T2…
 */
export function towerPrefixes(names: string[]): string[] {
  if (names.length <= 1) return names.map(() => '');
  const initials = names.map(n => {
    const words = n.trim().split(/\s+/).filter(Boolean);
    const last = words[words.length - 1] ?? '';
    return last.charAt(0).toUpperCase();
  });
  const unique = new Set(initials).size === initials.length && initials.every(i => /^[A-Z0-9]$/.test(i));
  return unique ? initials.map(i => `${i}-`) : names.map((_, i) => `T${i + 1}-`);
}

export function unitCode(scheme: NumberingScheme, floorTag: string, floorNumber: number, position: number, template = '{piso}{letra}'): string {
  if (scheme === 'number') {
    return `${floorTag === String(floorNumber) ? floorNumber : floorTag}${String(position + 1).padStart(2, '0')}`;
  }
  if (scheme === 'custom') {
    const out = template
      .replaceAll('{piso}', floorTag)
      .replaceAll('{letra}', positionLetter(position))
      .replaceAll('{n}', String(position + 1));
    return out.trim() || `${floorTag}${positionLetter(position)}`;
  }
  return `${floorTag}${positionLetter(position)}`;
}

export function planEdificio(towers: TowerInput[], scheme: NumberingScheme, template?: string): PlannedBuilding[] {
  const prefixes = towerPrefixes(towers.map(t => t.name));
  return towers.map((t, ti) => {
    const prefix = prefixes[ti];
    const floors: PlannedFloor[] = [];
    const per = Math.max(1, Math.floor(t.perFloor));

    if (t.groundFloor !== 'none') {
      const units: PlannedUnit[] = t.groundFloor === 'unidades'
        ? Array.from({ length: per }, (_, p) => ({ code: prefix + unitCode(scheme, 'PB', 0, p, template), type: 'Unidad', position: null }))
        : [];
      const kind: Record<Exclude<GroundFloorUse, 'none'>, { floorKind: FloorKind; description: string | null }> = {
        amenities: { floorKind: 'amenity', description: null },
        locales: { floorKind: 'other', description: 'Locales' },
        cocheras: { floorKind: 'parking', description: null },
        unidades: { floorKind: 'units', description: null },
      };
      floors.push({
        number: 0, label: 'Planta baja', role: 'pb',
        floorKind: kind[t.groundFloor].floorKind,
        floorKindDescription: kind[t.groundFloor].description,
        units,
      });
    }

    for (let f = 1; f <= Math.max(0, Math.floor(t.floors)); f++) {
      const override = t.floorOverrides?.[f];
      const count = override !== undefined && override >= 1 ? Math.floor(override) : per;
      floors.push({
        number: f, label: `Piso ${f}`, role: 'typical', floorKind: 'units',
        units: Array.from({ length: count }, (_, p) => ({ code: prefix + unitCode(scheme, String(f), f, p, template), type: 'Unidad', position: p })),
      });
    }

    if (t.penthouses > 0) {
      const n = Math.max(0, Math.floor(t.floors)) + 1;
      floors.push({
        number: n, label: 'Penthouse', role: 'ph', floorKind: 'units',
        units: Array.from({ length: Math.floor(t.penthouses) }, (_, p) => ({ code: `${prefix}PH ${positionLetter(p)}`, type: 'Penthouse', position: null })),
      });
    }

    return { name: t.name.trim() || `Torre ${ti + 1}`, floors };
  });
}

// ─── Dúplex ────────────────────────────────────────────────────────

export interface DuplexModel {
  name: string;
  bedrooms: number;
  bathrooms: number;
  floorsCount: number;
  innerArea: number | null;
  lotSize: number | null;
  garageSpaces: number;
}

/**
 * models.length === 1 → todas las unidades iguales. Si hay más, el modelo
 * va por posición dentro del dúplex (ej. A = frente, B = fondo).
 */
export function planDuplex(count: number, perDuplex: number, models: DuplexModel[], unitModels?: Record<string, number>): PlannedBuilding[] {
  const n = Math.max(1, Math.floor(count));
  const per = Math.max(1, Math.floor(perDuplex));
  return Array.from({ length: n }, (_, d) => ({
    name: `Dúplex ${d + 1}`,
    floors: [{
      number: 1, label: 'Plano', role: 'single' as const, floorKind: 'units' as FloorKind,
      units: Array.from({ length: per }, (_, p) => {
        // Una unidad puntual puede tener otro modelo que el de su posición (unitModels: código → índice).
        const code = `D${d + 1}-${positionLetter(p)}`;
        const forced = unitModels?.[code];
        const idx = forced !== undefined && forced >= 0 && forced < models.length
          ? forced
          : models.length === 1 ? 0 : p % Math.max(1, models.length);
        const m = models[idx];
        return {
          code,
          type: m ? `${m.bedrooms} dormitorio${m.bedrooms === 1 ? '' : 's'}` : 'Unidad',
          position: p,
          modelName: m?.name || null,
          bedrooms: m?.bedrooms ?? 0,
          bathrooms: m?.bathrooms ?? 1,
          floorsCount: m?.floorsCount ?? 2,
          innerArea: m?.innerArea ?? null,
          lotSize: m?.lotSize ?? null,
          garageSpaces: m?.garageSpaces ?? 0,
        };
      }),
    }],
  }));
}

// ─── Loteo ─────────────────────────────────────────────────────────

export interface BlockInput {
  name: string;
  lots: number;
}

export function blockTag(name: string, index: number): string {
  // "Manzana 3" / "Mz 3" / "3" → "Mz3"; cualquier otro nombre → "Mz{n}".
  const m = name.match(/(\d+)\s*$/);
  return `Mz${m ? m[1] : index + 1}`;
}

export function lotCode(blockIndex: number | null, blockName: string | null, lotIndex: number, total: number): string {
  if (blockIndex === null) return `L${String(lotIndex + 1).padStart(Math.max(2, String(total).length), '0')}`;
  return `${blockTag(blockName ?? '', blockIndex)}-L${String(lotIndex + 1).padStart(2, '0')}`;
}

export function planLoteo(opts: { name: string; planImage: string | null; mode: 'blocks' | 'sequential'; blocks: BlockInput[]; totalLots: number }): PlannedBuilding[] {
  const units: PlannedUnit[] = [];
  if (opts.mode === 'sequential') {
    const total = Math.max(1, Math.floor(opts.totalLots));
    for (let i = 0; i < total; i++) units.push({ code: lotCode(null, null, i, total), type: 'Lote', position: i });
  } else {
    opts.blocks.forEach((b, bi) => {
      const lots = Math.max(0, Math.floor(b.lots));
      for (let i = 0; i < lots; i++) units.push({ code: lotCode(bi, b.name, i, lots), type: 'Lote', position: i });
    });
  }
  return [{
    name: opts.name,
    floors: [{ number: 1, label: 'Plano', role: 'single', floorKind: 'units', planImage: opts.planImage, units }],
  }];
}

// ─── Proyecto único ────────────────────────────────────────────────

export interface LevelInput {
  name: string;
  use: string;
  planImage: string | null;
}

/** Los niveles llegan de arriba hacia abajo (como el corte); el de más abajo es el número 0. */
export function planUnico(name: string, levels: LevelInput[]): PlannedBuilding[] {
  const n = levels.length;
  return [{
    name,
    floors: levels.map((l, i) => ({
      number: n - 1 - i,
      label: l.name.trim() || `Nivel ${n - 1 - i}`,
      role: 'level' as const,
      floorKind: 'other' as FloorKind,
      floorKindDescription: l.use.trim() || null,
      planImage: l.planImage,
      units: [],
    })),
  }];
}

export function countUnits(plan: PlannedBuilding[]): number {
  return plan.reduce((s, b) => s + b.floors.reduce((t, f) => t + f.units.length, 0), 0);
}

/** Códigos repetidos dentro del plan — el sitio público identifica las unidades por código. */
export function duplicateCodes(plan: PlannedBuilding[]): string[] {
  const seen = new Set<string>();
  const dup = new Set<string>();
  for (const b of plan) for (const f of b.floors) for (const u of f.units) {
    if (seen.has(u.code)) dup.add(u.code);
    seen.add(u.code);
  }
  return [...dup];
}

// ─── Geometría (planta tipo, loteo) ────────────────────────────────

export type Pt = { x: number; y: number };

export function centroid(points: Pt[]): Pt {
  if (points.length === 0) return { x: 0, y: 0 };
  return {
    x: points.reduce((s, p) => s + p.x, 0) / points.length,
    y: points.reduce((s, p) => s + p.y, 0) / points.length,
  };
}

/** Área por shoelace, en las mismas unidades² que los puntos. */
export function polygonArea(points: Pt[]): number {
  let a = 0;
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const q = points[(i + 1) % points.length];
    a += p.x * q.y - q.x * p.y;
  }
  return Math.abs(a) / 2;
}

/**
 * Superficie real en m² de un polígono dibujado en % sobre una imagen de
 * imgW×imgH px, sabiendo cuántos metros mide el ancho completo de la imagen.
 */
export function polygonAreaM2(points: Pt[], imgW: number, imgH: number, planWidthMeters: number): number | null {
  if (points.length < 3 || imgW <= 0 || imgH <= 0 || planWidthMeters <= 0) return null;
  const mPerPx = planWidthMeters / imgW;
  const px = points.map(p => ({ x: (p.x / 100) * imgW, y: (p.y / 100) * imgH }));
  return Math.round(polygonArea(px) * mPerPx * mPerPx);
}

function lerp(a: Pt, b: Pt, t: number): Pt {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

/**
 * Parte un cuadrilátero (manzana dibujada: 4 esquinas en orden, empezando
 * por la esquina desde la que se numera) en rows × cols lotes por
 * interpolación bilineal. Numeración:
 *  - 'rows': fila por fila, siempre en el mismo sentido.
 *  - 'u':    serpentina — la fila siguiente vuelve en sentido contrario.
 * Devuelve los lotes en orden de numeración, cada uno con flag de esquina.
 */
export function splitQuad(quad: Pt[], rows: number, cols: number, order: 'rows' | 'u' = 'rows'): { points: Pt[]; corner: boolean }[] {
  if (quad.length < 4) return [];
  const [p0, p1, p2, p3] = quad; // p0→p1 = borde superior, p3→p2 = borde inferior
  const R = Math.max(1, Math.floor(rows));
  const C = Math.max(1, Math.floor(cols));
  const at = (u: number, v: number) => lerp(lerp(p0, p1, u), lerp(p3, p2, u), v);
  const round = (p: Pt) => ({ x: Math.round(p.x * 100) / 100, y: Math.round(p.y * 100) / 100 });
  const out: { points: Pt[]; corner: boolean }[] = [];
  for (let r = 0; r < R; r++) {
    const colsOrder = Array.from({ length: C }, (_, c) => (order === 'u' && r % 2 === 1 ? C - 1 - c : c));
    for (const c of colsOrder) {
      const u0 = c / C, u1 = (c + 1) / C, v0 = r / R, v1 = (r + 1) / R;
      out.push({
        points: [at(u0, v0), at(u1, v0), at(u1, v1), at(u0, v1)].map(round),
        corner: (r === 0 || r === R - 1) && (c === 0 || c === C - 1),
      });
    }
  }
  return out;
}

// ─── Precios de loteo ──────────────────────────────────────────────

export interface PriceRule {
  id: string;
  label: string;
  pct: number;
  target: 'corner' | 'blocks' | 'first';
  blocks?: string[];
  first?: number;
}

export interface PricedLot {
  id: string;
  code: string;
  area: number | null;
  corner: boolean;
  block: string | null;
  /** Orden de venta / numeración global — para "primeros N". */
  index: number;
}

export function blockOfCode(code: string): string | null {
  const m = code.match(/^(Mz\d+)-/);
  return m ? m[1] : null;
}

export function priceForLot(lot: PricedLot, basePerM2: number, rules: PriceRule[]): { price: number | null; pct: number } {
  if (!lot.area || basePerM2 <= 0) return { price: null, pct: 0 };
  let pct = 0;
  for (const r of rules) {
    const applies =
      r.target === 'corner' ? lot.corner
      : r.target === 'blocks' ? !!lot.block && (r.blocks ?? []).includes(lot.block)
      : lot.index < (r.first ?? 0);
    if (applies) pct += r.pct;
  }
  const price = Math.round((lot.area * basePerM2 * (1 + pct / 100)) / 100) * 100;
  return { price, pct };
}

/**
 * Lista pegada desde Excel: una fila por lote, "código<TAB>precio" (o con
 * ; o , como separador). Devuelve código → precio; ignora filas que no
 * entiende en vez de fallar toda la pegada.
 */
export function parsePastedPrices(text: string): Map<string, number> {
  const out = new Map<string, number>();
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const parts = line.split(/\t|;|,(?=\s*[\d$])/).map(s => s.trim()).filter(Boolean);
    if (parts.length < 2) continue;
    const code = parts[0];
    const digits = parts[parts.length - 1].replace(/[^\d.,]/g, '');
    // 25.500 / 25,500 / 25500.00 → 25500
    const normalized = /[.,]\d{3}(?:[.,]|$)/.test(digits) ? digits.replace(/[.,](?=\d{3}(?:[.,]|$))/g, '') : digits;
    const n = Number(normalized.replace(',', '.'));
    if (code && Number.isFinite(n) && n > 0) out.set(code, Math.round(n));
  }
  return out;
}

// ─── Casa: fotos por ambiente ──────────────────────────────────────

export type RoomGroup = 'pb' | 'pa' | 'ext';

const EXTERIOR_RE = /exterior|jard[ií]n|pileta|piscina|terraza|patio|quincho|galer[ií]a|parrill|fachada|frente|deck/i;

/** En qué planta va un ambiente si todavía no tiene una asignada. */
export function defaultRoomGroup(room: { name: string; kind?: string }, floorsCount: number, bathIndex = 0): RoomGroup {
  if (EXTERIOR_RE.test(room.name)) return 'ext';
  if (floorsCount <= 1) return 'pb';
  if (room.kind === 'bedroom') return 'pa';
  if (room.kind === 'bathroom') return bathIndex === 0 ? 'pb' : 'pa';
  return 'pb';
}

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/**
 * A qué ambiente va una foto según el nombre del archivo ("dorm2.jpg",
 * "Baño 1 - final.png", "living_noche.jpg"). Devuelve el id o null si no
 * hay un match claro (la foto queda para asignar a mano).
 */
export function matchRoomByFilename(filename: string, rooms: { id: string; name: string; kind?: string }[]): string | null {
  const f = norm(filename.replace(/\.[a-z0-9]+$/i, '')).replace(/[_\-.]+/g, ' ');
  // 1. Nombre exacto del ambiente contenido en el archivo ("cocina", "dormitorio 2"),
  //    como palabra completa: "dormitorio 12" no es "Dormitorio 1" y
  //    "salamandra" no es "Sala".
  const asWord = (name: string) => {
    const n = norm(name).trim().replace(/[_\-.]+/g, ' ').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(^|[^a-z0-9])${n}($|[^a-z0-9])`);
  };
  const byName = [...rooms].sort((a, b) => b.name.length - a.name.length).find(r => r.name.trim() && asWord(r.name).test(f));
  if (byName) return byName.id;
  // 2. Palabras clave por tipo, con número opcional ("dorm2", "bano 3").
  const rules: { re: RegExp; kind: string }[] = [
    { re: /\b(?:dorm(?:itorio)?|habitaci[oó]n|cuarto|suite)\s*(\d+)?/, kind: 'bedroom' },
    { re: /\bba(?:n|ñ)o\s*(\d+)?|\btoilette?\b/, kind: 'bathroom' },
    { re: /\bcocina\s*(\d+)?|\bkitchen\b/, kind: 'kitchen' },
    { re: /\bliving\s*(\d+)?|\bestar\b|\bsala\b/, kind: 'living' },
    { re: /\bcomedor\s*(\d+)?/, kind: 'dining' },
    { re: /\blavadero\s*(\d+)?|\blaundry\b/, kind: 'laundry' },
    { re: /\bestudio\s*(\d+)?|\boficina\b/, kind: 'studio' },
  ];
  for (const { re, kind } of rules) {
    const m = f.match(re);
    if (!m) continue;
    const ofKind = rooms.filter(r => r.kind === kind);
    if (ofKind.length === 0) continue;
    const n = m[1] ? Number(m[1]) : null;
    if (n !== null) return ofKind[n - 1]?.id ?? null;
    return ofKind.length === 1 ? ofKind[0].id : null;
  }
  if (EXTERIOR_RE.test(f)) {
    const ext = rooms.find(r => EXTERIOR_RE.test(r.name));
    if (ext) return ext.id;
  }
  return null;
}
