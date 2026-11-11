// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import MotionProvider from './MotionProvider';
import KebabMenu from './KebabMenu';

// Movimiento reducido: fundidos cortos, la suite no espera animaciones largas.
vi.mock('framer-motion', async (importOriginal) => {
  const actual = await importOriginal<typeof import('framer-motion')>();
  return { ...actual, useReducedMotion: () => true };
});

afterEach(cleanup);

function setup(onDelete = vi.fn()) {
  render(
    <MotionProvider>
      <KebabMenu items={[{ label: 'Editar', onClick: () => {} }, { label: 'Borrar', onClick: onDelete, danger: true }]} />
    </MotionProvider>,
  );
  return onDelete;
}

describe('KebabMenu', () => {
  it('abre con ítems de menú y aria-expanded', () => {
    setup();
    const trigger = screen.getByRole('button', { name: 'Más opciones' });
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('menu')).toBeNull();
    fireEvent.click(trigger);
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('menu')).toBeTruthy();
    expect(screen.getAllByRole('menuitem').map(i => i.textContent)).toEqual(['Editar', 'Borrar']);
  });

  it('Escape lo cierra', async () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'Más opciones' }));
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
  });

  it('elegir un ítem llama a su acción y cierra', async () => {
    const onDelete = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Más opciones' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Borrar' }));
    expect(onDelete).toHaveBeenCalledOnce();
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
  });
});
