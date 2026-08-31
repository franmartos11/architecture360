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

function req(sourceId: string, body: unknown) {
  return jsonRequest(`http://localhost/api/admin/floors/${sourceId}/duplicate`, body);
}

describe('POST /api/admin/floors/[id]/duplicate', () => {
  beforeEach(() => {
    vi.mocked(requireProjectAccess).mockReset();
    vi.mocked(resolveProjectIdFromFloor).mockReset();
  });

  it('piso de origen no encontrado: 404', async () => {
    vi.mocked(resolveProjectIdFromFloor).mockResolvedValue(null);
    const res = await POST(req('floor-src', { number: 4, label: 'Piso 4' }), params('floor-src'));
    expect(res.status).toBe(404);
  });

  it('sin acceso al proyecto: 401', async () => {
    vi.mocked(resolveProjectIdFromFloor).mockResolvedValue('project-1');
    vi.mocked(requireProjectAccess).mockResolvedValue(null);

    const res = await POST(req('floor-src', { number: 4, label: 'Piso 4' }), params('floor-src'));
    expect(res.status).toBe(401);
  });

  it('faltan number y/o label: 400 (después de validar el acceso)', async () => {
    vi.mocked(resolveProjectIdFromFloor).mockResolvedValue('project-1');
    const supabase = mockSupabase({ results: [] });
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'user-1' } } as never);

    const res = await POST(req('floor-src', { label: 'Piso 4' }), params('floor-src'));
    expect(res.status).toBe(400);
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('error de la base al leer el piso de origen: 500', async () => {
    vi.mocked(resolveProjectIdFromFloor).mockResolvedValue('project-1');
    const supabase = mockSupabase({ results: [{ data: null, error: { message: 'boom' } }] });
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'user-1' } } as never);

    const res = await POST(req('floor-src', { number: 4, label: 'Piso 4' }), params('floor-src'));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe('boom');
  });

  it('piso de origen inexistente en la base (maybeSingle null): 404', async () => {
    vi.mocked(resolveProjectIdFromFloor).mockResolvedValue('project-1');
    const supabase = mockSupabase({ results: [{ data: null }] });
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'user-1' } } as never);

    const res = await POST(req('floor-src', { number: 4, label: 'Piso 4' }), params('floor-src'));
    expect(res.status).toBe(404);
  });

  it('error al insertar el piso nuevo: 500', async () => {
    vi.mocked(resolveProjectIdFromFloor).mockResolvedValue('project-1');
    const sourceFloor = { id: 'floor-src', building_id: 'b1', number: 3, unit_dots: [], floor_kind: 'units', plan_image: null };
    const supabase = mockSupabase({
      results: [{ data: sourceFloor }, { data: null, error: { message: 'insert failed' } }],
    });
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'user-1' } } as never);

    const res = await POST(req('floor-src', { number: 4, label: 'Piso 4' }), params('floor-src'));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe('insert failed');
  });

  it('duplicado válido con unidades: crea el piso, clona unidades y pines con código remapeado', async () => {
    vi.mocked(resolveProjectIdFromFloor).mockResolvedValue('project-1');
    const sourceFloor = {
      id: 'floor-src',
      building_id: 'b1',
      number: 3,
      plan_image: 'img.png',
      unit_dots: [{ unitId: 'A03-01', x: 1, y: 2 }],
      floor_kind: 'units',
      floor_kind_description: null,
    };
    const newFloor = { id: 'floor-new', building_id: 'b1', number: 5, label: 'Piso 5' };
    const sourceUnits = [{ code: 'A03-01', model_name: 'M1', polygon: [[0, 0]], rooms: [] }];

    const supabase = mockSupabase({
      results: [
        { data: sourceFloor },
        { data: newFloor, error: null }, // insert del piso nuevo
        { data: sourceUnits, error: null }, // select de unidades del origen
        { error: null }, // insert de las unidades clonadas
      ],
    });
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'user-1' } } as never);

    const res = await POST(req('floor-src', { number: 5, label: 'Piso 5' }), params('floor-src'));
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ floor: newFloor, unitsCopied: 1 });
  });

  it('includeUnits: false → no clona unidades ni las consulta', async () => {
    vi.mocked(resolveProjectIdFromFloor).mockResolvedValue('project-1');
    const sourceFloor = {
      id: 'floor-src',
      building_id: 'b1',
      number: 3,
      plan_image: 'img.png',
      unit_dots: [{ unitId: 'A03-01', x: 1, y: 2 }],
      floor_kind: 'units',
      floor_kind_description: null,
    };
    const newFloor = { id: 'floor-new', building_id: 'b1', number: 5, label: 'Piso 5' };

    const supabase = mockSupabase({
      results: [{ data: sourceFloor }, { data: newFloor, error: null }],
    });
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'user-1' } } as never);

    const res = await POST(req('floor-src', { number: 5, label: 'Piso 5', includeUnits: false }), params('floor-src'));
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ floor: newFloor, unitsCopied: 0 });
    expect(supabase.from).toHaveBeenCalledTimes(2);
  });

  it('piso de origen sin unidades: unitsCopied 0, sin insert de unidades', async () => {
    vi.mocked(resolveProjectIdFromFloor).mockResolvedValue('project-1');
    const sourceFloor = { id: 'floor-src', building_id: 'b1', number: 3, unit_dots: [], floor_kind: 'units', plan_image: null };
    const newFloor = { id: 'floor-new', building_id: 'b1', number: 5, label: 'Piso 5' };

    const supabase = mockSupabase({
      results: [{ data: sourceFloor }, { data: newFloor, error: null }, { data: [], error: null }],
    });
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'user-1' } } as never);

    const res = await POST(req('floor-src', { number: 5, label: 'Piso 5' }), params('floor-src'));
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ floor: newFloor, unitsCopied: 0 });
  });

  it('error al insertar las unidades clonadas: 500', async () => {
    vi.mocked(resolveProjectIdFromFloor).mockResolvedValue('project-1');
    const sourceFloor = { id: 'floor-src', building_id: 'b1', number: 3, unit_dots: [], floor_kind: 'units', plan_image: null };
    const newFloor = { id: 'floor-new', building_id: 'b1', number: 5, label: 'Piso 5' };
    const sourceUnits = [{ code: 'A03-01', model_name: 'M1' }];

    const supabase = mockSupabase({
      results: [
        { data: sourceFloor },
        { data: newFloor, error: null },
        { data: sourceUnits, error: null },
        { error: { message: 'insert failed' } },
      ],
    });
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'user-1' } } as never);

    const res = await POST(req('floor-src', { number: 5, label: 'Piso 5' }), params('floor-src'));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe('insert failed');
  });
});
