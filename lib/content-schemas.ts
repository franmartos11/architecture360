import { z } from 'zod';
import { LEAD_STATUSES, POI_CATEGORIES } from '@/lib/validate';
import { finite, nullable, safeUrl, polygon, idString } from '@/lib/schema-parts';

// Forma y topes de lo que el panel manda al crear o editar vistas aéreas,
// hotspots, puntos de interés, el estado de un lead y el proyecto activo. Mismo
// criterio que lib/unit-schema y lib/structure-schemas: topes generosos, null
// para lo vacío, URLs sin javascript:, y las claves que no están acá se descartan.

// ─── Vistas aéreas ──────────────────────────────────────────────────
const aerialSlideFields = {
  imageUrl: safeUrl,
  videoUrl: nullable(safeUrl), // '' se guarda como null (la ruta lo normaliza)
  label: z.string().max(500),
  sortOrder: finite(-1_000_000, 1_000_000),
};

/** POST /api/admin/aerial-slides (imageUrl y label los exige la ruta con su mensaje). */
export const aerialSlideCreateSchema = z.object(aerialSlideFields).partial();
/** PATCH /api/admin/aerial-slides/[id]. */
export const aerialSlidePatchSchema = z.object(aerialSlideFields).partial();

// ─── Hotspots de las vistas aéreas ──────────────────────────────────
// x/y: posición en % sobre la imagen. El polígono es la silueta de la torre.
const hotspotFields = {
  slideId: idString,
  buildingId: idString,
  x: finite(-1000, 1000),
  y: finite(-1000, 1000),
  polygon: nullable(polygon),
};

/** POST /api/admin/aerial-hotspots. */
export const aerialHotspotCreateSchema = z.object({
  slideId: hotspotFields.slideId,
  buildingId: hotspotFields.buildingId,
  x: hotspotFields.x,
  y: hotspotFields.y,
  polygon: hotspotFields.polygon.optional(),
});
/** PATCH /api/admin/aerial-hotspots/[id]. */
export const aerialHotspotPatchSchema = z.object({
  buildingId: hotspotFields.buildingId,
  x: hotspotFields.x,
  y: hotspotFields.y,
  polygon: hotspotFields.polygon,
}).partial();
/** POST /api/admin/aerial-hotspots/bulk: una tanda de hasta 200 hotspots. */
export const aerialHotspotBulkSchema = z.object({
  items: z.array(aerialHotspotCreateSchema).min(1).max(200),
});

// ─── Puntos de interés ──────────────────────────────────────────────
// Los minutos a pie/auto/bici los manda el panel como número, pero la ruta los
// convierte con Number(…): se acepta también un número escrito como texto.
const minutes = nullable(z.union([finite(0, 100_000), z.string().regex(/^\d{1,6}(\.\d+)?$/, 'Minutos inválidos')]));

const poiFields = {
  name: z.string().max(500),
  category: z.enum(POI_CATEGORIES),
  description: nullable(z.string().max(2000)),
  distanceLabel: nullable(z.string().max(300)),
  image: nullable(safeUrl),
  latitude: nullable(finite(-90, 90)),
  longitude: nullable(finite(-180, 180)),
  walkMinutes: minutes,
  driveMinutes: minutes,
  bikeMinutes: minutes,
  sortOrder: finite(-1_000_000, 1_000_000),
};

/** POST /api/admin/points-of-interest (name lo exige la ruta con su mensaje). */
export const poiCreateSchema = z.object(poiFields).partial();
/** PATCH /api/admin/points-of-interest/[id]. */
export const poiPatchSchema = z.object(poiFields).partial();

// ─── Leads ──────────────────────────────────────────────────────────
/** PATCH /api/admin/leads/[id]: hoy solo cambia el estado. */
export const leadPatchSchema = z.object({ status: z.enum(LEAD_STATUSES) }).partial();

// ─── Proyecto activo ────────────────────────────────────────────────
/** POST /api/admin/active-project: el id termina en una cookie, así que tiene que ser un texto acotado. */
export const activeProjectSchema = z.object({ projectId: idString.min(1) });

// ─── Alta de proyecto ───────────────────────────────────────────────
/** POST /api/admin/projects (los enums y la combinación los valida la ruta con sus mensajes). */
export const projectCreateSchema = z.object({
  name: z.string().max(500),
  projectType: z.string().max(50),
  saleMode: z.string().max(50),
}).partial();

// ─── Colaboradores acreditados ──────────────────────────────────────
/** POST /api/admin/collaborators: acreditar a una cuenta por su handle (la ruta exige el handle con su mensaje). */
export const collaboratorInviteSchema = z.object({
  handle: z.string().max(100),
  contribution: nullable(z.string().max(1000)),
}).partial();
/** PATCH /api/admin/collaborators/[id]. */
export const collaboratorPatchSchema = z.object({ contribution: nullable(z.string().max(1000)) }).partial();
/** PATCH /api/collaborators/[id]/respond: la persona acreditada acepta o rechaza. */
export const collaboratorRespondSchema = z.object({ status: z.enum(['accepted', 'declined']) }).partial();

