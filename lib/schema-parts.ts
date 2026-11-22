import { z } from 'zod';

// Piezas de validación compartidas por los schemas de las rutas admin
// (unidades, edificios, pisos, amenities). Los topes son generosos a propósito:
// se busca cortar lo absurdo, no limitar lo que un proyecto real carga.

export const finite = (min: number, max: number) => z.number().min(min).max(max);
export const nullable = <T extends z.ZodType>(schema: T) => schema.nullable();

// Una URL que termina en src=/href= no puede ser javascript:. No se exige
// https:// ni un formato de URL estricto a propósito: el panel reenvía en cada
// guardado lo que ya estaba cargado, y un dato viejo con otro formato dejaría
// el recurso sin poder guardarse.
const DANGEROUS_SCHEME = /^\s*(javascript|vbscript):/i;
export const safeUrl = z.string().max(2000).refine(v => !DANGEROUS_SCHEME.test(v), 'URL no permitida');

export const point = z.object({ x: finite(-1000, 1000), y: finite(-1000, 1000) });
export const polygon = z.array(point).max(500);

/** Un id (uuid o slug) tal como llega del panel. */
export const idString = z.string().max(200);

// Tope de tamaño total de los jsonb grandes (bytes de su JSON): la forma ya está
// acotada, esto frena el relleno dentro de los campos libres.
export const bounded = <T extends z.ZodType>(schema: T, maxBytes: number) =>
  schema.refine(v => JSON.stringify(v).length <= maxBytes, 'Es demasiado grande');

const tourNode = z.looseObject({ id: z.string().max(100), name: z.string().max(200), imageUrl: safeUrl });
/** Recorrido 360 (TourData). 500 KB de JSON como máximo. */
export const tourData = bounded(z.looseObject({ initialNodeId: z.string().max(100), nodes: z.array(tourNode).max(200) }), 500_000);
