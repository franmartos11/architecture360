// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createElement } from 'react';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { newPlan } from '@/lib/financing';

vi.mock('@/components/ui/LeadCaptureModal', () => ({ default: () => null }));

// /api/settings por proyecto: la caché del hook es por slug, así que cada
// caso usa un slug propio.
const SETTINGS: Record<string, unknown> = {
  x: null, // sin configuración: valores por defecto (20% de anticipo)
  y: null,
  lote: null,
  carga: null,
  pozo: { interestRate: 5.5, maxYears: 30, minDownPayment: 20, financingPlans: [{ ...newPlan(), name: 'Plan 36' }, { ...newPlan(), id: 'contado', name: 'Contado', downPaymentPct: 100, installments: 0, installmentsPct: 0, boosts: 0, boostsPct: 0, priceAdjustmentPct: -10, index: 'ninguno' }] },
};
vi.stubGlobal('fetch', (url: string) => {
  const slug = new URL(url, 'http://x').searchParams.get('projectSlug') ?? '';
  return Promise.resolve({ ok: true, json: () => Promise.resolve(SETTINGS[slug] ?? null) });
});

import Calculator from '@/components/Calculator';

afterEach(cleanup);

const models = [{ label: 'Casa A', price: 100000, currency: 'USD' }];

function texto() {
  return screen.getByText('Monto a financiar').parentElement!.textContent!.replace(/[.,]/g, '');
}

// Con modelos cargados, "Otro monto" deja tipear un valor propio y la cuota
// se calcula sobre ese valor (antes el campo solo aparecía sin modelos).
describe('Cotizador · otro monto', () => {
  it('con modelos ofrece "Otro monto" y calcula sobre lo tipeado', async () => {
    render(createElement(Calculator, { projectSlug: 'x', models }));
    await screen.findByText('Monto a financiar');
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(texto()).toContain('80000'); // 100.000 - 20%

    fireEvent.click(screen.getByRole('button', { name: 'Otro monto' }));
    const input = screen.getByRole('textbox');
    expect(texto()).toContain('—');

    fireEvent.change(input, { target: { value: '200000' } });
    expect((input as HTMLInputElement).value).toMatch(/^200[.,]000$/);
    expect(texto()).toContain('160000'); // 200.000 - 20%
    expect(screen.getByText('Anticipo (20%)').parentElement!.textContent!.replace(/[.,]/g, '')).toContain('40000');

    fireEvent.click(screen.getByRole('button', { name: /Casa A/ }));
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(texto()).toContain('80000');
  });

  it('sin modelos sigue mostrando el campo directo', async () => {
    render(createElement(Calculator, { projectSlug: 'y', models: [] }));
    await screen.findByText('Monto a financiar');
    expect(screen.queryByRole('button', { name: 'Otro monto' })).toBeNull();
    expect(screen.getByRole('textbox')).toBeTruthy();
  });
});

describe('Cotizador · planes de pago en pozo', () => {
  it('con planes cargados muestra los planes en vez del hipotecario', async () => {
    render(createElement(Calculator, { projectSlug: 'pozo', models }));
    await screen.findByText('36 cuotas de');
    expect(screen.queryByText('Monto a financiar')).toBeNull();
    expect(screen.queryByText('Tasa de interés anual')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Contado' }));
    expect(screen.queryByText('36 cuotas de')).toBeNull();
    expect(screen.getByText('Precio con este plan (−10%)')).toBeTruthy();
  });
});

describe('Cotizador · revisión', () => {
  it('loteo sin planes: no muestra el simulador hipotecario', async () => {
    const { container } = render(createElement(Calculator, { projectSlug: 'lote', models, plansOnly: true }));
    await new Promise(r => setTimeout(r, 20));
    expect(screen.queryByText('Monto a financiar')).toBeNull();
    expect(container.querySelector('#cotizador')).toBeNull();
  });

  it('mientras carga ya existe #cotizador (los links del menú no se rompen)', () => {
    const { container } = render(createElement(Calculator, { projectSlug: 'carga', models }));
    expect(container.querySelector('#cotizador')).not.toBeNull();
  });
});
