import { z } from 'zod';
import type { Floor, FloorViewPhoto, Unit, ViewDirection } from '@/types';
import { safeUrl } from '@/lib/schema-parts';

// Vista por piso: fotos de lo que se ve desde cada piso, una por orientación
// (relevamiento con drone), y una panorámica 360° opcional. La unidad muestra
// la de su piso y su orientación, o la del piso más cercano que tenga.
// Spec: docs/superpowers/specs/2026-11-24-vista-por-piso-design.md

export const VIEW_DIRECTIONS: ViewDirection[] = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];

export const DIRECTION_LABEL: Record<ViewDirection, string> = {
  N: 'Norte', NE: 'Noreste', E: 'Este', SE: 'Sureste', S: 'Sur', SO: 'Suroeste', O: 'Oeste', NO: 'Noroeste',
};

const DEGREES = Object.fromEntries(VIEW_DIRECTIONS.map((d, i) => [d, i * 45])) as Record<ViewDirection, number>;

export const floorViewPhotoSchema = z.object({
  direction: z.enum(VIEW_DIRECTIONS as [ViewDirection, ...ViewDirection[]]),
  url: safeUrl.pipe(z.string().min(1)),
});

export const floorViewPhotosSchema = z.array(floorViewPhotoSchema).max(VIEW_DIRECTIONS.length)
  .refine(ps => new Set(ps.map(p => p.direction)).size === ps.length, { message: 'Hay dos fotos para la misma orientación.' });

const byCompass = (a: FloorViewPhoto, b: FloorViewPhoto) => DEGREES[a.direction] - DEGREES[b.direction];

/** Lo que viene de la base, a prueba de datos viejos o rotos. */
export function parseStoredViewPhotos(raw: unknown): FloorViewPhoto[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<ViewDirection>();
  return raw.flatMap(p => {
    const r = floorViewPhotoSchema.safeParse(p);
    if (!r.success || seen.has(r.data.direction)) return [];
    seen.add(r.data.direction);
    return [r.data];
  }).sort(byCompass);
}

// Valores viejos de orientación escritos a mano: nombres en castellano o
// siglas en inglés (W/NW/SW).
const ORIENTATION_ALIASES: Record<string, ViewDirection> = {
  NORTE: 'N', NORESTE: 'NE', ESTE: 'E', SURESTE: 'SE', SUR: 'S', SUROESTE: 'SO', OESTE: 'O', NOROESTE: 'NO',
  W: 'O', NW: 'NO', SW: 'SO',
};

/** Hacia dónde mira la unidad, en grados, o null si no se cargó. */
export function unitViewDegrees(u: Pick<Unit, 'orientationDegrees' | 'orientation'> | Partial<Pick<Unit, 'orientationDegrees' | 'orientation'>>): number | null {
  if (typeof u.orientationDegrees === 'number' && Number.isFinite(u.orientationDegrees)) return u.orientationDegrees;
  const raw = u.orientation?.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toUpperCase();
  if (!raw) return null;
  const d = Object.hasOwn(DEGREES, raw) ? (raw as ViewDirection) : Object.hasOwn(ORIENTATION_ALIASES, raw) ? ORIENTATION_ALIASES[raw] : null;
  return d ? DEGREES[d] : null;
}

export interface UnitView {
  floorNumber: number;
  floorLabel: string;
  /** La vista es de otro piso (el de la unidad no tiene). */
  approximate: boolean;
  photos: (FloorViewPhoto & { label: string })[];
  /** Foto con la que arranca: la orientación más cercana a la de la unidad. */
  initialIndex: number;
  panorama?: string;
}

const hasViews = (f: Floor) => (f.viewPhotos?.length ?? 0) > 0 || !!f.viewPanorama;

const angleBetween = (a: number, b: number) => {
  const d = Math.abs((((a - b) % 360) + 360) % 360);
  return Math.min(d, 360 - d);
};

/**
 * Vista para una unidad entre los pisos de su edificio: la de su piso o, si
 * no tiene, la del más cercano (ante empate, el de abajo: no vender una vista
 * mejor que la real). null si ningún piso tiene vistas.
 */
export function pickUnitView(
  floors: Floor[],
  unit: Pick<Unit, 'floorId' | 'floor'> & Partial<Pick<Unit, 'orientationDegrees' | 'orientation'>>,
): UnitView | null {
  const own = floors.find(f => f.id === unit.floorId);
  const candidates = floors.filter(hasViews);
  if (candidates.length === 0) return null;
  const target = own?.number ?? unit.floor;
  const chosen = own && hasViews(own)
    ? own
    : [...candidates].sort((a, b) => Math.abs(a.number - target) - Math.abs(b.number - target) || a.number - b.number)[0];

  const photos = [...(chosen.viewPhotos ?? [])].sort(byCompass).map(p => ({ ...p, label: DIRECTION_LABEL[p.direction] }));
  const deg = unitViewDegrees(unit);
  let initialIndex = 0;
  if (deg !== null && photos.length > 0) {
    initialIndex = photos.reduce((best, p, i) => (angleBetween(DEGREES[p.direction], deg) < angleBetween(DEGREES[photos[best].direction], deg) ? i : best), 0);
  }

  return {
    floorNumber: chosen.number,
    floorLabel: chosen.label,
    approximate: own ? chosen !== own : chosen.number !== unit.floor,
    photos,
    initialIndex,
    panorama: chosen.viewPanorama || undefined,
  };
}
