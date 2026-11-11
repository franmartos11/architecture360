// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import MotionProvider from './MotionProvider';
import Loaded from './Loaded';

vi.mock('framer-motion', async (importOriginal) => {
  const actual = await importOriginal<typeof import('framer-motion')>();
  return { ...actual, useReducedMotion: () => true };
});

function Wrap({ loading }: { loading: boolean }) {
  return (
    <MotionProvider>
      <Loaded loading={loading} skeleton={<div data-testid="skeleton" />}>
        <p>Contenido real</p>
      </Loaded>
    </MotionProvider>
  );
}

afterEach(cleanup);

describe('Loaded', () => {
  it('mientras carga muestra el skeleton y no el contenido', () => {
    render(<Wrap loading />);
    expect(screen.getByTestId('skeleton')).toBeTruthy();
    expect(screen.queryByText('Contenido real')).toBeNull();
  });

  it('cuando termina, el skeleton se va y entra el contenido', () => {
    const { rerender } = render(<Wrap loading />);
    rerender(<Wrap loading={false} />);
    expect(screen.queryByTestId('skeleton')).toBeNull();
    expect(screen.getByText('Contenido real')).toBeTruthy();
  });

  it('si nace cargado, muestra el contenido directo', () => {
    render(<Wrap loading={false} />);
    expect(screen.getByText('Contenido real')).toBeTruthy();
    expect(screen.queryByTestId('skeleton')).toBeNull();
  });
});
