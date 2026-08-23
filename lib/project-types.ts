import type { ProjectType, ProjectSaleMode } from '@/types';

// Forma final que consume el resto de la app (páginas públicas y admin) —
// se mantiene igual a como era cuando "tipo de proyecto" era un solo
// catálogo plano, para no tener que tocar cada pantalla que ya lo usa.
// Lo que cambió es CÓMO se arma: ahora es la combinación de una FORMA
// (ProjectType) y un PROPÓSITO (ProjectSaleMode) — ver getProjectTypeConfig.
export interface ProjectTypeConfig {
  label: string;
  description: string;
  /** El propósito crudo — para pantallas que necesitan la condición completa (ej. mostrar la ficha académica solo en showcase) en vez de inferirlo de alguna de las banderas showX. */
  saleMode: ProjectSaleMode;
  /** Precio por unidad/ambiente, en el listado y en la ficha pública. */
  showPrice: boolean;
  /** Estado de venta (disponible/reservado/vendido). */
  showStatus: boolean;
  /** Formulario de contacto / captura de leads. */
  showLeads: boolean;
  /** Calculadora de financiación hipotecaria. */
  showCalculator: boolean;
  /** Cómo se le llama a cada "unidad" en la UI pública y en el admin. */
  unitLabel: string;
  /** Género gramatical de unitLabel — ver buildingLabelGender, misma idea. Usar con unitAgreement(). */
  unitLabelGender: 'm' | 'f';
  /** Cómo se le llama a cada "edificio" — ej. "Etapa" en un loteo. */
  buildingLabel: string;
  /**
   * Género gramatical de buildingLabel — "Etapa"/"Casa" son femeninas,
   * "Edificio"/"Dúplex" son masculinas. Sin esto, las pantallas que arman
   * frases con buildingLabel ("la Etapa", "otro Dúplex nuevo") quedarían
   * mal concordadas para la mitad de los tipos. Usar junto con
   * buildingAgreement() en vez de hardcodear artículos/adjetivos sueltos.
   */
  buildingLabelGender: 'm' | 'f';
  /**
   * Si este tipo tiene pisos reales dentro de cada edificio (torre con
   * varias plantas) o no (un loteo no tiene "pisos"; cada building es una
   * etapa con un único plano de subdivisión). Cuando es false, el asistente
   * guiado se salta el paso "Piso" — crea un piso único e invisible al
   * crear el building — y las pantallas de edificio ocultan lo que
   * asuma pisos de verdad (la tabla de pisos, el tour "de la torre").
   */
  hasFloorStep: boolean;
}

interface StructureConfig {
  label: string;
  description: string;
  unitLabel: string;
  unitLabelGender: 'm' | 'f';
  buildingLabel: string;
  buildingLabelGender: 'm' | 'f';
  hasFloorStep: boolean;
  /** Un lote no se financia como una hipoteca convencional — aunque el propósito sea "venta", la calculadora no aplica acá. */
  allowsCalculator: boolean;
}

interface SaleModeConfig {
  label: string;
  description: string;
  showPrice: boolean;
  showStatus: boolean;
  showLeads: boolean;
  showCalculator: boolean;
}

// Catálogo de FORMAS — cada una define la jerarquía (hasFloorStep) y la
// terminología (unitLabel/buildingLabel), independiente de si el
// proyecto es para vender o solo para mostrar. Agregar una forma nueva
// es sumar una entrada acá (+ el valor en types/index.ts).
export const PROJECT_STRUCTURES: Record<ProjectType, StructureConfig> = {
  edificio: {
    label: 'Edificio',
    description: 'Torres con pisos y unidades — el caso clásico de un edificio de departamentos.',
    unitLabel: 'Unidad',
    unitLabelGender: 'f',
    buildingLabel: 'Edificio',
    buildingLabelGender: 'm',
    hasFloorStep: true,
    allowsCalculator: true,
  },
  loteo: {
    label: 'Loteo',
    description: 'Venta de lotes por etapas, cada una con su propio plano de subdivisión.',
    unitLabel: 'Lote',
    unitLabelGender: 'm',
    buildingLabel: 'Etapa',
    buildingLabelGender: 'f',
    hasFloorStep: false,
    allowsCalculator: false,
  },
  duplex: {
    label: 'Dúplex',
    description: 'Pares de casas semi-adosadas, cada mitad como unidad independiente.',
    unitLabel: 'Unidad',
    unitLabelGender: 'f',
    buildingLabel: 'Dúplex',
    buildingLabelGender: 'm',
    hasFloorStep: false,
    allowsCalculator: true,
  },
  casas: {
    label: 'Casas',
    description: 'Una o varias casas independientes dentro de un mismo desarrollo.',
    unitLabel: 'Casa',
    unitLabelGender: 'f',
    buildingLabel: 'Casa',
    buildingLabelGender: 'f',
    hasFloorStep: false,
    allowsCalculator: true,
  },
  unico: {
    label: 'Proyecto único',
    description: 'Un edificio, equipamiento o intervención puntual — escuela, museo, biblioteca, interiorismo. Con pisos y espacios propios, sin unidades en venta.',
    unitLabel: 'Espacio',
    unitLabelGender: 'm',
    buildingLabel: 'Edificio',
    buildingLabelGender: 'm',
    hasFloorStep: true,
    allowsCalculator: false,
  },
};

// Catálogo de PROPÓSITOS — prende/apaga las secciones orientadas a venta
// (precio, estado, leads, calculadora). Se combina con cualquier forma de
// arriba: un loteo, un dúplex o varias casas pueden ser tan "solo para
// mostrar" como un edificio — antes esto solo existía para casas.
export const PROJECT_SALE_MODES: Record<ProjectSaleMode, SaleModeConfig> = {
  venta: {
    label: 'Para vender',
    description: 'Precio, estado de venta, leads y calculadora de financiación (según la forma del desarrollo).',
    showPrice: true,
    showStatus: true,
    showLeads: true,
    showCalculator: true,
  },
  showcase: {
    label: 'Solo para mostrar',
    description: 'Portfolio o presentación — sin precio, estado ni formulario de venta. Ideal para mostrar un proyecto de estudio.',
    showPrice: false,
    showStatus: false,
    showLeads: false,
    showCalculator: false,
  },
};

export const DEFAULT_PROJECT_TYPE: ProjectType = 'edificio';
export const DEFAULT_SALE_MODE: ProjectSaleMode = 'venta';

// No tipa los parámetros a propósito: project_type/sale_mode vienen de la
// base como texto libre (ver supabase/schema.sql), y si algún día se saca
// un valor del catálogo, un proyecto viejo con ese valor no debe romper
// la página — cae al default en vez de explotar.
export function getProjectTypeConfig(type: string, saleMode: string): ProjectTypeConfig {
  const structure = PROJECT_STRUCTURES[type as ProjectType] ?? PROJECT_STRUCTURES[DEFAULT_PROJECT_TYPE];
  const resolvedSaleMode = (saleMode in PROJECT_SALE_MODES ? saleMode : DEFAULT_SALE_MODE) as ProjectSaleMode;
  const mode = PROJECT_SALE_MODES[resolvedSaleMode];
  return {
    label: `${structure.label} — ${mode.label}`,
    description: mode.description,
    saleMode: resolvedSaleMode,
    showPrice: mode.showPrice,
    showStatus: mode.showStatus,
    showLeads: mode.showLeads,
    showCalculator: mode.showCalculator && structure.allowsCalculator,
    unitLabel: structure.unitLabel,
    unitLabelGender: structure.unitLabelGender,
    buildingLabel: structure.buildingLabel,
    buildingLabelGender: structure.buildingLabelGender,
    hasFloorStep: structure.hasFloorStep,
  };
}

// Formas gramaticales para armar frases sin hardcodear "el/la", "un/una",
// "otro/otra", "nuevo/nueva" — usar esto en vez de asumir un género fijo.
// Dos variantes porque buildingLabel y unitLabel pueden tener géneros
// distintos entre sí (ej. loteo: "la Etapa" pero "el Lote").
function genderAgreement(gender: 'm' | 'f') {
  const f = gender === 'f';
  return {
    el: f ? 'la' : 'el',
    El: f ? 'La' : 'El',
    /** "del edificio" vs. "de la Etapa" — "de"+"el" contrae a "del", "de"+"la" no. */
    del: f ? 'de la' : 'del',
    un: f ? 'una' : 'un',
    Un: f ? 'Una' : 'Un',
    otro: f ? 'otra' : 'otro',
    Otro: f ? 'Otra' : 'Otro',
    uno: f ? 'una' : 'uno',
    nuevo: f ? 'nueva' : 'nuevo',
    borrado: f ? 'borrada' : 'borrado',
    cargado: f ? 'cargada' : 'cargado',
    ningun: f ? 'ninguna' : 'ningún',
    esta: f ? 'esta' : 'este',
    Esta: f ? 'Esta' : 'Este',
  };
}

export function buildingAgreement(config: Pick<ProjectTypeConfig, 'buildingLabelGender'>) {
  return genderAgreement(config.buildingLabelGender);
}

export function unitAgreement(config: Pick<ProjectTypeConfig, 'unitLabelGender'>) {
  return genderAgreement(config.unitLabelGender);
}
