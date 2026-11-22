// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import MotionProvider from './MotionProvider';
import ConfirmProvider, { useConfirm } from './ConfirmProvider';

vi.mock('framer-motion', async (importOriginal) => {
  const actual = await importOriginal<typeof import('framer-motion')>();
  return { ...actual, useReducedMotion: () => true };
});

afterEach(cleanup);

function Harness({ danger = false, onResult }: { danger?: boolean; onResult: (v: boolean) => void }) {
  const confirm = useConfirm();
  return (
    <button type="button" onClick={async () => onResult(await confirm({ title: '¿Borrar?', message: 'No hay vuelta atrás.', danger }))}>
      Pedir
    </button>
  );
}

function setup(danger: boolean) {
  const onResult = vi.fn();
  render(
    <MotionProvider>
      <ConfirmProvider><Harness danger={danger} onResult={onResult} /></ConfirmProvider>
    </MotionProvider>,
  );
  fireEvent.click(screen.getByText('Pedir'));
  return onResult;
}

describe('ConfirmProvider', () => {
  it('abre un alertdialog con título y mensaje', async () => {
    setup(false);
    const dlg = await screen.findByRole('alertdialog');
    expect(document.getElementById(dlg.getAttribute('aria-labelledby')!)?.textContent).toBe('¿Borrar?');
    expect(document.getElementById(dlg.getAttribute('aria-describedby')!)?.textContent).toBe('No hay vuelta atrás.');
  });

  it('foco inicial en Confirmar si no es danger', async () => {
    setup(false);
    await screen.findByRole('alertdialog');
    await waitFor(() => expect(document.activeElement).toBe(screen.getByText('Confirmar')));
  });

  it('foco inicial en Cancelar si es danger', async () => {
    setup(true);
    await screen.findByRole('alertdialog');
    await waitFor(() => expect(document.activeElement).toBe(screen.getByText('Cancelar')));
  });

  it('Confirmar resuelve true', async () => {
    const onResult = setup(false);
    fireEvent.click(await screen.findByText('Confirmar'));
    await waitFor(() => expect(onResult).toHaveBeenCalledWith(true));
  });

  it('Cancelar resuelve false', async () => {
    const onResult = setup(true);
    fireEvent.click(await screen.findByText('Cancelar'));
    await waitFor(() => expect(onResult).toHaveBeenCalledWith(false));
  });

  it('Escape resuelve false y cierra', async () => {
    const onResult = setup(true);
    await screen.findByRole('alertdialog');
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(onResult).toHaveBeenCalledWith(false));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
  });
});
