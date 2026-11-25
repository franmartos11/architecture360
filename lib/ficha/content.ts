import type { Building, Project, Room, Unit } from '@/types';
import type { ProjectTypeConfig } from '@/lib/project-types';
import {
  formatPrice, getStatusLabel, getStatusColor, unitIsDwelling, unitCategory,
  UNIT_CATEGORY_LABEL, cocheraLabel, unitConditionLabel,
} from '@/lib/units';
import { boostsLabel, computePlan, showUnitCalculator, INDEX_LABEL, type FinancingPlan } from '@/lib/financing';
import { progressHeadline } from '@/lib/construction-progress-view';
import { pickUnitView } from '@/lib/floor-views';
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
  /** Edificio completo (para vista desde el piso y portada); opcional para tests livianos. */
  building?: Building;
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

export interface FichaRoomRow {
  name: string;
  area: string | null;
  features: string | null;
}

export interface FichaTheme {
  bg: string;
  bgAlt: string;
  bgAccent: string;
  surface: string;
  text: string;
  textMuted: string;
  textOnDark: string;
  textOnDarkMuted: string;
  accent: string;
  textOnAccent: string;
  border: string;
  radius: number;
  radiusSm: number;
}

export interface FichaContent {
  projectName: string;
  location: string;
  unitName: string;
  status: { label: string; color: string } | null;
  subtitle: string | null;
  projectSummary: string | null;
  progress: string | null;
  specs: string[];
  features: string[];
  rooms: FichaRoomRow[];
  amenities: string[];
  nearby: string[];
  mapUrl: string | null;
  academic: { label: string; value: string }[];
  price: { label: string; amount: string } | null;
  askPrice: boolean;
  plans: FichaPlanRow[];
  plansNote: string | null;
  qrUrl: string;
  /** "Escaneá para ver…": solo promete el recorrido y el precio si el sitio los tiene. */
  qrLead: string;
  whatsapp: { label: string; href: string } | null;
  accent: string;
  theme: FichaTheme;
  draft: boolean;
  generatedOn: string;
  imageUrls: {
    hero: string | null;
    plan: string | null;
    gallery: { url: string; caption: string | null }[];
    extraPlans: { url: string; label: string }[];
  };
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
    !land && parkingSpotSummary(unit),
    !land && !!unit.condition && unitConditionLabel(unit.condition),
    !land && !!unit.hoaFee && `Expensas ${formatPrice(unit.hoaFee, unit.currency)}/mes`,
  ];
  return lines.filter((l): l is string => typeof l === 'string' && l.length > 0);
}

function parkingSpotSummary(unit: Unit): string | null {
  const spots = unit.parkingSpots?.filter(s => s.label?.trim() || s.floorLabel?.trim()) ?? [];
  if (spots.length === 0) return null;
  const formatted = spots.map(s => {
    const label = s.label?.trim();
    const floor = s.floorLabel?.trim();
    if (label && floor) return `${label} (${floor})`;
    return label || floor || '';
  }).filter(Boolean);
  if (formatted.length === 0) return null;
  return `${formatted.length === 1 ? 'Cochera asignada' : 'Cocheras asignadas'}: ${formatted.join(', ')}`;
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

function parseHex(hex: string): [number, number, number] | null {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const v = parseInt(m[1], 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

function mixHex(fg: string, bg: string, alpha: number): string {
  const a = parseHex(fg);
  const b = parseHex(bg);
  if (!a || !b) return fg;
  const ch = (i: number) => Math.round(a[i] * alpha + b[i] * (1 - alpha)).toString(16).padStart(2, '0');
  return `#${ch(0)}${ch(1)}${ch(2)}`;
}

function parseRadiusPt(raw: string | undefined): number {
  if (!raw) return 4;
  const s = raw.trim().toLowerCase();
  if (s === '0' || s === '0px' || s === '0rem') return 0;
  if (s.endsWith('rem')) {
    const n = parseFloat(s);
    return Number.isFinite(n) ? Math.min(12, Math.max(0, Math.round(n * 8))) : 4;
  }
  if (s.endsWith('px')) {
    const n = parseFloat(s);
    return Number.isFinite(n) ? Math.min(12, Math.max(0, Math.round(n * 0.5))) : 4;
  }
  return 4;
}

function themeOf(project: Project): FichaTheme {
  const preset = getPreset(project.themeConfig?.presetKey);
  const t = { ...preset.tokens, ...project.themeConfig?.customColors };
  let accent = t.accent;
  try {
    if (!accent || contrastRatio(accent, t.surface) < 3) {
      accent = contrastRatio(FALLBACK_ACCENT, t.surface) >= 3 ? FALLBACK_ACCENT : t.text;
    }
  } catch {
    accent = contrastRatio(FALLBACK_ACCENT, t.surface) >= 3 ? FALLBACK_ACCENT : t.text;
  }
  let textOnAccent = t.textOnDark;
  try {
    textOnAccent = contrastRatio(t.textOnDark, accent) >= contrastRatio(t.text, accent) ? t.textOnDark : t.text;
  } catch { /* fallback to textOnDark */ }
  const radius = parseRadiusPt(project.themeConfig?.radius ?? t.radius);
  return {
    bg: t.bg,
    bgAlt: t.bgAlt,
    bgAccent: t.bgAccent,
    surface: t.surface,
    text: t.text,
    textMuted: mixHex(t.text, t.surface, 0.65),
    textOnDark: t.textOnDark,
    textOnDarkMuted: mixHex(t.textOnDark, t.bgAlt, 0.72),
    accent,
    textOnAccent,
    border: mixHex(t.text, t.surface, 0.14),
    radius,
    radiusSm: radius === 0 ? 0 : Math.max(2, Math.round(radius * 0.5)),
  };
}

// Lo que no es texto impreso: links, colores, URLs de imágenes. No se limpia
// (cambiarle un carácter a una URL la rompe).
const NOT_PRINTED = new Set<string>(['qrUrl', 'href', 'mapUrl', 'url', 'hero', 'plan', 'accent', 'color', 'theme']);

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

function excerpt(raw: string | undefined, max = 220): string | null {
  const clean = raw?.replace(/\s+/g, ' ').trim();
  if (!clean) return null;
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max).replace(/\s+\S*$/, '');
  return `${cut || clean.slice(0, max)}…`;
}

function collectRooms(unit: Unit): FichaRoomRow[] {
  const toRow = (r: Room, prefix?: string): FichaRoomRow => ({
    name: prefix ? `${prefix} · ${r.name}` : r.name,
    area: typeof r.area === 'number' && r.area > 0 ? `${r.area} m²` : null,
    features: r.features?.length ? r.features.join(', ') : null,
  });
  const base = (unit.rooms ?? []).filter(r => r.name?.trim()).map(r => toRow(r));
  const extra = (unit.levels ?? []).flatMap(l =>
    (l.rooms ?? []).filter(r => r.name?.trim()).map(r => toRow(r, l.label?.trim()))
  );
  return [...base, ...extra];
}

function collectAcademic(project: Project): { label: string; value: string }[] {
  if (project.saleMode !== 'showcase') return [];
  const rows: { label: string; value: string }[] = [];
  if (project.academicInstitution?.trim()) rows.push({ label: 'Institución', value: project.academicInstitution.trim() });
  if (project.academicCareer?.trim()) rows.push({ label: 'Carrera', value: project.academicCareer.trim() });
  if (project.academicYear?.trim()) rows.push({ label: 'Año', value: project.academicYear.trim() });
  if (project.academicTutor?.trim()) rows.push({ label: 'Docente / Tutor', value: project.academicTutor.trim() });
  if (project.academicTeam?.trim()) rows.push({ label: 'Equipo', value: project.academicTeam.trim() });
  if (project.collaborators?.length) {
    const credits = project.collaborators
      .map(c => c.contribution?.trim() ? `${c.displayName} (${c.contribution.trim()})` : c.displayName)
      .join(', ');
    if (credits) rows.push({ label: 'Créditos', value: credits });
  }
  return rows;
}

function collectGallery(
  unit: Unit,
  building: Building | undefined,
  hero: string | null,
  plan: string | null,
): { url: string; caption: string | null }[] {
  const seen = new Set<string>([hero, plan].filter((u): u is string => !!u));
  const out: { url: string; caption: string | null }[] = [];
  const push = (url: string | null | undefined, caption: string | null) => {
    if (!url || seen.has(url) || out.length >= 3) return;
    seen.add(url);
    out.push({ url, caption });
  };

  // Vista desde el piso hacia la orientación de la unidad (dato real del relevamiento).
  if (building?.floors?.length) {
    const view = pickUnitView(building.floors, unit);
    const photo = view?.photos[view.initialIndex];
    if (photo) {
      push(photo.url, `Vista desde ${view.floorLabel} (${photo.direction})`);
    }
  }
  for (const img of unit.galleryImages ?? []) {
    push(img, null);
  }
  push(unit.floorPlan3dUrl, 'Planta 3D');
  push(building?.coverImage, building?.name || null);
  return out;
}

function collectExtraPlans(unit: Unit, mainPlan: string | null): { url: string; label: string }[] {
  const seen = new Set<string>(mainPlan ? [mainPlan] : []);
  const out: { url: string; label: string }[] = [];
  for (const level of unit.levels ?? []) {
    const url = level.planImage || level.plan3dImage;
    if (!url || seen.has(url) || out.length >= 2) continue;
    seen.add(url);
    out.push({ url, label: level.label?.trim() || 'Planta adicional' });
  }
  return out;
}

export function buildFichaContent(input: FichaInput): FichaContent {
  return printable(fichaContentRaw(input));
}

function fichaContentRaw(input: FichaInput): FichaContent {
  const { project, unit, building, typeConfig, plans, now } = input;
  const today = fichaDate(now);
  const currency = unit.currency || 'USD';
  const unitIsLand = typeConfig.unitIsLand;
  const buildingName = building?.name || input.buildingName;

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

  const hero = unit.interiorImageUrl || unit.galleryImages?.[0] || unit.floorPlan3dUrl || null;
  const plan = unit.technicalPlanUrl || unit.plan3dUrl || unit.roomPlanImage || null;

  const projectSummary = project.tagline?.trim()
    || (project.saleMode === 'showcase' ? excerpt(project.description) : null);

  const amenities = (project.amenities ?? [])
    .filter(a => !a.buildingId || a.buildingId === unit.buildingId)
    .map(a => a.name?.trim())
    .filter((n): n is string => !!n);

  const nearby = (project.pointsOfInterest ?? []).slice(0, 6).map(poi => {
    const dist = poi.walkMinutes ? `${poi.walkMinutes} min a pie` : poi.distanceLabel?.trim();
    return dist ? `${poi.name} (${dist})` : poi.name;
  });

  const mapUrl = typeof project.latitude === 'number' && typeof project.longitude === 'number'
    ? `https://maps.google.com/?q=${project.latitude},${project.longitude}`
    : null;

  return {
    projectName: project.name,
    location: project.location,
    unitName: unit.name,
    status: typeConfig.showStatus ? { label: getStatusLabel(unit.status), color: getStatusColor(unit.status) } : null,
    subtitle: unitIsLand ? null : unitIsDwelling(unit) ? unit.modelName || null : UNIT_CATEGORY_LABEL[unitCategory(unit)],
    projectSummary,
    progress: project.constructionProgress ? progressHeadline(project.constructionProgress, 'es') : null,
    specs: unitSpecLines(unit, { unitIsLand, hasUnitStep: typeConfig.hasUnitStep, hasFloorStep: typeConfig.hasFloorStep, buildingName }),
    features: (unit.features ?? []).map(f => f.trim()).filter(Boolean),
    rooms: unitIsLand ? [] : collectRooms(unit),
    amenities,
    nearby,
    mapUrl,
    academic: collectAcademic(project),
    price: showsPrice ? { label: `Precio al ${today}`, amount: formatPrice(unit.price!, currency) } : null,
    askPrice: !showsPrice && typeConfig.showLeads,
    plans: planRows,
    plansNote: planRows.length > 0 ? `Montos calculados al ${today}. Las cuotas se ajustan según el índice indicado.` : null,
    qrUrl: ref ? `${input.unitUrl}?ref=${encodeURIComponent(ref)}` : input.unitUrl,
    qrLead,
    whatsapp: digits ? { label: formatPhoneForDisplay(digits), href: `https://wa.me/${digits}` } : null,
    accent: themeOf(project).accent,
    theme: themeOf(project),
    draft: input.isDraft,
    generatedOn: today,
    imageUrls: {
      hero,
      plan,
      gallery: collectGallery(unit, building, hero, plan),
      extraPlans: collectExtraPlans(unit, plan),
    },
  };
}
