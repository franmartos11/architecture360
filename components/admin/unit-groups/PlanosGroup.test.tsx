// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import type { UnitFormValues } from '@/lib/unit-fields';

vi.mock('@/components/admin/BimEditorModal', () => ({ default: () => null }));
vi.mock('@/components/admin/ImageUploader', () => ({
  default: ({ value, onChange }: { value: string; onChange: (u: string) => void }) => (
    <input aria-label="imagen" value={value} onChange={e => onChange(e.target.value)} />
  ),
}));

import PlanosGroup from './PlanosGroup';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const values = { floorsCount: 2, levels: null, floorPlan3dUrl: null, plan3dUrl: null, technicalPlanUrl: null } as unknown as UnitFormValues;

function renderAndUploadUpper(onChange: (p: Partial<UnitFormValues>) => Promise<boolean> | void) {
  render(<PlanosGroup values={values} onChange={onChange} unitId="u1" />);
  fireEvent.click(screen.getByRole('tab', { name: 'Planta alta' }));
  fireEvent.change(screen.getAllByLabelText('imagen')[0], { target: { value: '/r1.png' } });
}

describe('PlanosGroup — render de una planta extra', () => {
  it('si no puede releer la unidad no escribe y avisa', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false })));
    const onChange = vi.fn();
    renderAndUploadUpper(onChange);
    await screen.findByText(/No se pudo guardar/);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('espera a que termine de guardar antes de sacar el "Guardando…"', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ levels: null }) })));
    let finish: (v: boolean) => void = () => {};
    const onChange = vi.fn(() => new Promise<boolean>(res => { finish = res; }));
    renderAndUploadUpper(onChange);
    await waitFor(() => expect(onChange).toHaveBeenCalled());
    expect(screen.getByText('Guardando…')).toBeTruthy();
    finish(true);
    await waitFor(() => expect(screen.queryByText('Guardando…')).toBeNull());
  });
});
