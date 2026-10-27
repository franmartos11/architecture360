// Navegación del sitio público de un proyecto — una sola fuente para los
// links de la barra global (components/ui/Navbar.tsx) y del menú único
// (components/ui/ProjectMenu.tsx).

export interface ProjectNavInfo {
  projectName: string;
  showCalculator: boolean;
  hasTour: boolean;
  /** Tipo "casa": una sola unidad — el link va directo a ella y se llama como la casa. */
  singleUnit?: { buildingId: string; unitId: string; label: string };
  /** Plural de unitLabel ("Unidades", "Lotes"…) para el link cuando no hay singleUnit. */
  unitsLabel: string;
  projectSlug: string;
  /** Ciudad bajo la marca ("SALTA") — la primera parte de project.location. */
  projectLocation?: string;
  /** El propósito del proyecto captura leads — si no, no hay "Contactar". */
  showLeads: boolean;
  /** Unidades disponibles — solo cuando el proyecto muestra estado de venta. */
  unitsAvailable?: number;
  amenitiesCount: number;
  /** Nombre de cada edificio por id — para "Plantas · Torre A" en la barra. */
  buildingNames: Record<string, string>;
  /** Tarjetas de "Explorar 3D" del menú. plans: el primer edificio con plano. */
  explore: {
    facadeImage?: string;
    /** "4 ángulos" — bajada de la tarjeta en el selector de las migas. */
    facadeDetail?: string;
    plans?: { buildingId: string; image?: string; label: string; detail?: string };
    tourImage?: string;
    tourDetail?: string;
  };
}

export function projectNavHrefs(
  basePath: string,
  singleUnit?: ProjectNavInfo['singleUnit'],
  plansBuildingId?: string,
) {
  return {
    // Con el fallback a "/" solo el inicio: el resto concatena sobre el
    // basePath crudo ('' en subdominio, "/proyecto/slug" en el dominio raíz).
    home: basePath || '/',
    masterplan: `${basePath}/masterplan`,
    tour: `${basePath}/recorrido`,
    units: singleUnit
      ? `${basePath}/edificio/${singleUnit.buildingId}/unidad/${singleUnit.unitId}`
      : `${basePath}/unidades`,
    amenities: `${basePath}/amenities`,
    location: `${basePath}/ubicacion`,
    calculator: `${basePath}#cotizador`,
    plans: plansBuildingId ? `${basePath}/edificio/${plansBuildingId}` : undefined,
  };
}

// Dónde está el usuario, para la barra mínima: "Explorar 3D / Plantas" o
// "Unidades · 21 disponibles". null fuera de las secciones conocidas.
export function projectSectionFor(
  pathname: string,
  basePath: string,
  info: ProjectNavInfo,
): { group?: string; label: string; detail?: string } | null {
  const rel = (basePath && pathname.startsWith(basePath) ? pathname.slice(basePath.length) : pathname).replace(/\/+$/, '');
  if (rel === '') return { label: 'Proyecto' };
  if (rel === '/unidades') {
    return {
      label: info.unitsLabel,
      detail: info.unitsAvailable != null ? `${info.unitsAvailable} disponibles` : undefined,
    };
  }
  if (rel === '/amenities') {
    return {
      label: 'Amenities',
      detail: info.amenitiesCount ? `${info.amenitiesCount} espacios comunes` : undefined,
    };
  }
  if (rel === '/ubicacion') return { label: 'Ubicación' };
  if (rel === '/masterplan') return { group: 'Explorar 3D', label: 'Fachada' };
  if (rel === '/recorrido') return { group: 'Explorar 3D', label: 'Recorrido 360' };
  const buildingTour = rel.match(/^\/edificio\/([^/]+)\/recorrido$/);
  if (buildingTour) {
    return { group: 'Explorar 3D', label: 'Recorrido 360', detail: buildingDetail(info, buildingTour[1]) };
  }
  const building = rel.match(/^\/edificio\/([^/]+)$/);
  if (building) {
    return { group: 'Explorar 3D', label: info.explore.plans?.label ?? 'Plantas', detail: buildingDetail(info, building[1]) };
  }
  return null;
}

// Con una sola torre su nombre suele ser el del proyecto: repetirlo en las
// migas no dice nada.
function buildingDetail(info: ProjectNavInfo, buildingId: string): string | undefined {
  return Object.keys(info.buildingNames).length > 1 ? info.buildingNames[buildingId] : undefined;
}
