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
  return jsonRequest(`http://localhost/api/admin/floors/${targetId}/apply-template`, body);
}

describe('POST /api/admin/floors/[id]/apply-template', () => {
  beforeEach(() => {
    vi.mocked(requireProjectAccess).mockReset();
    vi.mocked(resolveProjectIdFromFloor).mockReset();
  });

  it('falta sourceFloorId: 400', async () => {
    const res = await POST(req('floor-target', {}), params('floor-target'));
    expect(res.status).toBe(400);
    expect(resolveProjectIdFromFloor).not.toHaveBeenCalled();
  });

  it('origen y destino iguales: 400', async () => {
    const res = await POST(req('floor-1', { sourceFloorId: 'floor-1' }), params('floor-1'));
    expect(res.status).toBe(400);
  });

  it('piso destino no encontrado: 404', async () => {
    vi.mocked(resolveProjectIdFromFloor).mockImplementation(async (id: string) =>
      id === 'floor-target' ? null : 'project-1'
    );
    const res = await POST(req('floor-target', { sourceFloorId: 'floor-src' }), params('floor-target'));
    expect(res.status).toBe(404);
  });

  it('piso origen no encontrado: 404', async () => {
    vi.mocked(resolveProjectIdFromFloor).mockImplementation(async (id: string) =>
      id === 'floor-src' ? null : 'project-1'
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

  it('alguno de los dos pisos no existe en la base (maybeSingle null): 404', async () => {
    vi.mocked(resolveProjectIdFromFloor).mockResolvedValue('project-1');
    const supabase = mockSupabase({
      results: [
        { data: null }, // source floor maybeSingle
        { data: { id: 'floor-target', number: 5, unit_dots: [] } }, // target floor
      ],
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

  it('unidades ya existentes en destino se saltean; solo clona las que faltan, y remapea los pines', async () => {
    vi.mocked(resolveProjectIdFromFloor).mockResolvedValue('project-1');
    const sourceFloor = { id: 'floor-src', number: 3, unit_dots: [{ unitId: 'A03-02', x: 1, y: 2 }] };
    const targetFloor = { id: 'floor-target', number: 5, unit_dots: [] };
    const sourceUnits = [
      { code: 'A03-01', model_name: 'M1', polygon: [[0, 0]], rooms: [] },
      { code: 'A03-02', model_name: 'M2', polygon: [[1, 1]], rooms: [] },
    ];
    const targetUnits = [{ code: 'A05-01' }]; // ya existe el remapeo de A03-01

    const supabase = mockSupabase({
      results: [
        { data: sourceFloor },
        { data: targetFloor },
        { data: sourceUnits },
        { data: targetUnits },
        { error: null }, // insert de units
        { error: null }, // update de floors.unit_dots
      ],
    });
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'user-1' } } as never);

    const res = await POST(req('floor-target', { sourceFloorId: 'floor-src' }), params('floor-target'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ unitsCreated: 1, skipped: 1 });
  });

  it('todas las unidades del origen ya existen en destino: no inserta nada', async () => {
    vi.mocked(resolveProjectIdFromFloor).mockResolvedValue('project-1');
    const sourceFloor = { id: 'floor-src', number: 3, unit_dots: [] };
    const targetFloor = { id: 'floor-target', number: 5, unit_dots: [] };
    const sourceUnits = [{ code: 'A03-01', model_name: 'M1' }];
    const targetUnits = [{ code: 'A05-01' }];

    const supabase = mockSupabase({
      results: [{ data: sourceFloor }, { data: targetFloor }, { data: sourceUnits }, { data: targetUnits }],
    });
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'user-1' } } as never);

    const res = await POST(req('floor-target', { sourceFloorId: 'floor-src' }), params('floor-target'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ unitsCreated: 0, skipped: 1 });
    expect(supabase.from).toHaveBeenCalledTimes(4); // sin insert de units ni update de floors
  });

  it('error al insertar las unidades clonadas: 500', async () => {
    vi.mocked(resolveProjectIdFromFloor).mockResolvedValue('project-1');
    const sourceFloor = { id: 'floor-src', number: 3, unit_dots: [] };
    const targetFloor = { id: 'floor-target', number: 5, unit_dots: [] };
    const sourceUnits = [{ code: 'A03-01', model_name: 'M1' }];
    const targetUnits: unknown[] = [];

    const supabase = mockSupabase({
      results: [
        { data: sourceFloor },
        { data: targetFloor },
        { data: sourceUnits },
        { data: targetUnits },
        { error: { message: 'insert failed' } },
      ],
    });
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'user-1' } } as never);

    const res = await POST(req('floor-target', { sourceFloorId: 'floor-src' }), params('floor-target'));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe('insert failed');
  });
});
