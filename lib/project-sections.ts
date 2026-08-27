import type { ProjectTypeConfig } from './project-types';

// Fuente única de verdad para qué secciones tiene la landing pública de
// un proyecto y en qué orden por defecto — usado tanto por la landing
// (app/proyecto/[slug]/page.tsx) como por el panel de admin
// (sitio/secciones). Hero, Comentarios y Footer quedan fuera de este
// sistema a propósito: son "chrome" fijo de la página, no contenido
// reordenable.
export type SectionKey =
  | 'about'
  | 'before_after'
  | 'process'
  | 'team'
  | 'amenities'
  | 'masterplan'
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
    typologies: `${typeConfig.unitLabel}s disponibles, con fotos${typeConfig.showPrice ? ' y precios' : ''}.`,
    location: 'Puntos de interés con foto (colegios, comercios, transporte, etc).',
    calculator: 'Calculadora de financiación — parámetros en "Configuración".',
    contact: 'Formulario de contacto — se activa según el modo de venta.',
  };
  return hints[key];
}

// Shape mínimo que hace falta para calcular vacíos — el mismo Project
// completo que devuelve GET /api/admin/project/preview (ver
// data/project-repository.ts), no una copia cruda de la fila de Supabase.
// Los collaborators de ese endpoint ya vienen filtrados a status='accepted'
// (mismo query que usa la landing pública), así que acá no hace falta
// re-filtrar por status.
interface EmptyCheckProject {
  description: string;
  beforeAfter: unknown[];
  processGallery: unknown[];
  collaborators: unknown[];
  amenities: unknown[];
  pointsOfInterest: { image?: string }[];
  units: unknown[];
  aerialSlides: unknown[];
}

// Qué secciones DISPONIBLES no tienen nada para mostrar todavía — mismo
// criterio de contenido que usa cada componente de
// components/project-landing/ para devolver null. Compartido entre
// /admin/sitio/secciones y /admin/sitio para no duplicar el criterio.
//
// 'masterplan' SÍ se marca vacío sin aerialSlides — antes se asumía que
// "siempre tiene fallback" y se dejaba afuera de este chequeo, pero el
// fallback real (components/aerial/AerialView.tsx) era una pantalla en
// blanco sin ningún aviso cuando no había ninguna vista aérea cargada.
export function computeEmptySectionKeys(project: EmptyCheckProject): Set<SectionKey> {
  const empty = new Set<SectionKey>();
  if (!project.description) empty.add('about');
  if (project.beforeAfter.length === 0) empty.add('before_after');
  if (project.processGallery.length === 0) empty.add('process');
  if (project.collaborators.length === 0) empty.add('team');
  if (project.amenities.length === 0) empty.add('amenities');
  if (project.units.length === 0) empty.add('typologies');
  if (!project.pointsOfInterest.some(p => p.image)) empty.add('location');
  if (project.aerialSlides.length === 0) empty.add('masterplan');
  return empty;
}

export interface SectionConfigEntry {
  key: string;
  enabled: boolean;
}

// Combina lo guardado en el proyecto con el registro: si el guardado le
// falta alguna key (proyecto viejo, o el registro sumó una sección
// nueva después), esa se agrega al final habilitada por defecto — así
// una sección nueva del sistema no queda invisible para proyectos ya
// configurados.
function resolveFullOrder(sectionConfig: SectionConfigEntry[] | null | undefined): SectionConfigEntry[] {
  const saved = sectionConfig ?? [];
  const savedKeys = new Set(saved.map(s => s.key));
  const missing = DEFAULT_ORDER.filter(k => !savedKeys.has(k)).map(key => ({ key, enabled: true }));
  return [...saved, ...missing];
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
