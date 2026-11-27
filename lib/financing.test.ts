import { describe, it, expect } from 'vitest';
import {
  financingPlanSchema, financingPlansSchema, parseStoredPlans, possessionPct, computePlan, describePlan, planLeadMessage, newPlan, showUnitCalculator,
  type FinancingPlan,
} from './financing';

const base: FinancingPlan = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Plan 36',
  downPaymentPct: 30,
  installments: 36,
  installmentsPct: 40,
  boosts: 3,
  boostEveryMonths: 6,
  boostsPct: 15,
  priceAdjustmentPct: 0,
  index: 'CAC',
};

describe('possessionPct', () => {
  it('es lo que falta para el 100%', () => {
    expect(possessionPct(base)).toBe(15);
  });
  it('sin decimales flotantes raros', () => {
    expect(possessionPct({ ...base, downPaymentPct: 33.3, installmentsPct: 33.3, boostsPct: 33.3 })).toBe(0.1);
  });
});

describe('financingPlanSchema', () => {
  it('plan válido', () => {
    expect(financingPlanSchema.safeParse(base).success).toBe(true);
  });
  it('si suma más de 100% es inválido', () => {
    expect(financingPlanSchema.safeParse({ ...base, downPaymentPct: 60 }).success).toBe(false);
  });
  it('% en cuotas sin cantidad de cuotas es inválido (y al revés)', () => {
    expect(financingPlanSchema.safeParse({ ...base, installments: 0 }).success).toBe(false);
    expect(financingPlanSchema.safeParse({ ...base, installmentsPct: 0, boostsPct: 15 }).success).toBe(false);
  });
  it('% en refuerzos sin cantidad de refuerzos es inválido', () => {
    expect(financingPlanSchema.safeParse({ ...base, boosts: 0 }).success).toBe(false);
  });
  it('sin cuotas ni refuerzos (contado) es válido', () => {
    expect(financingPlanSchema.safeParse({ ...base, name: 'Contado', downPaymentPct: 100, installments: 0, installmentsPct: 0, boosts: 0, boostsPct: 0, priceAdjustmentPct: -10, index: 'ninguno' }).success).toBe(true);
  });
  it('nombre vacío o ajuste fuera de ±50% es inválido', () => {
    expect(financingPlanSchema.safeParse({ ...base, name: ' ' }).success).toBe(false);
    expect(financingPlanSchema.safeParse({ ...base, priceAdjustmentPct: -60 }).success).toBe(false);
  });
  it('máximo 6 planes', () => {
    expect(financingPlansSchema.safeParse(Array.from({ length: 7 }, (_, i) => ({ ...base, id: `${i}1111111-1111-4111-8111-111111111111` }))).success).toBe(false);
  });
});

describe('parseStoredPlans', () => {
  it('descarta lo inválido y se queda con lo válido', () => {
    expect(parseStoredPlans([base, { ...base, downPaymentPct: 90 }, 'basura', null]).map(p => p.name)).toEqual(['Plan 36']);
  });
  it('no es una lista: vacío', () => {
    expect(parseStoredPlans(null)).toEqual([]);
    expect(parseStoredPlans({})).toEqual([]);
  });
});

describe('computePlan', () => {
  it('desglose sobre el precio', () => {
    const r = computePlan(100_000, base);
    expect(r).toEqual({
      planPrice: 100_000,
      downPayment: 30_000,
      installmentAmount: 40_000 / 36,
      installmentsTotal: 40_000,
      boostAmount: 5_000,
      boostsTotal: 15_000,
      possessionPct: 15,
      possessionAmount: 15_000,
    });
  });
  it('con descuento todo se calcula sobre el precio del plan', () => {
    const r = computePlan(100_000, { ...base, priceAdjustmentPct: -10 });
    expect(r.planPrice).toBe(90_000);
    expect(r.downPayment).toBe(27_000);
  });
  it('las partes suman el precio del plan', () => {
    const r = computePlan(123_457, { ...base, priceAdjustmentPct: 7 });
    expect(r.downPayment + r.installmentsTotal + r.boostsTotal + r.possessionAmount).toBeCloseTo(r.planPrice, 6);
  });
  it('sin cuotas ni refuerzos: montos en cero, no NaN', () => {
    const r = computePlan(100_000, { ...base, installments: 0, installmentsPct: 0, boosts: 0, boostsPct: 0 });
    expect(r.installmentAmount).toBe(0);
    expect(r.boostAmount).toBe(0);
  });
});

describe('describePlan', () => {
  it('una línea legible', () => {
    expect(describePlan(base)).toBe('30% de anticipo + 36 cuotas + 3 refuerzos semestrales + 15% a la posesión · cuotas ajustables por CAC');
  });
  it('contado con descuento', () => {
    expect(describePlan({ ...base, downPaymentPct: 100, installments: 0, installmentsPct: 0, boosts: 0, boostsPct: 0, priceAdjustmentPct: -10, index: 'ninguno' }))
      .toBe('10% de descuento · 100% de anticipo');
  });
  it('refuerzos cada 4 meses y 1 cuota', () => {
    expect(describePlan({ ...base, installments: 1, boosts: 1, boostEveryMonths: 4, index: 'ninguno' }))
      .toBe('30% de anticipo + 1 cuota + 1 refuerzo cada 4 meses + 15% a la posesión');
  });
});

describe('planLeadMessage', () => {
  it('incluye plan, unidad y montos', () => {
    const msg = planLeadMessage(base, 100_000, 'USD', 'la unidad N01-07');
    expect(msg).toContain('Plan 36');
    expect(msg).toContain('para la unidad N01-07');
    expect(msg).toContain('36 cuotas de');
    expect(msg).toContain('Hola');
  });
});

describe('newPlan', () => {
  it('plantilla válida con id nuevo', () => {
    const a = newPlan();
    const b = newPlan();
    expect(financingPlanSchema.safeParse(a).success).toBe(true);
    expect(a.id).not.toBe(b.id);
  });
});

describe('revisión: montos que cierran e ids únicos', () => {
  it('las partes suman exactamente el precio del plan aunque los % tengan muchos decimales', () => {
    for (const plan of [
      { ...base, downPaymentPct: 33.333, installmentsPct: 33.333, boostsPct: 33.333 },
      { ...base, downPaymentPct: 30.005, installmentsPct: 40, boostsPct: 15 },
    ]) {
      const r = computePlan(100_000, plan);
      expect(r.downPayment + r.installmentsTotal + r.boostsTotal + r.possessionAmount).toBeCloseTo(r.planPrice, 6);
    }
  });
  it('dos planes con el mismo id: lista inválida', () => {
    expect(financingPlansSchema.safeParse([base, { ...base, name: 'Otro' }]).success).toBe(false);
  });
});

describe('showUnitCalculator', () => {
  const ok = { showCalculator: true, price: 100_000, unitIsLand: false, plansCount: 0 };
  it('vivienda con precio: sí (hipotecario o planes)', () => {
    expect(showUnitCalculator(ok)).toBe(true);
  });
  it('sin precio: no (nada de precios inventados)', () => {
    expect(showUnitCalculator({ ...ok, price: undefined })).toBe(false);
    expect(showUnitCalculator({ ...ok, price: 0 })).toBe(false);
  });
  it('lote: solo con planes cargados (un hipotecario en un lote confunde)', () => {
    expect(showUnitCalculator({ ...ok, unitIsLand: true, plansCount: 0 })).toBe(false);
    expect(showUnitCalculator({ ...ok, unitIsLand: true, plansCount: 2 })).toBe(true);
  });
  it('si el tipo de proyecto no tiene calculadora: no', () => {
    expect(showUnitCalculator({ ...ok, showCalculator: false, plansCount: 2 })).toBe(false);
  });
});

describe('en inglés (sitio en inglés)', () => {
  it('describePlan', () => {
    expect(describePlan(base, 'en')).toBe('30% down payment + 36 installments + 3 semiannual extra payments + 15% on delivery · installments adjusted by CAC');
    expect(describePlan({ ...base, downPaymentPct: 100, installments: 0, installmentsPct: 0, boosts: 0, boostsPct: 0, priceAdjustmentPct: -10, index: 'ninguno' }, 'en'))
      .toBe('10% discount · 100% down payment');
    expect(describePlan({ ...base, installments: 1, boosts: 1, boostEveryMonths: 4, index: 'ninguno' }, 'en'))
      .toBe('30% down payment + 1 installment + 1 extra payment every 4 months + 15% on delivery');
  });
  it('planLeadMessage: en inglés y con precios de EE. UU.', () => {
    expect(planLeadMessage(base, 85_000_000, 'ARS', 'unit N01-07', 'en').replace(/\u00a0/g, ' ')).toBe(
      "Hi, I'm interested in Plan 36 for unit N01-07 (30% down payment + 36 installments + 3 semiannual extra payments + 15% on delivery · installments adjusted by CAC)."
      + ' Based on ARS 85,000,000: down payment ARS 25,500,000, 36 installments of ARS 944,444, 3 extra payments of ARS 4,250,000, balance on delivery ARS 12,750,000.',
    );
  });
  it('planLeadMessage en castellano: igual que siempre', () => {
    expect(planLeadMessage(base, 100_000, 'USD', 'la unidad N01-07')).toBe(
      'Hola, me interesa el Plan 36 para la unidad N01-07 (30% de anticipo + 36 cuotas + 3 refuerzos semestrales + 15% a la posesión · cuotas ajustables por CAC).'
      + ' Sobre $100,000: anticipo $30,000, 36 cuotas de $1,111, 3 refuerzos de $5,000, saldo a la posesión $15,000.',
    );
  });
});
