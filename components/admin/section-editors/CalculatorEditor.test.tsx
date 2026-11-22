// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import MotionProvider from '@/components/ui/MotionProvider';
import CalculatorEditor from './CalculatorEditor';

vi.mock('framer-motion', async (importOriginal) => {
  const actual = await importOriginal<typeof import('framer-motion')>();
  return { ...actual, useReducedMotion: () => true };
});
vi.mock('@/components/ui/ToastProvider', () => ({ useToast: () => vi.fn() }));

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({
    json: () => Promise.resolve({ interestRate: 6, maxYears: 20, minDownPayment: 30 }),
  })));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function Wrap() {
  return <MotionProvider><CalculatorEditor /></MotionProvider>;
}

describe('CalculatorEditor — carga', () => {
  it('mientras carga muestra un skeleton con role="status" y no el formulario', () => {
    render(<Wrap />);
    expect(screen.getByRole('status', { name: 'Cargando' })).toBeTruthy();
    expect(screen.queryByText('Calculadora financiera')).toBeNull();
  });

  it('al cargar reemplaza el skeleton por el formulario', async () => {
    render(<Wrap />);
    await waitFor(() => expect(screen.getByText('Calculadora financiera')).toBeTruthy());
    expect(screen.queryByRole('status')).toBeNull();
  });
});
