// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { PlanBreakdown, PlanSelector } from './PlanBreakdown';
import { formatPrice } from '@/lib/units';
import type { FinancingPlan } from '@/lib/financing';

afterEach(() => cleanup());

const PLAN: FinancingPlan = {
  id: 'p1', name: 'Plan 36', downPaymentPct: 30, installments: 36, installmentsPct: 40,
  boosts: 3, boostEveryMonths: 6, boostsPct: 15, priceAdjustmentPct: 0, index: 'CAC',
};

describe('PlanBreakdown', () => {
  it('muestra anticipo, cuotas, refuerzos y saldo con sus montos', () => {
    render(<PlanBreakdown plan={PLAN} price={100_000} currency="USD" />);
    expect(screen.getByText('Anticipo (30%)')).toBeTruthy();
    expect(screen.getByText(formatPrice(30_000, 'USD'))).toBeTruthy();
    expect(screen.getByText('36 cuotas de')).toBeTruthy();
    expect(screen.getAllByText(formatPrice(Math.round(40_000 / 36), 'USD')).length).toBeGreaterThan(0);
    expect(screen.getByText('3 refuerzos semestrales de')).toBeTruthy();
    expect(screen.getByText(formatPrice(5_000, 'USD'))).toBeTruthy();
    expect(screen.getByText('Saldo a la posesión (15%)')).toBeTruthy();
    expect(screen.getByText(/ajustables por CAC/)).toBeTruthy();
  });

  it('con descuento muestra el precio del plan', () => {
    render(<PlanBreakdown plan={{ ...PLAN, priceAdjustmentPct: -10 }} price={100_000} currency="USD" />);
    expect(screen.getByText('Precio con este plan (−10%)')).toBeTruthy();
    expect(screen.getByText(formatPrice(90_000, 'USD'))).toBeTruthy();
  });

  it('contado: sin filas de cuotas ni refuerzos', () => {
    render(<PlanBreakdown plan={{ ...PLAN, downPaymentPct: 100, installments: 0, installmentsPct: 0, boosts: 0, boostsPct: 0, index: 'ninguno' }} price={100_000} currency="USD" />);
    expect(screen.queryByText(/cuotas de/)).toBeNull();
    expect(screen.queryByText(/refuerzo/)).toBeNull();
    expect(screen.queryByText(/posesión/)).toBeNull();
  });
});

describe('PlanSelector', () => {
  it('marca el elegido y avisa el cambio', () => {
    let chosen = '';
    const plans = [PLAN, { ...PLAN, id: 'p2', name: 'Contado' }];
    render(<PlanSelector plans={plans} value="p1" onChange={id => { chosen = id; }} />);
    expect(screen.getByRole('button', { name: /Plan 36/ }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: /Contado/ }));
    expect(chosen).toBe('p2');
  });

  it('con un solo plan no muestra selector', () => {
    const { container } = render(<PlanSelector plans={[PLAN]} value="p1" onChange={() => {}} />);
    expect(container.textContent).toBe('');
  });
});
