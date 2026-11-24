import type { Project } from '@/types';

// Qué apartados del sitio público de un proyecto tienen algo para mostrar.
// Una sola regla para la barra, el menú, el sitemap, las páginas y los
// links de la landing: si cada uno decidía por su cuenta, la barra ofrecía
// "Amenities" en un proyecto sin amenities y el link llevaba a una pantalla
// vacía, mientras el sitemap (con otro criterio) ya la escondía.
export type ProjectContentFlags = {
  /** Al menos una amenity (con o sin foto: /amenities las lista igual). */
  amenities: boolean;
  /** Mapa (coordenadas) o puntos de interés. Solo la dirección escrita no
   *  alcanza: eso ya está en el hero. */
  location: boolean;
  units: boolean;
  /** Fachada (/masterplan): vista aérea o, si no, la imagen de masterplan
   *  — lo mismo que usa AerialView para armar sus slides. */
  facade: boolean;
  /** Recorrido 360 de espacios comunes (/recorrido). */
  tour: boolean;
};

type ContentSource = Pick<
  Project,
  'amenities' | 'latitude' | 'longitude' | 'pointsOfInterest' | 'units' | 'aerialSlides' | 'masterplanImage' | 'commonAreasTour'
>;

export function projectHasContent(project: ContentSource): ProjectContentFlags {
  return {
    amenities: project.amenities.length > 0,
    location: (project.latitude != null && project.longitude != null) || project.pointsOfInterest.length > 0,
    units: project.units.length > 0,
    facade: project.aerialSlides.length > 0 || !!project.masterplanImage,
    tour: !!project.commonAreasTour,
  };
}
