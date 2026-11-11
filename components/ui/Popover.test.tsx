// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor, act } from '@testing-library/react';
import { useState } from 'react';
import MotionProvider from './MotionProvider';
import Popover, { MenuItem } from './Popover';

// Con movimiento reducido las entradas y salidas son fundidos cortos: la
// suite no espera animaciones largas y prueba lo que importa (foco,
// teclado, clics).
vi.mock('framer-motion', async (importOriginal) => {
  const actual = await importOriginal<typeof import('framer-motion')>();
  return { ...actual, useReducedMotion: () => true };
});

function Harness({ initialOpen = false, onClose }: { initialOpen?: boolean; onClose?: () => void }) {
  const [open, setOpen] = useState(initialOpen);
  const close = () => { setOpen(false); onClose?.(); };
  return (
    <MotionProvider>
      <input aria-label="Afuera" />
      <div className="relative">
        <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open}>Abrir</button>
        <Popover open={open} onClose={close} role="menu" ariaLabel="Acciones">
          <MenuItem onClick={close}>Editar</MenuItem>
          <MenuItem danger onClick={close}>Borrar</MenuItem>
        </Popover>
      </div>
    </MotionProvider>
  );
}

afterEach(cleanup);

describe('Popover', () => {
  it('cerrado no renderiza nada', () => {
    render(<Harness />);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('abre con rol, nombre e ítems de menú', () => {
    render(<Harness initialOpen />);
    const menu = screen.getByRole('menu', { name: 'Acciones' });
    expect(menu).toBeTruthy();
    expect(screen.getAllByRole('menuitem')).toHaveLength(2);
  });

  it('al abrir, el foco va al primer ítem', () => {
    render(<Harness />);
    const trigger = screen.getByText('Abrir');
    trigger.focus();
    fireEvent.click(trigger);
    expect(document.activeElement).toBe(screen.getByText('Editar').closest('button'));
  });

  it('Escape cierra y el foco vuelve al disparador', async () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    const trigger = screen.getByText('Abrir');
    trigger.focus();
    fireEvent.click(trigger);

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(trigger);
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
  });

  it('un clic afuera del contenedor cierra; adentro, no', () => {
    const onClose = vi.fn();
    render(<Harness initialOpen onClose={onClose} />);

    fireEvent.mouseDown(screen.getByText('Abrir'));
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.mouseDown(screen.getByLabelText('Afuera'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('si la persona ya enfocó otra cosa afuera, no le roba el foco al cerrar', () => {
    render(<Harness />);
    const trigger = screen.getByText('Abrir');
    trigger.focus();
    fireEvent.click(trigger);

    const outside = screen.getByLabelText('Afuera');
    act(() => outside.focus());
    fireEvent.mouseDown(outside);

    expect(document.activeElement).toBe(outside);
  });

  it('las flechas recorren los ítems en círculo', () => {
    render(<Harness />);
    fireEvent.click(screen.getByText('Abrir'));
    const [editar, borrar] = screen.getAllByRole('menuitem');
    expect(document.activeElement).toBe(editar);

    fireEvent.keyDown(document, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(borrar);
    fireEvent.keyDown(document, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(editar);
    fireEvent.keyDown(document, { key: 'ArrowUp' });
    expect(document.activeElement).toBe(borrar);
  });

  it('MenuItem danger lleva estilo rojo y el rol correcto', () => {
    render(<Harness initialOpen />);
    const borrar = screen.getByText('Borrar').closest('button')!;
    expect(borrar.getAttribute('role')).toBe('menuitem');
    expect(borrar.className).toContain('text-red-600');
  });
});
