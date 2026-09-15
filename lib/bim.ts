// Reglas y límites de las piezas BIM que no dependen de la base ni del
// navegador — así las comparten la ruta de API (validación de servidor),
// el admin (deshabilitar el botón de publicar) y los tests, sin duplicar
// el criterio en tres lugares.

/** Bucket propio: NO es project-media. Ese bucket lo vacía
 *  deleteProjectStorageFiles() de las URLs que encuentra en las tablas
 *  del proyecto al borrarlo — un mecanismo distinto del que usa este
 *  archivo (ver lib/supabase/delete-bim-storage.ts), así que conviene
 *  mantenerlos separados aunque ahora una pieza BIM SÍ muera junto con
 *  su proyecto (cascade de la base). */
export const BIM_BUCKET = 'bim-models';

/** Tope de imágenes por pieza — el peso de cada una ya lo limita
 *  /api/admin/upload (15MB). */
export const MAX_GALLERY_IMAGES = 30;

/** Geometría ya convertida: arriba de esto se rechaza (Fase 2). */
export const MAX_GEOMETRY_BYTES = 50 * 1024 * 1024;
/** A partir de acá se sube igual, pero se avisa que va a tardar en abrir. */
export const GEOMETRY_WARN_BYTES = 25 * 1024 * 1024;
/** IFC de origen: no hay tope duro (nunca llega al backend), pero arriba
 *  de esto se advierte que la conversión puede tardar varios minutos. */
export const SOURCE_WARN_BYTES = 300 * 1024 * 1024;

function hasContent(value: string | null | undefined): boolean {
  return !!value && value.trim().length > 0;
}

// Una pieza no puede publicarse vacía: tiene que tener modelo, imágenes,
// o ambos (ver el spec, decisión 6). Las URLs en blanco no cuentan —
// MultiImageUploader deja huecos vacíos cuando se agrega una foto "por
// URL" y todavía no se pegó nada.
export function canPublishBimModel(input: {
  geometryUrl?: string | null;
  galleryImages: string[];
}): boolean {
  return hasContent(input.geometryUrl) || input.galleryImages.some(hasContent);
}

export function bimModelHref(id: string): string {
  return `/bim/${id}`;
}
