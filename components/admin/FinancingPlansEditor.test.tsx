// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeAll } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import ToastProvider from '@/components/ui/ToastProvider';
import MotionProvider from '@/components/ui/MotionProvider';
vi.mock('@/hooks/useCalculatorSettings', () => ({ invalidateCalculatorSettings: vi.fn() }));
import { invalidateCalculatorSettings } from '@/hooks/useCalculatorSettings';
import FinancingPlansEditor from './FinancingPlansEditor';

beforeAll(() => {
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
});
afterEach(() => cleanup());

function setup(initialPlans: unknown[] = []) {
  const calls: { url: string; init?: RequestInit }[] = [];
  global.fetch = vi.fn((url: string, init?: RequestInit) => {
    calls.push({ url, init });
    if (init?.method === 'POST') {
      const body = JSON.parse(String(init.body));
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true, settings: { financingPlans: body.financingPlans } }) });
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ interestRate: 5.5, maxYears: 30, minDownPayment: 20, financingPlans: initialPlans }) });
  }) as never;
  render(<MotionProvider><ToastProvider><FinancingPlansEditor /></ToastProvider></MotionProvider>);
  return calls;
}

describe('FinancingPlansEditor', () => {
  it('agregar un plan y guardar manda la lista a /api/settings', async () => {
    const calls = setup();
    fireEvent.click(await screen.findByRole('button', { name: 'Agregar plan' }));
    expect(screen.getByDisplayValue('Plan en cuotas')).toBeTruthy();
    expect(screen.getByText(/15% a la posesión/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Guardar planes' }));
    await waitFor(() => expect(calls.some(c => c.init?.method === 'POST')).toBe(true));
    const post = calls.find(c => c.init?.method === 'POST')!;
    const body = JSON.parse(String(post.init!.body));
    expect(Object.keys(body)).toEqual(['financingPlans']);
    expect(body.financingPlans).toHaveLength(1);
    expect(body.financingPlans[0].name).toBe('Plan en cuotas');
    await waitFor(() => expect(invalidateCalculatorSettings).toHaveBeenCalled());
  });

  it('si los porcentajes pasan el 100% avisa y no deja guardar', async () => {
    setup();
    fireEvent.click(await screen.findByRole('button', { name: 'Agregar plan' }));
    fireEvent.change(screen.getByLabelText('Anticipo'), { target: { value: '80' } });
    expect(screen.getByText('Anticipo, cuotas y refuerzos suman más de 100%.')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Guardar planes' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('eliminar un plan cargado', async () => {
    setup([{ id: 'p1', name: 'Plan viejo', downPaymentPct: 100, installments: 0, installmentsPct: 0, boosts: 0, boostEveryMonths: 6, boostsPct: 0, priceAdjustmentPct: -10, index: 'ninguno' }]);
    expect(await screen.findByDisplayValue('Plan viejo')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar Plan viejo' }));
    expect(screen.queryByDisplayValue('Plan viejo')).toBeNull();
    expect(screen.getByRole('button', { name: 'Guardar planes' })).toBeTruthy();
  });

  it('si no pudo cargar los planes, avisa y no deja agregar ni guardar (no pisa lo guardado)', async () => {
    global.fetch = vi.fn(() => Promise.reject(new Error('offline'))) as never;
    render(<MotionProvider><ToastProvider><FinancingPlansEditor /></ToastProvider></MotionProvider>);
    expect(await screen.findByText(/No se pudieron cargar los planes/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Agregar plan' })).toBeNull();
  });

  it('nombre vacío: dice que falta el nombre', async () => {
    setup();
    fireEvent.click(await screen.findByRole('button', { name: 'Agregar plan' }));
    fireEvent.change(screen.getByLabelText('Nombre del plan'), { target: { value: ' ' } });
    expect(screen.getByText('Falta el nombre')).toBeTruthy();
  });
});
