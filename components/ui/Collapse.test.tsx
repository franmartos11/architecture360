// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import MotionProvider from './MotionProvider';
import Collapse from './Collapse';

vi.mock('framer-motion', async (importOriginal) => {
  const actual = await importOriginal<typeof import('framer-motion')>();
  return { ...actual, useReducedMotion: () => true };
});

function Wrap({ open, unmountOnExit }: { open: boolean; unmountOnExit?: boolean }) {
  return (
    <MotionProvider>
      <Collapse open={open} unmountOnExit={unmountOnExit}>
        <button type="button">Adentro</button>
      </Collapse>
    </MotionProvider>
  );
}

afterEach(cleanup);

describe('Collapse', () => {
  it('cerrado desmonta el contenido (default)', () => {
    render(<Wrap open={false} />);
    expect(screen.queryByText('Adentro')).toBeNull();
  });

  it('abierto muestra el contenido, sin aria-hidden ni inert', () => {
    render(<Wrap open />);
    const btn = screen.getByText('Adentro');
    const panel = btn.parentElement!;
    expect(panel.getAttribute('aria-hidden')).toBe('false');
    expect(panel.hasAttribute('inert')).toBe(false);
  });

  it('al cerrar, el contenido se va', async () => {
    const { rerender } = render(<Wrap open />);
    expect(screen.getByText('Adentro')).toBeTruthy();
    rerender(<Wrap open={false} />);
    await waitFor(() => expect(screen.queryByText('Adentro')).toBeNull());
  });

  it('unmountOnExit=false: cerrado queda montado pero oculto e inerte', () => {
    render(<Wrap open={false} unmountOnExit={false} />);
    const btn = screen.getByText('Adentro');
    const panel = btn.parentElement!;
    expect(panel.getAttribute('aria-hidden')).toBe('true');
    expect(panel.hasAttribute('inert')).toBe(true);
    expect(panel.style.overflow).toBe('hidden');
  });

  it('unmountOnExit=false: al abrir deja de estar oculto', () => {
    const { rerender } = render(<Wrap open={false} unmountOnExit={false} />);
    rerender(<Wrap open unmountOnExit={false} />);
    const panel = screen.getByText('Adentro').parentElement!;
    expect(panel.getAttribute('aria-hidden')).toBe('false');
    expect(panel.hasAttribute('inert')).toBe(false);
  });
});
