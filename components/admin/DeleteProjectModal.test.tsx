// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import MotionProvider from '@/components/ui/MotionProvider';
import DeleteProjectModal from './DeleteProjectModal';

vi.mock('framer-motion', async (importOriginal) => {
  const actual = await importOriginal<typeof import('framer-motion')>();
  return { ...actual, useReducedMotion: () => true };
});
vi.mock('@/components/ui/ToastProvider', () => ({ useToast: () => vi.fn() }));

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const project = { id: 'p1', name: 'Torre Norte' };

function setup(p: typeof project | null = project) {
  const onClose = vi.fn();
  const onDeleted = vi.fn();
  render(
    <MotionProvider>
      <DeleteProjectModal project={p} onClose={onClose} onDeleted={onDeleted} />
    </MotionProvider>,
  );
  return { onClose, onDeleted };
}

describe('DeleteProjectModal', () => {
  it('no renderiza nada sin proyecto', () => {
    setup(null);
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('es un alertdialog con el nombre del proyecto', async () => {
    setup();
    const dlg = await screen.findByRole('alertdialog');
    expect(document.getElementById(dlg.getAttribute('aria-labelledby')!)?.textContent).toBe('¿Eliminar "Torre Norte"?');
  });

  it('foco inicial en el campo de confirmación, no en el botón de borrar', async () => {
    setup();
    await screen.findByRole('alertdialog');
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText(/escribí el nombre exacto/)));
    expect(document.activeElement).not.toBe(screen.getByText('Eliminar proyecto'));
  });

  it('el botón de borrar queda deshabilitado hasta escribir el nombre exacto', async () => {
    setup();
    const btn = await screen.findByText('Eliminar proyecto');
    expect((btn as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText(/escribí el nombre exacto/), { target: { value: 'Torre Norte' } });
    expect((btn as HTMLButtonElement).disabled).toBe(false);
  });

  it('Escape y Cancelar llaman a onClose', async () => {
    const { onClose } = setup();
    await screen.findByRole('alertdialog');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByText('Cancelar'));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('confirmar borra y avisa con onDeleted', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    const { onDeleted } = setup();
    fireEvent.change(await screen.findByLabelText(/escribí el nombre exacto/), { target: { value: 'Torre Norte' } });
    fireEvent.click(screen.getByText('Eliminar proyecto'));
    await waitFor(() => expect(onDeleted).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledWith('/api/admin/projects/p1', { method: 'DELETE' });
  });
});
