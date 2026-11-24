// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import type { GuidedTree, GUnit } from './shared';

const patch = vi.fn<(body: unknown) => Promise<{ ok: true; data: object }>>(async () => ({ ok: true, data: {} }));
vi.mock('@/components/ui/ToastProvider', () => ({ useToast: () => vi.fn() }));
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

afterEach(() => { cleanup(); vi.unstubAllGlobals(); patch.mockClear(); });

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
});
