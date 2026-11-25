import type { Project, Unit } from '@/types';
import type { ProjectTypeConfig } from '@/lib/project-types';
import {
  formatPrice, getStatusLabel, getStatusColor, unitIsDwelling, unitCategory,
  UNIT_CATEGORY_LABEL, cocheraLabel, unitConditionLabel,
} from '@/lib/units';
import { boostsLabel, computePlan, showUnitCalculator, INDEX_LABEL, type FinancingPlan } from '@/lib/financing';
import { normalizeRef } from '@/lib/analytics/ref';
import { getPreset } from '@/lib/theme-presets';
import { contrastRatio } from '@/lib/color-contrast';
import { slugify } from '@/lib/slug';
import { formatPhoneForDisplay } from '@/lib/phone-format';
import { toWinAnsi } from './winansi';

// Qué muestra la ficha PDF de una unidad. Puro: decide contenido y textos;
// el dibujo vive en FichaDocument y la carga de datos en la ruta. Nunca
// muestra lo que el sitio oculta (precio, estado, planes).
// Spec: docs/superpowers/specs/2026-11-24-ficha-pdf-unidad-design.md

export interface FichaInput {
  project: Project;
  unit: Unit;
  buildingName: string;
  typeConfig: ProjectTypeConfig;
  plans: FinancingPlan[];
  /** URL pública de la unidad (projectCanonical), sin query. */
  unitUrl: string;
  /** Crudo de la query: se normaliza acá. */
  ref: string | null;
  isDraft: boolean;
  now: Date;
}

export interface FichaPlanRow {
  name: string;
  /** Precio con descuento/recargo; null si el plan no ajusta el precio. */
  planPrice: string | null;
  lines: string[];
  indexNote: string | null;
  note: string | null;
}

export interface FichaContent {
  projectName: string;
  location: string;
  unitName: string;
  status: { label: string; color: string } | null;
  subtitle: string | null;
  specs: string[];
  price: { label: string; amount: string } | null;
  askPrice: boolean;
  plans: FichaPlanRow[];
  plansNote: string | null;
  qrUrl: string;
  /** "Escaneá para ver…": solo promete el recorrido y el precio si el sitio los tiene. */
  qrLead: string;
  whatsapp: { label: string; href: string } | null;
  accent: string;
  draft: boolean;
  generatedOn: string;
  imageUrls: { hero: string | null; plan: string | null };
}

const FALLBACK_ACCENT = '#1c1a17';

const DATE_FMT = new Intl.DateTimeFormat('es-AR', {
  timeZone: 'America/Argentina/Buenos_Aires', day: '2-digit', month: '2-digit', year: 'numeric',
});

/** DD/MM/AAAA en hora de Argentina. */
export function fichaDate(now: Date): string {
  return DATE_FMT.format(now);
}

export function fichaFileName(projectName: string, unitName: string): string {
  return `ficha-${slugify(projectName)}-${slugify(unitName)}.pdf`;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * Datos de la unidad, con las mismas etiquetas y condiciones que la tarjeta
 * del visor (components/unit/UnitViewer.tsx). Diferencias: dormitorios y
 * baños van siempre en viviendas (la ficha no tiene la lista de ambientes)
 * y se antepone piso/edificio.
 */
export function unitSpecLines(unit: Unit, o: { unitIsLand: boolean; hasUnitStep: boolean; hasFloorStep: boolean; buildingName: string }): string[] {
  const land = o.unitIsLand;
  const dwelling = !land && unitIsDwelling(unit);
  const lines: (string | false | null | undefined)[] = [
    o.hasFloorStep && `${unit.floor === 0 ? 'Planta baja' : `Piso ${unit.floor}`}${o.buildingName ? ` · ${o.buildingName}` : ''}`,
    `${land ? 'Superficie' : 'Área total'} ${unit.totalArea} m²`,
    !land && `Área interna ${unit.innerArea} m²`,
    !land && unit.balconyArea > 0 && `Área balcones ${unit.balconyArea} m²`,
    !land && unit.externalArea > 0 && `Área externa ${unit.externalArea} m²`,
    !land && !!unit.lotSize && `Terreno ${unit.lotSize} m²`,
    !land && !!unit.ceilingHeight && `Altura de techo ${unit.ceilingHeight} m`,
    dwelling && `${unit.bedrooms} Dormitorio${unit.bedrooms !== 1 ? 's' : ''}`,
    dwelling && `${unit.bathrooms} Baño${unit.bathrooms !== 1 ? 's' : ''}`,
    dwelling && !o.hasUnitStep && !!unit.livingRooms && `${unit.livingRooms} Living${unit.livingRooms !== 1 ? 's' : ''}`,
    dwelling && !o.hasUnitStep && !!unit.kitchens && `${unit.kitchens} Cocina${unit.kitchens !== 1 ? 's' : ''}`,
    dwelling && !o.hasUnitStep && !!unit.otherRoomsCount &&
      `${unit.otherRoomsCount} ambiente${unit.otherRoomsCount !== 1 ? 's' : ''} más${unit.otherRoomsDescription ? ` (${unit.otherRoomsDescription})` : ''}`,
    !land && !!unit.floorsCount && unit.floorsCount > 1 && `${unit.floorsCount} Plantas`,
    !land && !!unit.orientation && `Orientación ${unit.orientation}`,
    dwelling && unit.hasServiceRoom && 'Cuarto de Servicio',
    !land && !!unit.garageSpaces && cocheraLabel(unit),
    !land && !!unit.condition && unitConditionLabel(unit.condition),
    !land && !!unit.hoaFee && `Expensas ${formatPrice(unit.hoaFee, unit.currency)}/mes`,
  ];
  return lines.filter((l): l is string => typeof l === 'string' && l.length > 0);
}

function planRow(plan: FinancingPlan, price: number, currency: string): FichaPlanRow {
  const r = computePlan(price, plan);
  const fmt = (n: number) => formatPrice(Math.round(n), currency);
  const lines = [`${plan.downPaymentPct >= 100 ? 'Pago contado' : 'Anticipo'} ${fmt(r.downPayment)}`];
  if (plan.installments > 0) lines.push(`${plural(plan.installments, 'cuota', 'cuotas')} de ${fmt(r.installmentAmount)}`);
  if (plan.boosts > 0) lines.push(`${boostsLabel(plan.boosts, plan.boostEveryMonths)} de ${fmt(r.boostAmount)}`);
  if (r.possessionAmount > 0.5) lines.push(`Saldo a la posesión ${fmt(r.possessionAmount)}`);
  const adjusts = plan.index !== 'ninguno' && (plan.installments > 0 || plan.boosts > 0);
  return {
    name: plan.name,
    planPrice: plan.priceAdjustmentPct ? fmt(r.planPrice) : null,
    lines,
    indexNote: adjusts ? `Cuotas ajustables por ${INDEX_LABEL[plan.index]}` : null,
    note: plan.note?.trim() || null,
  };
}

function accentOf(project: Project): string {
  const accent = { ...getPreset(project.themeConfig?.presetKey).tokens, ...project.themeConfig?.customColors }.accent;
  try {
    return accent && contrastRatio(accent, '#ffffff') >= 3 ? accent : FALLBACK_ACCENT;
  } catch {
    return FALLBACK_ACCENT;
  }
}

// Lo que no es texto impreso: links, colores, URLs de imágenes. No se limpia
// (cambiarle un carácter a una URL la rompe).
const NOT_PRINTED = new Set<string>(['qrUrl', 'href', 'accent', 'color', 'imageUrls']);

/** Todo el texto de la ficha pasado a WinAnsi (ver ./winansi), sin tocar lo de NOT_PRINTED. */
function printable<T>(value: T, key?: string): T {
  if (key && NOT_PRINTED.has(key)) return value;
  if (typeof value === 'string') return toWinAnsi(value) as T;
  if (Array.isArray(value)) return value.map(v => printable(v)) as T;
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, printable(v, k)])) as T;
  }
  return value;
}

export function buildFichaContent(input: FichaInput): FichaContent {
  return printable(fichaContentRaw(input));
}

function fichaContentRaw(input: FichaInput): FichaContent {
  const { project, unit, typeConfig, plans, now } = input;
  const today = fichaDate(now);
  const currency = unit.currency || 'USD';
  const unitIsLand = typeConfig.unitIsLand;

  const showsPrice = typeConfig.showPrice && !!unit.price && unit.price > 0;
  const showsPlans = showsPrice && plans.length > 0 && showUnitCalculator({
    showCalculator: typeConfig.showCalculator, price: unit.price, unitIsLand, plansCount: plans.length,
  });
  const planRows = showsPlans ? plans.map(p => planRow(p, unit.price!, currency)) : [];

  const hasTour = !!(unit.tourImageUrl || unit.tourData);
  const offersPrice = showsPrice || typeConfig.showLeads;
  const qrLead = hasTour
    ? `Escaneá para ver la unidad en 3D${offersPrice ? ', el recorrido 360° y el precio actualizado' : ' y el recorrido 360°'}`
    : `Escaneá para ver la unidad online${offersPrice ? ' y el precio actualizado' : ''}`;

  const ref = normalizeRef(input.ref);
  const digits = project.whatsappNumber?.replace(/\D/g, '') ?? '';

  return {
    projectName: project.name,
    location: project.location,
    unitName: unit.name,
    status: typeConfig.showStatus ? { label: getStatusLabel(unit.status), color: getStatusColor(unit.status) } : null,
    subtitle: unitIsLand ? null : unitIsDwelling(unit) ? unit.modelName || null : UNIT_CATEGORY_LABEL[unitCategory(unit)],
    specs: unitSpecLines(unit, { unitIsLand, hasUnitStep: typeConfig.hasUnitStep, hasFloorStep: typeConfig.hasFloorStep, buildingName: input.buildingName }),
    price: showsPrice ? { label: `Precio al ${today}`, amount: formatPrice(unit.price!, currency) } : null,
    askPrice: !showsPrice && typeConfig.showLeads,
    plans: planRows,
    plansNote: planRows.length > 0 ? `Montos calculados al ${today}. Las cuotas se ajustan según el índice indicado.` : null,
    qrUrl: ref ? `${input.unitUrl}?ref=${encodeURIComponent(ref)}` : input.unitUrl,
    qrLead,
    whatsapp: digits ? { label: formatPhoneForDisplay(digits), href: `https://wa.me/${digits}` } : null,
    accent: accentOf(project),
    draft: input.isDraft,
    generatedOn: today,
    imageUrls: {
      hero: unit.interiorImageUrl || unit.galleryImages?.[0] || unit.floorPlan3dUrl || null,
      plan: unit.technicalPlanUrl || unit.plan3dUrl || unit.roomPlanImage || null,
    },
  };
}
