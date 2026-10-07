import type { ProjectTypeConfig } from './project-types';
import { pluralize } from './units';

// Fuente única de verdad para qué secciones tiene la landing pública de
// un proyecto y en qué orden por defecto — usado tanto por la landing
// (app/proyecto/[slug]/page.tsx) como por el panel de admin (/admin/sitio).
// Hero, Comentarios y Footer quedan fuera de este sistema a propósito: son
// "chrome" fijo de la página, no contenido reordenable.
export type SectionKey =
  | 'about'
  | 'before_after'
  | 'process'
  | 'team'
  | 'amenities'
  | 'masterplan'
  | 'bim'
  | 'typologies'
  | 'location'
  | 'calculator'
  | 'contact';

export interface SectionMeta {
  key: SectionKey;
  label: string;
}

// Orden actual de la landing — es también el default para cualquier
// proyecto sin section_config guardado.
export const SECTION_REGISTRY: SectionMeta[] = [
  { key: 'about', label: 'Sobre el proyecto' },
  { key: 'before_after', label: 'Antes / Después' },
  { key: 'process', label: 'Galería de proceso' },
  { key: 'team', label: 'Equipo' },
  { key: 'amenities', label: 'Amenidades' },
  { key: 'masterplan', label: 'Masterplan interactivo' },
  { key: 'bim', label: 'Modelo BIM' },
  { key: 'typologies', label: 'Tipologías / unidades' },
  { key: 'location', label: 'Ubicación' },
  { key: 'calculator', label: 'Calculadora' },
  { key: 'contact', label: 'Contacto' },
];

const DEFAULT_ORDER: SectionKey[] = SECTION_REGISTRY.map(s => s.key);

// Disponibilidad por tipo/modo de venta — no toda sección tiene sentido
// para todo proyecto. Antes/Después y Proceso son de ficha académica
// (ver comentario en supabase/schema.sql): un desarrollo "para vender"
// ni siquiera tiene esos campos visibles en el admin (proyecto/page.tsx,
// gateado por saleMode==='showcase'), así que ofrecerlos como toggle en
// un proyecto de venta sería un control que nunca puede hacer nada.
// Calculadora/Contacto ya eran gateadas por typeConfig (venta + la forma
// del proyecto) desde antes de este sistema. Lo que no está en este mapa
// (about, team, amenities, masterplan, typologies, location) es universal.
const AVAILABILITY: Partial<Record<SectionKey, (typeConfig: ProjectTypeConfig) => boolean>> = {
  before_after: t => t.saleMode === 'showcase',
  process: t => t.saleMode === 'showcase',
  calculator: t => t.showCalculator,
  contact: t => t.showLeads,
};

// Motivo corto para mostrar en el panel cuando una sección no aplica —
// solo se usa ahí, la landing pública simplemente no la renderiza.
const UNAVAILABLE_REASON: Partial<Record<SectionKey, string>> = {
  before_after: 'no disponible — solo para proyectos "Solo para mostrar"',
  process: 'no disponible — solo para proyectos "Solo para mostrar"',
  calculator: 'no disponible para este tipo/modo de proyecto',
  contact: 'no disponible — solo para proyectos "Para vender"',
};

export function isSectionAvailable(key: SectionKey, typeConfig: ProjectTypeConfig): boolean {
  return AVAILABILITY[key]?.(typeConfig) ?? true;
}

// Dónde se edita el contenido de cada sección — para el centro de
// control ("/admin/sitio"), que enlaza a la pantalla real en vez de
// duplicar el formulario. 'contact' no tiene link: es solo el formulario
// fijo, no hay copy propio para editar (se prende/apaga desde
// Secciones, no hay nada más que cambiar).
export function sectionEditHref(key: SectionKey, hasFloorStep: boolean): string | null {
  switch (key) {
    case 'about':
    case 'before_after':
    case 'process':
    case 'team':
    case 'masterplan':
      return '/admin/proyecto';
    case 'amenities':
      return '/admin/proyecto/amenities';
    case 'bim':
      return '/admin/proyecto/bim';
    case 'location':
      return '/admin/proyecto/ubicacion';
    case 'typologies':
      return hasFloorStep ? '/admin/edificios' : '/admin/inventory';
    case 'calculator':
      return '/admin/settings';
    case 'contact':
      return null;
  }
}

// Descripción corta de qué muestra cada sección — para el centro de
// control, así se entiende de un vistazo sin tener que entrar a cada
// pantalla a adivinar.
export function sectionHint(key: SectionKey, typeConfig: ProjectTypeConfig): string {
  const hints: Record<SectionKey, string> = {
    about: 'Descripción larga del proyecto (y ficha académica, si es "solo para mostrar").',
    before_after: 'Pares de fotos antes/después — reciclaje o rehabilitación.',
    process: 'Bocetos, maquetas y diagramas del proceso de diseño.',
    team: 'Colaboradores acreditados y confirmados.',
    amenities: 'Pileta, gym, SUM y demás espacios comunes.',
    masterplan: typeConfig.hasUnitStep
      ? 'Foto aérea con hotspots — se carga en Proyecto → Vistas aéreas.'
      : 'Foto del frente de la casa — se carga en Proyecto → Vista frontal.',
    bim: 'Modelo BIM del proyecto — imágenes y, más adelante, un modelo 3D navegable.',
    typologies: `${pluralize(typeConfig.unitLabel)} disponibles, con fotos${typeConfig.showPrice ? ' y precios' : ''}.`,
    location: 'Puntos de interés con foto (colegios, comercios, transporte, etc).',
    calculator: 'Calculadora de financiación — parámetros en "Configuración".',
    contact: 'Formulario de contacto — se activa según el modo de venta.',
  };
  return hints[key];
}

// ─── Contenido de cada sección ─────────────────────────────────────
// UN solo criterio de "esta sección tiene algo para mostrar", compartido
// por la landing pública (qué se renderiza), /admin/sitio (qué se marca
// vacío), el progreso de "Mis proyectos" y el chequeo de completitud. Antes
// cada lugar tenía el suyo y se contradecían: el admin daba amenidades por
// cargadas aunque ninguna tuviera foto (y la landing no mostraba nada), y
// la landing mostraba el masterplan con una foto de stock aunque el admin
// lo marcara vacío.

// Conteos mínimos para decidir — se arman desde el Project completo
// (summarizeProject) o, en el listado de proyectos, directo desde
// consultas agregadas en lote (ver app/api/admin/projects/route.ts).
export interface ContentSummary {
  hasDescription: boolean;
  beforeAfterCount: number;
  processCount: number;
  /** Colaboradores aceptados. */
  collaboratorCount: number;
  /** Amenidades visibles CON al menos una foto — sin foto la sección no tiene qué mostrar. */
  amenityWithImageCount: number;
  /** Puntos de interés con foto. */
  poiWithImageCount: number;
  unitCount: number;
  /** Unidades disponibles con precio cargado — lo único que la calculadora puede financiar. */
  financeableUnitCount: number;
  aerialSlideCount: number;
  bimCount: number;
}

// Shape mínimo del Project para resumir. Es el Project completo que arma
// data/project-repository.ts: amenities ya viene filtrado a visibles y
// collaborators a aceptados, así que acá no se vuelve a filtrar.
export interface SummarySource {
  description: string;
  beforeAfter: unknown[];
  processGallery: unknown[];
  collaborators: unknown[];
  amenities: { images: string[] }[];
  pointsOfInterest: { image?: string }[];
  units: { status: string; price?: number }[];
  aerialSlides: unknown[];
  bimModels?: unknown[];
}

export function summarizeProject(project: SummarySource): ContentSummary {
  return {
    hasDescription: !!project.description?.trim(),
    beforeAfterCount: project.beforeAfter.length,
    processCount: project.processGallery.length,
    collaboratorCount: project.collaborators.length,
    amenityWithImageCount: project.amenities.filter(a => a.images.length > 0).length,
    poiWithImageCount: project.pointsOfInterest.filter(p => p.image).length,
    unitCount: project.units.length,
    financeableUnitCount: project.units.filter(u => u.status === 'available' && typeof u.price === 'number' && u.price > 0).length,
    aerialSlideCount: project.aerialSlides.length,
    bimCount: project.bimModels?.length ?? 0,
  };
}

// Secciones que se ocultan solas si no tienen contenido pero que NO cuentan
// como "te falta cargar esto": un proyecto puede legítimamente no tener
// modelo BIM, ni precios (calculadora), y contacto no se "carga".
export const OPTIONAL_SECTIONS: ReadonlySet<SectionKey> = new Set<SectionKey>(['bim', 'calculator', 'contact']);

export function sectionHasContent(key: SectionKey, summary: ContentSummary): boolean {
  switch (key) {
    case 'about': return summary.hasDescription;
    case 'before_after': return summary.beforeAfterCount > 0;
    case 'process': return summary.processCount > 0;
    case 'team': return summary.collaboratorCount > 0;
    case 'amenities': return summary.amenityWithImageCount > 0;
    case 'location': return summary.poiWithImageCount > 0;
    case 'typologies': return summary.unitCount > 0;
    // Sin vistas aéreas el masterplan es una pantalla en blanco: no hay a
    // dónde llevar al visitante (antes la landing igual mostraba el CTA con
    // una foto de stock).
    case 'masterplan': return summary.aerialSlideCount > 0;
    case 'bim': return summary.bimCount > 0;
    case 'calculator': return summary.financeableUnitCount > 0;
    case 'contact': return true;
  }
}

// "Te falta cargar esto": disponible para el tipo/modo, sin contenido y no
// opcional. Habilitada o no da igual — el admin igual quiere saber que una
// sección que apagó está vacía.
export function sectionIsPending(key: SectionKey, summary: ContentSummary, typeConfig: ProjectTypeConfig): boolean {
  return isSectionAvailable(key, typeConfig) && !OPTIONAL_SECTIONS.has(key) && !sectionHasContent(key, summary);
}

// Qué secciones no opcionales no tienen nada para mostrar todavía. Lo usan
// /admin/sitio (estado "vacía" de cada fila) y useProjectCompleteness.
// No filtra por disponibilidad: cada consumidor ya cruza con su lista.
export function emptySectionKeysFromSummary(summary: ContentSummary): Set<SectionKey> {
  return new Set(DEFAULT_ORDER.filter(key => !OPTIONAL_SECTIONS.has(key) && !sectionHasContent(key, summary)));
}

export function computeEmptySectionKeys(project: SummarySource): Set<SectionKey> {
  return emptySectionKeysFromSummary(summarizeProject(project));
}

// ─── Anclas de la home ─────────────────────────────────────────────
// Id de cada sección en la home, para el menú, el footer y los CTAs. Las
// anclas viejas (#next, #tour-360, #modelos, #cotizador) siguen andando:
// la home deja un marcador con ese id además del nuevo, así no se rompen
// links compartidos ni el link "Cotizador" del Navbar.
export const SECTION_ANCHORS: Record<SectionKey, string> = {
  about: 'proyecto',
  before_after: 'antes-despues',
  process: 'proceso',
  team: 'equipo',
  amenities: 'amenidades',
  masterplan: 'masterplan',
  bim: 'modelo-bim',
  typologies: 'unidades',
  location: 'ubicacion',
  calculator: 'financiacion',
  contact: 'contacto',
};

export const LEGACY_SECTION_ANCHORS: Partial<Record<SectionKey, string>> = {
  about: 'next',
  masterplan: 'tour-360',
  typologies: 'modelos',
  calculator: 'cotizador',
};

export interface SectionConfigEntry {
  key: string;
  enabled: boolean;
}

// Combina lo guardado en el proyecto con el registro: si al guardado le
// falta alguna key (proyecto viejo, o el registro sumó una sección nueva
// después), esa se agrega habilitada — así una sección nueva del sistema
// no queda invisible para proyectos ya configurados. Se inserta justo
// después de la sección que la precede en el orden por defecto (la más
// cercana que esté presente), y NUNCA después de Contacto: antes se
// agregaba al final, así que un proyecto viejo veía p. ej. el modelo BIM
// debajo del formulario de contacto, al pie de la página.
//
// Al revés también: una key guardada que el registro ya no conoce
// (sección renombrada o eliminada) se descarta — si no, la landing busca
// su componente en SECTION_COMPONENTS, recibe undefined y la página entera
// rompe con "Element type is invalid". Y como la API guarda section_config
// sin validar su forma, acá no se asume que sea un array, que cada entrada
// tenga key, ni que no haya keys repetidas (gana la primera aparición).
const KNOWN_KEYS = new Set<string>(DEFAULT_ORDER);

function resolveFullOrder(sectionConfig: SectionConfigEntry[] | null | undefined): SectionConfigEntry[] {
  const seen = new Set<string>();
  const saved = (Array.isArray(sectionConfig) ? sectionConfig : []).filter(s => {
    if (!s || typeof s.key !== 'string' || !KNOWN_KEYS.has(s.key) || seen.has(s.key)) return false;
    seen.add(s.key);
    return true;
  });
  const result: SectionConfigEntry[] = saved.map(s => ({ key: s.key, enabled: !!s.enabled }));
  for (const key of DEFAULT_ORDER) {
    if (seen.has(key)) continue;
    seen.add(key);
    const defaultIdx = DEFAULT_ORDER.indexOf(key);
    // Ancla: la sección presente más cercana que la precede por defecto.
    let insertAt = 0;
    for (let i = defaultIdx - 1; i >= 0; i--) {
      const anchorIdx = result.findIndex(s => s.key === DEFAULT_ORDER[i]);
      if (anchorIdx >= 0) { insertAt = anchorIdx + 1; break; }
    }
    if (key !== 'contact') {
      const contactIdx = result.findIndex(s => s.key === 'contact');
      if (contactIdx >= 0 && insertAt > contactIdx) insertAt = contactIdx;
    }
    result.splice(insertAt, 0, { key, enabled: true });
  }
  return result;
}

// Para la landing pública: solo las keys habilitadas Y disponibles para
// este tipo/modo de proyecto, en orden. No decide si la sección tiene
// CONTENIDO — eso lo sigue resolviendo cada componente de sección con su
// propio "si no hay nada, no renderiza nada", igual que antes de este
// sistema. Esto también cubre el caso de un proyecto que cambió de
// showcase a venta con before_after/process_gallery viejos guardados:
// sin este filtro esos datos viejos se seguirían mostrando aunque el
// admin ya no pueda ni ver el formulario para editarlos.
export function resolveSectionOrder(sectionConfig: SectionConfigEntry[] | null | undefined, typeConfig: ProjectTypeConfig): SectionKey[] {
  return resolveFullOrder(sectionConfig)
    .filter(s => s.enabled && isSectionAvailable(s.key as SectionKey, typeConfig))
    .map(s => s.key as SectionKey);
}

// Lo que efectivamente se ve en la home: habilitadas, disponibles y CON
// contenido. Es la fuente para renderizar la home y para todo lo que linkea
// a una sección (footer, flecha del hero), así nunca hay un link a una
// sección que no está en la página.
export function resolveVisibleSections(
  project: SummarySource & { sectionConfig?: SectionConfigEntry[] | null },
  typeConfig: ProjectTypeConfig,
): SectionKey[] {
  const summary = summarizeProject(project);
  return resolveSectionOrder(project.sectionConfig, typeConfig).filter(key => sectionHasContent(key, summary));
}

// Para el panel de admin: la lista completa (habilitadas, apagadas, y no
// disponibles para este tipo/modo), con label y motivo, en el orden
// guardado — la UI necesita ver y mover también las que están apagadas.
export function resolveSectionList(
  sectionConfig: SectionConfigEntry[] | null | undefined,
  typeConfig: ProjectTypeConfig
): (SectionMeta & { enabled: boolean; available: boolean; unavailableReason?: string })[] {
  const labelByKey = new Map<string, string>(SECTION_REGISTRY.map(s => [s.key, s.label]));
  return resolveFullOrder(sectionConfig).map(s => {
    const key = s.key as SectionKey;
    const available = isSectionAvailable(key, typeConfig);
    return {
      key,
      // "Masterplan interactivo" para edificio/loteo; una casa carga una
      // foto del frente, no una vista aérea.
      label: key === 'masterplan' && !typeConfig.hasUnitStep ? 'Vista frontal' : (labelByKey.get(s.key) ?? s.key),
      enabled: s.enabled,
      available,
      unavailableReason: available ? undefined : UNAVAILABLE_REASON[key],
    };
  });
}
