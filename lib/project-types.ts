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
  /**
   * true cuando el project_type y/o el sale_mode guardados NO existen en el
   * catálogo y esta config es en realidad el default ('edificio' / 'venta').
   * Sirve para que el admin muestre un aviso en vez de que un proyecto mal
   * tipeado (dato viejo, migración incompleta, valor combinado legacy como
   * "casa-showcase") se renderice en silencio como un edificio. Ver
   * getProjectTypeConfig — el resto de la app puede ignorar este campo.
   */
  isFallback: boolean;
  /** Cuál de los dos ejes no matcheó — para redactar el aviso. */
  fallbackFields: { type: boolean; saleMode: boolean };
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
  /**
   * Si cada building de este tipo puede tener VARIAS unidades adentro
   * (varios deptos en un piso, varios lotes en una etapa) o si building y
   * unidad son, en la práctica, la misma cosa (una casa sola no tiene
   * "casas" adentro — tipo "casa"). Cuando es false, el building crea su única unidad
   * interna automáticamente — igual que el piso invisible — y el paso
   * "Unidades" del asistente se reemplaza por un formulario único ("Datos")
   * que edita esa unidad directo, sin lista, sin alta de una segunda, y sin
   * paso de Delimitación (no hay nada que delimitar con una sola unidad).
   */
  hasUnitStep: boolean;
  /**
   * Cómo se llama la imagen del masterplan. Un edificio/loteo/dúplex
   * muestra una FOTO AÉREA con hotspots sobre las torres; una casa no
   * tiene nada que ver desde arriba, se carga una VISTA FRONTAL de la
   * fachada. Deriva de hasUnitStep (casa es la única sin él).
   */
  aerialLabel: string;        // "Vista aérea" | "Vista frontal"
  aerialLabelPlural: string;  // "Vistas aéreas" | "Vistas frontales"
}

interface StructureConfig {
  label: string;
  description: string;
  unitLabel: string;
  unitLabelGender: 'm' | 'f';
  buildingLabel: string;
  buildingLabelGender: 'm' | 'f';
  hasFloorStep: boolean;
  hasUnitStep: boolean;
  /** Un lote no se financia como una hipoteca convencional — aunque el propósito sea "venta", la calculadora no aplica acá. */
  allowsCalculator: boolean;
  /**
   * Qué propósitos tienen sentido para esta forma. Casi todas admiten los
   * dos ('venta' y 'showcase'), pero un "Proyecto único" (escuela, museo)
   * no tiene unidades en venta — forzar 'showcase' evita que el panel
   * muestre precio/estado/leads sobre "Espacios". El alta y el editor solo
   * ofrecen estos valores; getProjectTypeConfig además corrige un dato
   * viejo que tenga un combo inválido.
   */
  allowedSaleModes: ProjectSaleMode[];
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
    hasUnitStep: true,
    allowsCalculator: true,
    allowedSaleModes: ['venta', 'showcase'],
  },
  loteo: {
    label: 'Loteo',
    description: 'Venta de lotes por etapas, cada una con su propio plano de subdivisión.',
    unitLabel: 'Lote',
    unitLabelGender: 'm',
    buildingLabel: 'Etapa',
    buildingLabelGender: 'f',
    hasFloorStep: false,
    hasUnitStep: true,
    allowsCalculator: false,
    allowedSaleModes: ['venta', 'showcase'],
  },
  duplex: {
    label: 'Dúplex',
    description: 'Pares de casas semi-adosadas, cada mitad como unidad independiente.',
    unitLabel: 'Unidad',
    unitLabelGender: 'f',
    buildingLabel: 'Dúplex',
    buildingLabelGender: 'm',
    hasFloorStep: false,
    hasUnitStep: true,
    allowsCalculator: true,
    allowedSaleModes: ['venta', 'showcase'],
  },
  casa: {
    label: 'Casa',
    description: 'Una casa independiente dentro de un desarrollo.',
    unitLabel: 'Casa',
    unitLabelGender: 'f',
    buildingLabel: 'Casa',
    buildingLabelGender: 'f',
    hasFloorStep: false,
    // Cada Casa ES la unidad — no hay sub-unidades adentro de una Casa.
    hasUnitStep: false,
    allowsCalculator: true,
    allowedSaleModes: ['venta', 'showcase'],
  },
  unico: {
    label: 'Proyecto único',
    description: 'Un edificio, equipamiento o intervención puntual — escuela, museo, biblioteca, interiorismo. Con pisos y espacios propios, sin unidades en venta.',
    unitLabel: 'Espacio',
    unitLabelGender: 'm',
    buildingLabel: 'Edificio',
    buildingLabelGender: 'm',
    hasFloorStep: true,
    hasUnitStep: true,
    allowsCalculator: false,
    allowedSaleModes: ['showcase'],
  },
};

// Catálogo de PROPÓSITOS — prende/apaga las secciones orientadas a venta
// (precio, estado, leads, calculadora). Se combina con cualquier forma de
// arriba: un loteo, un dúplex o una casa pueden ser tan "solo para
// mostrar" como un edificio — antes esto solo existía para casa.
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

// Nombres viejos de project_type que siguen vivos en filas de la base
// hasta que corra la migración de supabase/schema.sql. Mapean al valor
// actual del catálogo para que el proyecto no caiga al default (y no
// dispare el banner de "tipo no reconocido"). Sacar una entrada de acá
// recién cuando se confirmó que ninguna fila usa más ese valor.
const LEGACY_TYPE_ALIASES: Record<string, ProjectType> = {
  casas: 'casa', // renombrado plural → singular
};

/** Resuelve alias legacy → valor de catálogo. Deja intacto lo que no matchea. */
export function canonicalProjectType(type: string): string {
  return LEGACY_TYPE_ALIASES[type] ?? type;
}

// ¿Este combo forma+propósito tiene sentido? Lo usa la validación del
// alta y del editor (POST/PATCH de /api/admin/project). Un type fuera del
// catálogo devuelve false — que el que llama lo trate como "elegí de
// nuevo", no como "dejalo así".
export function isValidTypeCombo(type: string, saleMode: string): boolean {
  const structure = PROJECT_STRUCTURES[canonicalProjectType(type) as ProjectType];
  return !!structure && structure.allowedSaleModes.includes(saleMode as ProjectSaleMode);
}

// No tipa los parámetros a propósito: project_type/sale_mode vienen de la
// base como texto libre (ver supabase/schema.sql), y si algún día se saca
// un valor del catálogo, un proyecto viejo con ese valor no debe romper
// la página — cae al default en vez de explotar.
export function getProjectTypeConfig(type: string, saleMode: string): ProjectTypeConfig {
  const canonicalType = canonicalProjectType(type);
  const typeIsKnown = canonicalType in PROJECT_STRUCTURES;
  const saleModeIsKnown = saleMode in PROJECT_SALE_MODES;
  const structure = typeIsKnown ? PROJECT_STRUCTURES[canonicalType as ProjectType] : PROJECT_STRUCTURES[DEFAULT_PROJECT_TYPE];
  const knownSaleMode = (saleModeIsKnown ? saleMode : DEFAULT_SALE_MODE) as ProjectSaleMode;
  // Combo inválido guardado (ej. dato viejo con 'unico' + 'venta'): se
  // corrige hacia el propósito que la forma sí admite. Es la dirección
  // segura — 'showcase' esconde secciones, no muestra datos de más.
  const resolvedSaleMode = structure.allowedSaleModes.includes(knownSaleMode)
    ? knownSaleMode
    : structure.allowedSaleModes[0];
  const mode = PROJECT_SALE_MODES[resolvedSaleMode];
  return {
    label: `${structure.label} — ${mode.label}`,
    description: mode.description,
    saleMode: resolvedSaleMode,
    isFallback: !typeIsKnown || !saleModeIsKnown,
    fallbackFields: { type: !typeIsKnown, saleMode: !saleModeIsKnown },
    showPrice: mode.showPrice,
    showStatus: mode.showStatus,
    showLeads: mode.showLeads,
    showCalculator: mode.showCalculator && structure.allowsCalculator,
    unitLabel: structure.unitLabel,
    unitLabelGender: structure.unitLabelGender,
    buildingLabel: structure.buildingLabel,
    buildingLabelGender: structure.buildingLabelGender,
    hasFloorStep: structure.hasFloorStep,
    hasUnitStep: structure.hasUnitStep,
    aerialLabel: structure.hasUnitStep ? 'Vista aérea' : 'Vista frontal',
    aerialLabelPlural: structure.hasUnitStep ? 'Vistas aéreas' : 'Vistas frontales',
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
