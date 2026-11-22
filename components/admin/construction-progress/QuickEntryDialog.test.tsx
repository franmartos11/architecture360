// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import MotionProvider from '@/components/ui/MotionProvider';
import QuickEntryDialog from './QuickEntryDialog';
import type { ConstructionProgress } from '@/types';

vi.mock('framer-motion', async (importOriginal) => {
  const actual = await importOriginal<typeof import('framer-motion')>();
  return { ...actual, useReducedMotion: () => true };
});
vi.mock('@/components/ui/ConfirmProvider', () => ({ useConfirm: () => vi.fn(async () => true) }));

afterEach(() => { cleanup(); });

const progress: ConstructionProgress = {
  stages: [{ id: 's0', label: 'Estructura' }, { id: 's1', label: 'Terminaciones' }],
  currentStageId: 's1',
  updates: [],
};

function setup(over: Partial<Parameters<typeof QuickEntryDialog>[0]> = {}) {
  const onSubmit = vi.fn(async () => true);
  const onClose = vi.fn();
  const onReload = vi.fn();
  render(
    <MotionProvider>
      <QuickEntryDialog open onClose={onClose} progress={progress} today="2026-11-11" viewOptions={['Frente']}
        onSubmit={onSubmit} conflict={null} onReload={onReload} reloading={false} {...over} />
    </MotionProvider>,
  );
  return { onSubmit, onClose, onReload };
}

describe('QuickEntryDialog', () => {
  it('arranca con la fecha de hoy y la etapa en curso', async () => {
    setup();
    await screen.findByRole('dialog');
    expect((screen.getByLabelText('Fecha') as HTMLInputElement).value).toBe('2026-11-11');
    expect((screen.getByLabelText('Etapa') as HTMLSelectElement).value).toBe('s1');
  });

  it('cámara y galería son dos inputs distintos: solo uno lleva capture', async () => {
    setup();
    const dlg = await screen.findByRole('dialog');
    const inputs = Array.from(dlg.querySelectorAll<HTMLInputElement>('input[type="file"][accept="image/*"]'));
    expect(inputs).toHaveLength(2);
    expect(inputs.filter(i => i.hasAttribute('capture'))).toHaveLength(1);
    expect(inputs.find(i => !i.hasAttribute('capture'))?.multiple).toBe(true);
  });

  it('sin fotos no se publica, pero una línea alcanza para el borrador', async () => {
    const { onSubmit } = setup();
    await screen.findByRole('dialog');
    const publish = screen.getByRole('button', { name: 'Publicar' }) as HTMLButtonElement;
    const draft = screen.getByRole('button', { name: 'Guardar como borrador' }) as HTMLButtonElement;
    expect(publish.disabled).toBe(true);
    expect(draft.disabled).toBe(true);

    fireEvent.change(screen.getByLabelText('Una línea'), { target: { value: 'Losa del piso 7' } });
    expect(publish.disabled).toBe(true);
    expect(draft.disabled).toBe(false);

    fireEvent.click(draft);
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ title: 'Losa del piso 7', date: '2026-11-11', stageId: 's1' }), true);
  });

  it('con conflicto muestra el aviso, bloquea los botones y ofrece recargar', async () => {
    const { onReload } = setup({ conflict: 'Alguien más guardó el avance de obra.' });
    await screen.findByRole('dialog');
    expect(screen.getByRole('alert').textContent).toContain('Alguien más guardó');
    fireEvent.change(screen.getByLabelText('Una línea'), { target: { value: 'Algo' } });
    expect((screen.getByRole('button', { name: 'Guardar como borrador' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Recargar' }));
    expect(onReload).toHaveBeenCalled();
  });
});
