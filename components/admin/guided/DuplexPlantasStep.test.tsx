// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import type { GuidedTree, GUnit } from './shared';

const patch = vi.fn<(body: unknown) => Promise<{ ok: true; data: object }>>(async () => ({ ok: true, data: {} }));
const confirm = vi.fn<(opts: unknown) => Promise<boolean>>(async () => false);
vi.mock('@/components/ui/ToastProvider', () => ({ useToast: () => vi.fn() }));
vi.mock('@/components/ui/ConfirmProvider', () => ({ useConfirm: () => confirm }));
vi.mock('@/components/admin/ImageUploader', () => ({
  default: ({ label, value, onChange }: { label?: string; value: string; onChange: (u: string) => void }) => (
    <input aria-label={label} value={value} onChange={e => onChange(e.target.value)} />
  ),
}));
vi.mock('./shared', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./shared')>()),
  useGuidedApi: () => ({ patch }),
}));

import DuplexPlantasStep from './DuplexPlantasStep';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); patch.mockClear(); confirm.mockClear(); });

const unit = { id: 'u1', code: 'D1-A', model_name: 'Modelo único', floors_count: 2, room_plan_image: null, floor_plan_3d_url: null, levels: null } as unknown as GUnit;
const tree = { buildings: [{ id: 'b1', slug: 'd1', name: 'Dúplex 1', total_floors: 1, floors: [{ id: 'f1', units: [unit] }] }] } as unknown as GuidedTree;

describe('DuplexPlantasStep', () => {
  it('relee la unidad antes de aplicar y no pisa un plano cargado mientras tanto', async () => {
    const fresh = { ...unit, levels: [{ id: 'piso-1', label: 'Planta alta', planImage: '/p-fresh.png', plan3dImage: null, rooms: [] }] };
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => fresh })));
    render(<DuplexPlantasStep tree={tree} reload={async () => {}} onBack={() => {}} onNext={() => {}} />);
    fireEvent.change(screen.getAllByLabelText('Render 3D')[1], { target: { value: '/r1.png' } });
    fireEvent.click(screen.getByRole('button', { name: /Aplicar a las 1/ }));
    await waitFor(() => expect(patch).toHaveBeenCalled());
    const sent = (patch.mock.calls[0][0] as { units: { levels: { planImage: string; plan3dImage: string }[] }[] }).units[0];
    expect(sent.levels[0]).toMatchObject({ planImage: '/p-fresh.png', plan3dImage: '/r1.png' });
  });

  it('avisa antes de descartar imágenes sin aplicar', async () => {
    const onNext = vi.fn();
    render(<DuplexPlantasStep tree={tree} reload={async () => {}} onBack={() => {}} onNext={onNext} />);
    fireEvent.change(screen.getAllByLabelText('Plano')[0], { target: { value: '/p0.png' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    await waitFor(() => expect(confirm).toHaveBeenCalled());
    expect(onNext).not.toHaveBeenCalled();
  });

  it('sin cambios sin aplicar, continúa sin preguntar', () => {
    const onNext = vi.fn();
    render(<DuplexPlantasStep tree={tree} reload={async () => {}} onBack={() => {}} onNext={onNext} />);
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    expect(confirm).not.toHaveBeenCalled();
    expect(onNext).toHaveBeenCalled();
  });

  it('avisa cuando una imagen está solo en algunas unidades y se va a copiar', () => {
    const a = { ...unit, id: 'u1', code: 'D1-A', floor_plan_3d_url: '/propio.png' };
    const b = { ...unit, id: 'u2', code: 'D1-B' };
    const t = { buildings: [{ id: 'b1', slug: 'd1', name: 'Dúplex 1', total_floors: 1, floors: [{ id: 'f1', units: [a, b] }] }] } as unknown as GuidedTree;
    render(<DuplexPlantasStep tree={t} reload={async () => {}} onBack={() => {}} onNext={() => {}} />);
    expect(screen.getByText(/Hoy está solo en D1-A; al aplicar se copia a D1-B/)).toBeTruthy();
  });
});
