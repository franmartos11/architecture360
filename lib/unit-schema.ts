import { z } from 'zod';
import { UNIT_STATUSES, UNIT_CATEGORIES } from '@/lib/validate';
import { finite, nullable, safeUrl, polygon, bounded, tourData } from '@/lib/schema-parts';

// Forma y topes de lo que el panel manda al crear o editar una unidad
// (POST /api/admin/units y PATCH /api/admin/units/[id]).
//
// Antes el body iba tal cual a la columna: un número negativo, un texto de
// varios MB o un jsonb arbitrario entraban a la base y después se servían (con
// caché) a cada visitante del sitio público. Los topes son generosos a propósito
// —ningún proyecto real se acerca— porque lo que se busca es cortar lo absurdo,
// no limitar lo legítimo; y el panel manda los números ya convertidos (Number(…)),
// con null para lo vacío.
//
// Las claves que no están acá se descartan (zod las saca del resultado): coincide
// con el FIELD_MAP de la ruta, que ya ignoraba lo desconocido.

const room = z.looseObject({ id: z.string().max(100), name: z.string().max(200) });
const level = z.looseObject({ id: z.string().max(100), label: z.string().max(200), rooms: z.array(room).max(200) });
const parkingSpot = z.looseObject({ floorId: z.string().max(100), polygon });

// Tope de tamaño de los jsonb grandes de la unidad (el del tour está en schema-parts).
const MAX_BYTES = { rooms: 200_000, levels: 400_000, parkingSpots: 200_000 } as const;

export const unitFieldsSchema = z.object({
  code: z.string().min(1).max(200),
  modelName: nullable(z.string().max(500)),
  type: z.string().min(1).max(100),
  category: z.enum(UNIT_CATEGORIES),
  totalArea: nullable(finite(0, 1_000_000)),
  innerArea: nullable(finite(0, 1_000_000)),
  balconyArea: finite(0, 1_000_000),
  externalArea: finite(0, 1_000_000),
  bedrooms: finite(0, 1000),
  bathrooms: finite(0, 1000),
  hasServiceRoom: z.boolean(),
  lotSize: nullable(finite(0, 1_000_000_000)),
  ceilingHeight: nullable(finite(0, 1000)),
  garageSpaces: finite(0, 1000),
  garageType: nullable(z.enum(['cubierta', 'descubierta'])),
  garageCovered: finite(0, 1000),
  garageUncovered: finite(0, 1000),
  condition: nullable(z.enum(['a_estrenar', 'en_construccion', 'en_pozo', 'usada'])),
  features: z.array(z.string().max(100)).max(50),
  livingRooms: finite(0, 1000),
  kitchens: finite(0, 1000),
  otherRoomsCount: finite(0, 1000),
  otherRoomsDescription: nullable(z.string().max(1000)),
  hoaFee: nullable(finite(0, 1_000_000_000_000)),
  floorsCount: finite(0, 100),
  price: nullable(finite(0, 1_000_000_000_000)),
  currency: z.string().max(20),
  status: z.enum(UNIT_STATUSES),
  orientation: nullable(z.string().max(50)),
  interiorImageUrl: nullable(safeUrl),
  galleryImages: z.array(safeUrl).max(100),
  floorPlan3dUrl: nullable(safeUrl),
  plan3dUrl: nullable(safeUrl),
  technicalPlanUrl: nullable(safeUrl),
  roomPlanImage: nullable(safeUrl),
  polygon: nullable(polygon),
  parkingSpots: bounded(z.array(parkingSpot).max(200), MAX_BYTES.parkingSpots),
  rooms: nullable(bounded(z.array(room).max(200), MAX_BYTES.rooms)),
  levels: nullable(bounded(z.array(level).max(20), MAX_BYTES.levels)),
  tourImageUrl: nullable(safeUrl),
  tourData: nullable(tourData),
}).partial();

/** PATCH /api/admin/units/[id]: cualquier subconjunto de campos. */
export const unitPatchSchema = unitFieldsSchema;

/** POST /api/admin/units: lo mismo, más lo mínimo para crear. */
export const unitCreateSchema = unitFieldsSchema.extend({
  floorId: z.string().min(1).max(100),
  code: z.string().min(1).max(200),
  type: z.string().min(1).max(100),
});
