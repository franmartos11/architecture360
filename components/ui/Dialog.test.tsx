// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor, act } from '@testing-library/react';
import { useRef, useState } from 'react';
import MotionProvider from './MotionProvider';
import Dialog from './Dialog';

vi.mock('framer-motion', async (importOriginal) => {
  const actual = await importOriginal<typeof import('framer-motion')>();
  return { ...actual, useReducedMotion: () => true };
});

function Harness({ initialOpen = false, onClose, dismissible, role, useInitialFocus = false }: {
  initialOpen?: boolean;
  onClose?: () => void;
  dismissible?: boolean;
  role?: 'dialog' | 'alertdialog';
  useInitialFocus?: boolean;
}) {
  const [open, setOpen] = useState(initialOpen);
  const nameRef = useRef<HTMLInputElement>(null);
  const close = () => { setOpen(false); onClose?.(); };
  return (
    <MotionProvider>
      <button type="button" onClick={() => setOpen(true)}>Abrir</button>
      <Dialog
        open={open}
        onClose={close}
        title="Invitar"
        description="Le llega un mail."
        role={role}
        dismissible={dismissible}
        initialFocus={useInitialFocus ? nameRef : undefined}
        footer={<button type="button" onClick={close}>Listo</button>}
      >
        <input ref={nameRef} aria-label="Nombre" />
      </Dialog>
    </MotionProvider>
  );
}

beforeEach(() => {
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
});
afterEach(() => {
  cleanup();
  document.body.style.cssText = '';
});

describe('Dialog', () => {
  it('cerrado no renderiza nada', () => {
    render(<Harness />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('abierto: role, aria-modal, título y bajada enlazados', () => {
    render(<Harness initialOpen />);
    const dialog = screen.getByRole('dialog', { name: 'Invitar' });
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    const descId = dialog.getAttribute('aria-describedby')!;
    expect(document.getElementById(descId)?.textContent).toBe('Le llega un mail.');
  });

  it('acepta alertdialog', () => {
    render(<Harness initialOpen role="alertdialog" />);
    expect(screen.getByRole('alertdialog', { name: 'Invitar' })).toBeTruthy();
  });

  it('al abrir enfoca el primer enfocable (el botón de cerrar de la cabecera)', () => {
    render(<Harness />);
    fireEvent.click(screen.getByText('Abrir'));
    expect(document.activeElement).toBe(screen.getByLabelText('Cerrar'));
  });

  it('initialFocus manda', () => {
    render(<Harness useInitialFocus />);
    fireEvent.click(screen.getByText('Abrir'));
    expect(document.activeElement).toBe(screen.getByLabelText('Nombre'));
  });

  it('Tab queda atrapado adentro, en las dos direcciones', () => {
    render(<Harness initialOpen />);
    const cerrar = screen.getByLabelText('Cerrar');
    const listo = screen.getByText('Listo');

    act(() => listo.focus());
    fireEvent.keyDown(listo, { key: 'Tab' });
    expect(document.activeElement).toBe(cerrar);

    fireEvent.keyDown(cerrar, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(listo);
  });

  it('Escape cierra', () => {
    const onClose = vi.fn();
    render(<Harness initialOpen onClose={onClose} />);
    fireEvent.keyDown(document.activeElement ?? document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('el clic en el fondo cierra', async () => {
    const onClose = vi.fn();
    render(<Harness initialOpen onClose={onClose} />);
    fireEvent.click(document.querySelector('[data-dialog-backdrop]')!);
    expect(onClose).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('dismissible=false: ni Escape ni el fondo cierran; el botón sí', () => {
    const onClose = vi.fn();
    render(<Harness initialOpen dismissible={false} onClose={onClose} />);
    fireEvent.keyDown(document.activeElement ?? document, { key: 'Escape' });
    fireEvent.click(document.querySelector('[data-dialog-backdrop]')!);
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('Listo'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('al cerrar, el foco vuelve a donde estaba', () => {
    render(<Harness />);
    const trigger = screen.getByText('Abrir');
    trigger.focus();
    fireEvent.click(trigger);
    expect(document.activeElement).not.toBe(trigger);

    fireEvent.click(screen.getByText('Listo'));
    expect(document.activeElement).toBe(trigger);
  });

  it('congela el scroll de fondo mientras está abierto', () => {
    const { rerender } = render(<Harness initialOpen />);
    expect(document.body.style.position).toBe('fixed');
    rerender(<Harness initialOpen={false} />);
  });
});
