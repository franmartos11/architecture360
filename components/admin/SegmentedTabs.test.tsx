// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeAll } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import MotionProvider from '@/components/ui/MotionProvider';
import { SegmentedTabs } from './panel-ui';
import { stubLayout } from './test-layout';

// Instantáneo: el test mira dónde queda la pastilla, no el resorte.
vi.mock('framer-motion', async (importOriginal) => {
  const actual = await importOriginal<typeof import('framer-motion')>();
  return { ...actual, useReducedMotion: () => true };
});

beforeAll(stubLayout);
afterEach(cleanup);

const OPTIONS = [{ value: '7', label: '7 días' }, { value: '30', label: '30 días' }, { value: 'all', label: 'Todo' }];

function Tabs({ value, onChange = () => {} }: { value: string; onChange?: (v: string) => void }) {
  return (
    <MotionProvider>
      <SegmentedTabs label="Período" value={value} onChange={onChange} options={OPTIONS} />
    </MotionProvider>
  );
}

const pill = (container: HTMLElement) => container.querySelector<HTMLElement>('[data-sliding-indicator]');

describe('SegmentedTabs', () => {
  it('pone la pastilla sobre la opción activa', async () => {
    const { container } = render(<Tabs value="30" />);
    const p = pill(container)!;
    expect(p).toBeTruthy();
    // test-layout: la opción n (desde 0) mide 80 px y está en x = 10 + 100n.
    // framer-motion aplica el estilo en el cuadro siguiente.
    await waitFor(() => expect(p.style.transform).toContain('translateX(110px)'));
    expect(p.style.width).toBe('80px');
    expect(screen.getByRole('radio', { name: '30 días' }).getAttribute('aria-checked')).toBe('true');
  });

  it('se mueve al cambiar value', async () => {
    const { container, rerender } = render(<Tabs value="7" />);
    await waitFor(() => expect(pill(container)!.style.transform).toContain('translateX(10px)'));
    rerender(<Tabs value="all" />);
    await waitFor(() => expect(pill(container)!.style.transform).toContain('translateX(210px)'));
  });

  it('avisa la opción elegida', () => {
    const onChange = vi.fn();
    render(<Tabs value="7" onChange={onChange} />);
    fireEvent.click(screen.getByRole('radio', { name: 'Todo' }));
    expect(onChange).toHaveBeenCalledWith('all');
  });
});
