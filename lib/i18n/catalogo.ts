// Valores de catálogo que se GUARDAN en castellano (tipo de unidad,
// características, ambientes, categorías...) y se muestran en el idioma del
// sitio. El dato y las claves de filtro de la URL no cambian: solo la
// etiqueta. Un valor fuera del catálogo (dato viejo o cargado a mano) se
// muestra tal cual. Sin imports de next/react.
// Spec: docs/superpowers/specs/2026-11-25-multi-idioma-design.md
import type { Locale } from './locales';

const EN: Record<string, string> = {
  // Tipologías (units.type); los genéricos los pone la Carga guiada
  monoambiente: 'studio',
  unidad: 'unit',
  lote: 'lot',
  casa: 'house',
  dúplex: 'duplex',
  penthouse: 'penthouse',
  'local comercial': 'commercial unit',
  cochera: 'parking space',
  // Características de la unidad (UNIT_FEATURE_GROUPS)
  patio: 'Patio',
  jardín: 'Garden',
  pileta: 'Pool',
  quincho: 'Covered BBQ area',
  parrilla: 'Grill',
  terraza: 'Terrace',
  'losa radiante': 'Radiant floor heating',
  radiadores: 'Radiators',
  'tiro balanceado': 'Wall heater',
  'aire split': 'Split AC',
  'aire central': 'Central AC',
  amoblada: 'Furnished',
  semiamoblada: 'Semi-furnished',
  'cocina equipada': 'Equipped kitchen',
  'gas natural': 'Natural gas',
  'apto crédito': 'Mortgage eligible',
  // Grupos de características
  exteriores: 'Outdoors',
  climatización: 'Climate control',
  otros: 'Other',
  // Características de ambientes (ROOM_FEATURES_BY_KIND)
  'en suite': 'En suite',
  'con placard': 'Built-in closet',
  vestidor: 'Walk-in closet',
  'con balcón': 'With balcony',
  'aire acondicionado': 'Air conditioning',
  'con bañera': 'Bathtub',
  'con ducha': 'Shower',
  toilette: 'Powder room',
  'doble bacha': 'Double sink',
  isla: 'Island',
  desayunador: 'Breakfast bar',
  'integrada al living': 'Open to the living room',
  'integrado al living': 'Open to the living room',
  'con lavadero': 'With laundry area',
  'con hogar': 'Fireplace',
  'doble altura': 'Double-height ceiling',
  'con pileta': 'With sink',
  'con guardado': 'With storage',
  // Categorías sugeridas de amenities
  'aire libre': 'Outdoors',
  bienestar: 'Wellness',
  social: 'Social',
  trabajo: 'Work',
  servicios: 'Services',
};

/** Conserva la mayúscula inicial del valor guardado. */
function conMayuscula(original: string, traducido: string): string {
  const empiezaMayuscula = original.charAt(0) !== original.charAt(0).toLowerCase();
  return empiezaMayuscula ? traducido.charAt(0).toUpperCase() + traducido.slice(1) : traducido;
}

export function etiquetaCatalogo(valor: string, locale: Locale): string {
  if (locale === 'es' || !valor) return valor;
  const clave = valor.trim().toLowerCase();
  const dormitorios = clave.match(/^(\d+) dormitorios?$/);
  if (dormitorios) {
    const n = Number(dormitorios[1]);
    return `${n} bedroom${n === 1 ? '' : 's'}`;
  }
  const t = EN[clave];
  return t ? conMayuscula(valor, t) : valor;
}

/**
 * Nombre de un piso que generó la plataforma ("Piso 3", "Planta baja", "PB",
 * "Subsuelo 2") en el idioma del sitio. Uno escrito a mano por la
 * desarrolladora ("Terraza Norte") queda igual hasta la traducción con IA.
 */
export function etiquetaPiso(label: string, locale: Locale): string {
  if (locale === 'es' || !label) return label;
  const l = label.trim();
  const piso = l.match(/^piso (\d+)$/i);
  if (piso) return `Floor ${piso[1]}`;
  if (/^(planta baja|pb)$/i.test(l)) return 'Ground floor';
  if (/^planta alta$/i.test(l)) return 'Upper floor';
  // El piso único de un loteo o proyecto de una planta (Carga guiada).
  if (/^plano$/i.test(l)) return 'Site plan';
  const sub = l.match(/^subsuelo(?: (\d+))?$/i);
  if (sub) return sub[1] ? `Basement ${sub[1]}` : 'Basement';
  return label;
}
