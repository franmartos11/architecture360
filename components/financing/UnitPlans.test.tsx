// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { newPlan } from '@/lib/financing';
import type { Unit } from '@/types';

vi.mock('@/components/ui/LeadCaptureModal', () => ({
  default: ({ isOpen, initialMessage }: { isOpen: boolean; initialMessage?: string }) => (isOpen ? <p data-testid="lead">{initialMessage}</p> : null),
}));

import UnitPlans from './UnitPlans';

afterEach(() => cleanup());

describe('UnitPlans (celular)', () => {
  it('muestra el plan y "Consultar por este plan" abre el formulario con el plan y la unidad', () => {
    const plans = [{ ...newPlan(), name: 'Plan 36' }, { ...newPlan(), id: 'p2', name: 'Plan 24', installments: 24 }];
    render(<UnitPlans plans={plans} price={100_000} currency="USD" projectSlug="torre" unit={{ name: 'N01-07' } as Unit} />);
    expect(screen.getByText('36 cuotas de')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Plan 24' }));
    expect(screen.getByText('24 cuotas de')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Consultar por este plan' }));
    expect(screen.getByTestId('lead').textContent).toContain('Plan 24 para la unidad N01-07');
  });
});
