// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeAll } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { newPlan } from '@/lib/financing';
import type { Unit } from '@/types';

vi.mock('@/components/ui/LeadCaptureModal', () => ({
  default: ({ isOpen, initialMessage }: { isOpen: boolean; initialMessage?: string }) => (isOpen ? <p data-testid="lead">{initialMessage}</p> : null),
}));
const SETTINGS: Record<string, unknown> = {
  pozo: { interestRate: 5.5, maxYears: 30, minDownPayment: 20, financingPlans: [{ ...newPlan(), name: 'Plan 36' }] },
  hipo: { interestRate: 5.5, maxYears: 30, minDownPayment: 20, financingPlans: [] },
  cero: { interestRate: 0, maxYears: 10, minDownPayment: 20, financingPlans: [] },
};
vi.stubGlobal('fetch', (url: string) => {
  const slug = new URL(url, 'http://x').searchParams.get('projectSlug') ?? '';
  return Promise.resolve({ ok: true, json: () => Promise.resolve(SETTINGS[slug] ?? null) });
});

import MortgageCalculatorModal from './MortgageCalculatorModal';

beforeAll(() => {
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) { this.open = true; };
  HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) { this.open = false; };
});
afterEach(() => cleanup());

const UNIT = { id: 'N01-07', dbId: 'u-1', name: 'N01-07', price: 100_000, currency: 'USD' } as Unit;

describe('Calculadora de la unidad', () => {
  it('con planes: desglose sobre el precio de la unidad y consulta con el plan', async () => {
    render(<MortgageCalculatorModal isOpen onClose={() => {}} unitPrice={100_000} currency="USD" projectSlug="pozo" unit={UNIT} />);
    await screen.findByText('36 cuotas de');
    expect(screen.queryByText('Plazo del crédito')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Consultar por este plan' }));
    expect(screen.getByTestId('lead').textContent).toContain('Plan 36 para la unidad N01-07');
  });

  it('sin planes: el simulador hipotecario de siempre', async () => {
    render(<MortgageCalculatorModal isOpen onClose={() => {}} unitPrice={100_000} currency="USD" projectSlug="hipo" unit={UNIT} />);
    await screen.findByText('Plazo del crédito');
    expect(screen.queryByText('36 cuotas de')).toBeNull();
  });

  it('tasa 0%: la cuota es el monto dividido, no NaN', async () => {
    render(<MortgageCalculatorModal isOpen onClose={() => {}} unitPrice={120_000} currency="USD" projectSlug="cero" unit={UNIT} />);
    await screen.findByText('Plazo del crédito');
    expect(document.body.textContent).not.toContain('NaN');
  });
});
