import { z } from 'zod';
import { finite, nullable, safeUrl, point, polygon, bounded, tourData, idString } from '@/lib/schema-parts';

// Forma y topes de lo que el panel manda al crear o editar edificios, pisos y
// amenities. Mismo criterio que lib/unit-schema: topes generosos, null para lo
// vacío, URLs sin javascript:, y las claves que no están acá se descartan.

// ─── Edificios ──────────────────────────────────────────────────────
const buildingFields = {
  name: z.string().min(1).max(300),
  totalFloors: finite(0, 1000),
  amenitiesTour: nullable(tourData),
  coverImage: nullable(safeUrl),
  tourOrientationDegrees: nullable(finite(0, 360)),
};

/** PATCH /api/admin/buildings/[id]. El slug queda afuera a propósito: es inmutable. */
export const buildingPatchSchema = z.object(buildingFields).partial();

/** POST /api/admin/buildings. */
export const buildingCreateSchema = z.object({
  name: buildingFields.name,
  totalFloors: buildingFields.totalFloors.optional(),
  planImage: nullable(safeUrl).optional(),
});

// ─── Pisos ──────────────────────────────────────────────────────────
const FLOOR_KINDS = ['units', 'amenity', 'offices', 'technical', 'parking', 'other'] as const;

// Un marcador de unidad sobre el plano del piso (UnitDot). Los campos extra
// (color, estilo, polígono…) pasan; el tamaño total está acotado.
const unitDot = z.looseObject({ unitId: z.string().max(200), x: finite(-1000, 1000), y: finite(-1000, 1000) });

const floorFields = {
  number: finite(-1000, 10_000),
  label: z.string().min(1).max(300),
  planImage: nullable(safeUrl),
  unitDots: bounded(z.array(unitDot).max(1000), 300_000),
  floorKind: z.enum(FLOOR_KINDS),
  floorKindDescription: nullable(z.string().max(1000)),
};

/** PATCH /api/admin/floors/[id]. */
export const floorPatchSchema = z.object(floorFields).partial();

/** POST /api/admin/floors. */
export const floorCreateSchema = z.object({
  buildingId: idString.min(1),
  number: floorFields.number,
  label: floorFields.label,
  planImage: floorFields.planImage.optional(),
  unitDots: floorFields.unitDots.optional(),
  floorKind: floorFields.floorKind.optional(),
  floorKindDescription: floorFields.floorKindDescription.optional(),
});

// ─── Amenities ──────────────────────────────────────────────────────
const spec = z.object({ key: z.string().max(200), value: z.string().max(500) });

const amenityFields = {
  buildingId: nullable(idString),
  name: z.string().min(1).max(500),
  description: nullable(z.string().max(5000)),
  images: z.array(safeUrl).max(50),
  category: nullable(z.string().max(200)),
  specs: z.array(spec).max(100),
  location: nullable(z.string().max(300)),
  floorId: nullable(idString),
  pin: nullable(point),
  polygon: nullable(polygon),
  tourNodeId: nullable(z.string().max(200)),
  tour3dUrl: nullable(safeUrl),
  sortOrder: finite(-1_000_000, 1_000_000),
  visible: z.boolean(),
};

/** PATCH /api/admin/amenities/[id]. */
export const amenityPatchSchema = z.object(amenityFields).partial();

/** POST /api/admin/amenities. */
export const amenityCreateSchema = z.object(amenityFields).partial().required({ name: true });
