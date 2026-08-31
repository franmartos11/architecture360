import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/require-project-access', () => ({
  requireProjectAccess: vi.fn(),
  resolveProjectIdFromFloor: vi.fn(),
}));

import { requireProjectAccess, resolveProjectIdFromFloor } from '@/lib/supabase/require-project-access';
import { mockSupabase, jsonRequest } from '@/lib/test-helpers/supabase-mock';
import { POST } from './route';

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

function req(targetId: string, body: unknown) {
  return jsonRequest(`http://localhost/api/admin/floors/${targetId}/copy-delimitation`, body);
}

describe('POST /api/admin/floors/[id]/copy-delimitation', () => {
  beforeEach(() => {
    vi.mocked(requireProjectAccess).mockReset();
    vi.mocked(resolveProjectIdFromFloor).mockReset();
  });

  it('falta sourceFloorId: 400', async () => {
    const res = await POST(req('floor-target', {}), params('floor-target'));
    expect(res.status).toBe(400);
    expect(resolveProjectIdFromFloor).not.toHaveBeenCalled();
  });

  it('piso destino no encontrado: 404', async () => {
    vi.mocked(resolveProjectIdFromFloor).mockImplementation(async (id: string) =>
      id === 'floor-target' ? null : 'project-1'
    );
    const res = await POST(req('floor-target', { sourceFloorId: 'floor-src' }), params('floor-target'));
    expect(res.status).toBe(404);
  });

  it('piso origen de otro proyecto: 400', async () => {
    vi.mocked(resolveProjectIdFromFloor).mockImplementation(async (id: string) =>
      id === 'floor-target' ? 'project-1' : 'project-2'
    );
    const res = await POST(req('floor-target', { sourceFloorId: 'floor-src' }), params('floor-target'));
    expect(res.status).toBe(400);
  });

  it('sin acceso al proyecto: 401', async () => {
    vi.mocked(resolveProjectIdFromFloor).mockResolvedValue('project-1');
    vi.mocked(requireProjectAccess).mockResolvedValue(null);

    const res = await POST(req('floor-target', { sourceFloorId: 'floor-src' }), params('floor-target'));
    expect(res.status).toBe(401);
  });

  it('alguno de los dos pisos no existe en la base: 404', async () => {
    vi.mocked(resolveProjectIdFromFloor).mockResolvedValue('project-1');
    const supabase = mockSupabase({
      results: [{ data: null }, { data: { id: 'floor-target', number: 5, unit_dots: [] } }],
    });
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'user-1' } } as never);

    const res = await POST(req('floor-target', { sourceFloorId: 'floor-src' }), params('floor-target'));
    expect(res.status).toBe(404);
  });

  it('error de la base al leer los pisos: 500', async () => {
    vi.mocked(resolveProjectIdFromFloor).mockResolvedValue('project-1');
    const supabase = mockSupabase({
      results: [
        { data: null, error: { message: 'boom' } },
        { data: { id: 'floor-target', number: 5, unit_dots: [] } },
      ],
    });
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'user-1' } } as never);

    const res = await POST(req('floor-target', { sourceFloorId: 'floor-src' }), params('floor-target'));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe('boom');
  });

  it('copia el polígono de las unidades que matchean por código remapeado, e ignora las sin polígono o sin match', async () => {
    vi.mocked(resolveProjectIdFromFloor).mockResolvedValue('project-1');
    const sourceFloor = { id: 'floor-src', number: 3, unit_dots: [{ unitId: 'A03-01', x: 1, y: 2 }] };
    const targetFloor = { id: 'floor-target', number: 5, unit_dots: [] };
    const sourceUnits = [
      { id: 'su1', code: 'A03-01', polygon: [[0, 0], [1, 1]] }, // matchea con tu1 (A05-01)
      { id: 'su2', code: 'A03-02', polygon: null }, // sin polígono: se saltea
      { id: 'su3', code: 'A03-03', polygon: [[2, 2]] }, // sin match en destino: se saltea
    ];
    const targetUnits = [{ id: 'tu1', code: 'A05-01' }];

    const supabase = mockSupabase({
      results: [
        { data: sourceFloor },
        { data: targetFloor },
        { data: sourceUnits },
        { data: targetUnits },
        { error: null }, // update polygon de tu1
        { error: null }, // update floors.unit_dots
      ],
    });
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'user-1' } } as never);

    const res = await POST(req('floor-target', { sourceFloorId: 'floor-src' }), params('floor-target'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ unitsUpdated: 1 });
  });

  it('ningún match: no actualiza polígonos ni pines de floors', async () => {
    vi.mocked(resolveProjectIdFromFloor).mockResolvedValue('project-1');
    const sourceFloor = { id: 'floor-src', number: 3, unit_dots: [] };
    const targetFloor = { id: 'floor-target', number: 5, unit_dots: [] };
    const sourceUnits = [{ id: 'su1', code: 'A03-99', polygon: [[0, 0]] }];
    const targetUnits: unknown[] = [];

    const supabase = mockSupabase({
      results: [{ data: sourceFloor }, { data: targetFloor }, { data: sourceUnits }, { data: targetUnits }],
    });
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'user-1' } } as never);

    const res = await POST(req('floor-target', { sourceFloorId: 'floor-src' }), params('floor-target'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ unitsUpdated: 0 });
    expect(supabase.from).toHaveBeenCalledTimes(4);
  });

  it('error al actualizar el polígono de una unidad: 500', async () => {
    vi.mocked(resolveProjectIdFromFloor).mockResolvedValue('project-1');
    const sourceFloor = { id: 'floor-src', number: 3, unit_dots: [] };
    const targetFloor = { id: 'floor-target', number: 5, unit_dots: [] };
    const sourceUnits = [{ id: 'su1', code: 'A03-01', polygon: [[0, 0]] }];
    const targetUnits = [{ id: 'tu1', code: 'A05-01' }];

    const supabase = mockSupabase({
      results: [
        { data: sourceFloor },
        { data: targetFloor },
        { data: sourceUnits },
        { data: targetUnits },
        { error: { message: 'update failed' } },
      ],
    });
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'user-1' } } as never);

    const res = await POST(req('floor-target', { sourceFloorId: 'floor-src' }), params('floor-target'));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe('update failed');
  });
});
