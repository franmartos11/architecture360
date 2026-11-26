import type { Locale } from '@/lib/i18n/locales';
import { z } from 'zod';
import { formatPrice } from '@/lib/units';
import { newId } from '@/lib/analytics/client-state';

// Planes de pago en pozo que carga la desarrolladora (anticipo + cuotas
// durante la obra + refuerzos + saldo a la posesión). Se guardan como lista
// en calculator_settings.financing_plans y los leen las calculadoras del sitio.
// Spec: docs/superpowers/specs/2026-11-24-calculadora-pozo-design.md

export const FINANCING_INDEXES = ['ninguno', 'CAC', 'UVA', 'dolar'] as const;
export type FinancingIndex = (typeof FINANCING_INDEXES)[number];

export const INDEX_LABEL: Record<FinancingIndex, string> = {
  ninguno: 'Sin ajuste',
  CAC: 'CAC',
  UVA: 'UVA',
  dolar: 'dólar',
};

const INDEX_LABEL_EN: Record<FinancingIndex, string> = { ninguno: 'No adjustment', CAC: 'CAC', UVA: 'UVA', dolar: 'USD' };

export function indexLabel(i: FinancingIndex, locale: Locale = 'es'): string {
  return (locale === 'en' ? INDEX_LABEL_EN : INDEX_LABEL)[i];
}

export const MAX_PLANS = 6;

const pct = z.number().min(0).max(100);
const count = z.number().int().min(0).max(240);

export const financingPlanSchema = z.object({
  id: z.string().min(1).max(60),
  name: z.string().trim().min(1, 'Falta el nombre').max(60),
  downPaymentPct: pct,
  installments: count,
  installmentsPct: pct,
  boosts: count,
  boostEveryMonths: z.number().int().min(1).max(60),
  boostsPct: pct,
  /** Negativo = descuento sobre el precio de lista (ej. contado −10). */
  priceAdjustmentPct: z.number().min(-50).max(50),
  index: z.enum(FINANCING_INDEXES),
  note: z.string().trim().max(200).optional(),
})
  .refine(p => p.downPaymentPct + p.installmentsPct + p.boostsPct <= 100 + 1e-9, { message: 'Anticipo, cuotas y refuerzos suman más de 100%.' })
  .refine(p => (p.installments > 0) === (p.installmentsPct > 0), { message: 'Las cuotas necesitan cantidad y porcentaje.' })
  .refine(p => (p.boosts > 0) === (p.boostsPct > 0), { message: 'Los refuerzos necesitan cantidad y porcentaje.' });

export type FinancingPlan = z.infer<typeof financingPlanSchema>;

export const financingPlansSchema = z.array(financingPlanSchema).max(MAX_PLANS)
  .refine(ps => new Set(ps.map(p => p.id)).size === ps.length, { message: 'Hay dos planes con el mismo id.' });

/** Lo que viene de la base, a prueba de datos viejos o rotos: se queda con los planes válidos. */
export function parseStoredPlans(raw: unknown): FinancingPlan[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  return raw.flatMap(p => {
    const r = financingPlanSchema.safeParse(p);
    if (!r.success || seen.has(r.data.id)) return [];
    seen.add(r.data.id);
    return [r.data];
  }).slice(0, MAX_PLANS);
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** % del precio que queda para la posesión. */
export function possessionPct(p: Pick<FinancingPlan, 'downPaymentPct' | 'installmentsPct' | 'boostsPct'>): number {
  return Math.max(0, round2(100 - p.downPaymentPct - p.installmentsPct - p.boostsPct));
}

export interface PlanBreakdown {
  planPrice: number;
  downPayment: number;
  installmentAmount: number;
  installmentsTotal: number;
  boostAmount: number;
  boostsTotal: number;
  possessionPct: number;
  possessionAmount: number;
}

export function computePlan(price: number, plan: FinancingPlan): PlanBreakdown {
  const planPrice = price * (1 + plan.priceAdjustmentPct / 100);
  const part = (p: number) => (planPrice * p) / 100;
  const installmentsTotal = part(plan.installmentsPct);
  const boostsTotal = part(plan.boostsPct);
  const downPayment = part(plan.downPaymentPct);
  return {
    planPrice,
    downPayment,
    installmentAmount: plan.installments > 0 ? installmentsTotal / plan.installments : 0,
    installmentsTotal,
    boostAmount: plan.boosts > 0 ? boostsTotal / plan.boosts : 0,
    boostsTotal,
    // El % redondeado es para mostrar; el monto es lo que falta, así las partes siempre cierran.
    possessionPct: possessionPct(plan),
    possessionAmount: Math.max(0, planPrice - downPayment - installmentsTotal - boostsTotal),
  };
}

const fmtPct = (n: number) => `${n.toLocaleString('es-AR', { maximumFractionDigits: 2 })}%`;

const FREQ: Record<number, [string, string]> = { 3: ['trimestral', 'trimestrales'], 6: ['semestral', 'semestrales'], 12: ['anual', 'anuales'] };

export function boostsLabel(boosts: number, everyMonths: number): string {
  const f = FREQ[everyMonths];
  const noun = boosts === 1 ? 'refuerzo' : 'refuerzos';
  return f ? `${boosts} ${noun} ${f[boosts === 1 ? 0 : 1]}` : `${boosts} ${noun} cada ${everyMonths} meses`;
}

/** "30% de anticipo + 36 cuotas + 3 refuerzos semestrales + 15% a la posesión · cuotas ajustables por CAC" */
export function describePlan(p: FinancingPlan): string {
  const parts = [`${fmtPct(p.downPaymentPct)} de anticipo`];
  if (p.installments > 0) parts.push(`${p.installments} ${p.installments === 1 ? 'cuota' : 'cuotas'}`);
  if (p.boosts > 0) parts.push(boostsLabel(p.boosts, p.boostEveryMonths));
  const poss = possessionPct(p);
  if (poss > 0) parts.push(`${fmtPct(poss)} a la posesión`);

  const pieces = [];
  if (p.priceAdjustmentPct < 0) pieces.push(`${fmtPct(-p.priceAdjustmentPct)} de descuento`);
  if (p.priceAdjustmentPct > 0) pieces.push(`${fmtPct(p.priceAdjustmentPct)} de recargo`);
  pieces.push(parts.join(' + '));
  if (p.index !== 'ninguno' && (p.installments > 0 || p.boosts > 0)) pieces.push(`cuotas ajustables por ${INDEX_LABEL[p.index]}`);
  return pieces.join(' · ');
}

/** Mensaje prellenado del formulario de contacto al consultar por un plan. `subject`: "la unidad N01-07", "el modelo Duet". */
export function planLeadMessage(plan: FinancingPlan, price: number, currency: string, subject?: string): string {
  const r = computePlan(price, plan);
  const fmt = (n: number) => formatPrice(Math.round(n), currency);
  const montos = [`anticipo ${fmt(r.downPayment)}`];
  if (plan.installments > 0) montos.push(`${plan.installments} ${plan.installments === 1 ? 'cuota' : 'cuotas'} de ${fmt(r.installmentAmount)}`);
  if (plan.boosts > 0) montos.push(`${plan.boosts} ${plan.boosts === 1 ? 'refuerzo' : 'refuerzos'} de ${fmt(r.boostAmount)}`);
  if (r.possessionAmount > 0) montos.push(`saldo a la posesión ${fmt(r.possessionAmount)}`);
  return `Hola, me interesa el ${plan.name}${subject ? ` para ${subject}` : ''} (${describePlan(plan)}). Sobre ${fmt(r.planPrice)}: ${montos.join(', ')}.`;
}

/** Plantilla para "Agregar plan": la forma más común en pozo. */
export function newPlan(): FinancingPlan {
  return {
    id: newId(),
    name: 'Plan en cuotas',
    downPaymentPct: 30,
    installments: 36,
    installmentsPct: 40,
    boosts: 3,
    boostEveryMonths: 6,
    boostsPct: 15,
    priceAdjustmentPct: 0,
    index: 'CAC',
  };
}

/**
 * Si la ficha de una unidad muestra la calculadora: hace falta precio (nunca
 * se calcula sobre un valor inventado) y, en un lote, planes cargados (un
 * simulador hipotecario sobre un lote confunde).
 */
export function showUnitCalculator(o: { showCalculator: boolean; price: number | null | undefined; unitIsLand: boolean; plansCount: number }): boolean {
  if (!o.showCalculator || !o.price || o.price <= 0) return false;
  return !o.unitIsLand || o.plansCount > 0;
}

/** "Ejemplo sobre 100.000: anticipo 30.000 · 36 cuotas de 1.111 · …" (para el bot: montos ya calculados). */
export function planExampleText(plan: FinancingPlan, price = 100_000): string {
  const r = computePlan(price, plan);
  const n = (v: number) => Math.round(v).toLocaleString('es-AR');
  const parts = [`anticipo ${n(r.downPayment)}`];
  if (plan.installments > 0) parts.push(`${plan.installments} ${plan.installments === 1 ? 'cuota' : 'cuotas'} de ${n(r.installmentAmount)}`);
  if (plan.boosts > 0) parts.push(`${plan.boosts} ${plan.boosts === 1 ? 'refuerzo' : 'refuerzos'} de ${n(r.boostAmount)}`);
  if (r.possessionAmount > 0.5) parts.push(`posesión ${n(r.possessionAmount)}`);
  return `Ejemplo sobre ${n(price)}${plan.priceAdjustmentPct ? ` (precio con el plan ${n(r.planPrice)})` : ''}: ${parts.join(' · ')}`;
}

