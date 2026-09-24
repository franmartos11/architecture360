import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/require-project-access', () => ({
  requireProjectAccess: vi.fn(),
  resolveRequestedProjectId: vi.fn(),
}));

import { requireProjectAccess, resolveRequestedProjectId } from '@/lib/supabase/require-project-access';
import { mockSupabase, jsonRequest } from '@/lib/test-helpers/supabase-mock';
import { PATCH } from './route';

const URL_ = 'http://localhost/api/admin/units/bulk';

describe('PATCH /api/admin/units/bulk', () => {
  beforeEach(() => {
    vi.mocked(requireProjectAccess).mockReset();
    vi.mocked(resolveRequestedProjectId).mockReset();
  });

  it('sin ids: 400 sin resolver el proyecto', async () => {
    const res = await PATCH(jsonRequest(URL_, { status: 'reserved' }, { method: 'PATCH' }));
    expect(res.status).toBe(400);
    expect(resolveRequestedProjectId).not.toHaveBeenCalled();
  });

  it('ids vacío: 400', async () => {
    const res = await PATCH(jsonRequest(URL_, { ids: [], status: 'reserved' }, { method: 'PATCH' }));
    expect(res.status).toBe(400);
  });

  it('más de 500 ids: 400 sin resolver el proyecto', async () => {
    const ids = Array.from({ length: 501 }, (_, i) => `u${i}`);
    const res = await PATCH(jsonRequest(URL_, { ids, status: 'reserved' }, { method: 'PATCH' }));
    expect(res.status).toBe(400);
    expect(resolveRequestedProjectId).not.toHaveBeenCalled();
  });

  it('ni status ni priceAdjustment: 400', async () => {
    const res = await PATCH(jsonRequest(URL_, { ids: ['u1'] }, { method: 'PATCH' }));
    expect(res.status).toBe(400);
  });

  it('status Y priceAdjustment a la vez: 400', async () => {
    const res = await PATCH(jsonRequest(URL_, {
      ids: ['u1'], status: 'reserved', priceAdjustment: { mode: 'fixed', sign: 'increase', amount: 100 },
    }, { method: 'PATCH' }));
    expect(res.status).toBe(400);
  });

  it('status inválido: 400', async () => {
    const res = await PATCH(jsonRequest(URL_, { ids: ['u1'], status: 'vendidísima' }, { method: 'PATCH' }));
    expect(res.status).toBe(400);
  });

  it('priceAdjustment con amount negativo: 400', async () => {
    const res = await PATCH(jsonRequest(URL_, {
      ids: ['u1'], priceAdjustment: { mode: 'pct', sign: 'increase', amount: -5 },
    }, { method: 'PATCH' }));
    expect(res.status).toBe(400);
  });

  it('proyecto no resuelto: 404', async () => {
    vi.mocked(resolveRequestedProjectId).mockResolvedValue(null);
    const res = await PATCH(jsonRequest(URL_, { ids: ['u1'], status: 'reserved' }, { method: 'PATCH' }));
    expect(res.status).toBe(404);
  });

  it('sin acceso al proyecto: 401', async () => {
    vi.mocked(resolveRequestedProjectId).mockResolvedValue('project-1');
    vi.mocked(requireProjectAccess).mockResolvedValue(null);
    const res = await PATCH(jsonRequest(URL_, { ids: ['u1'], status: 'reserved' }, { method: 'PATCH' }));
    expect(res.status).toBe(401);
  });

  it('cambio de estado: actualiza todas las que son del proyecto en un solo update, y marca las ajenas', async () => {
    vi.mocked(resolveRequestedProjectId).mockResolvedValue('project-1');
    const supabase = mockSupabase({
      results: [
        { data: [{ id: 'building-1' }] },                                     // buildings del proyecto
        { data: [{ id: 'floor-1' }] },                                        // floors de esos buildings
        { data: [{ id: 'u1', floor_id: 'floor-1', price: 100 }, { id: 'u2', floor_id: 'floor-1', price: null }] }, // units in(ids)
        { data: [{ id: 'u1' }, { id: 'u2' }] },                               // update().select('id')
      ],
    });
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'user-1' } } as never);

    const res = await PATCH(jsonRequest(URL_, { ids: ['u1', 'u2', 'ajena'], status: 'reserved' }, { method: 'PATCH' }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.updated.sort()).toEqual(['u1', 'u2']);
    expect(body.skipped).toEqual([{ id: 'ajena', reason: 'No pertenece a este proyecto' }]);

    // El update en sí pide status para todas, no una llamada por unidad.
    const updateCall = supabase.from.mock.results[3].value;
    expect(updateCall.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'reserved' }));
    expect(updateCall.in).toHaveBeenCalledWith('id', ['u1', 'u2']);
  });

  it('ninguna de las ids pedidas es del proyecto: updated vacío, todas skipped', async () => {
    vi.mocked(resolveRequestedProjectId).mockResolvedValue('project-1');
    const supabase = mockSupabase({
      results: [
        { data: [{ id: 'building-1' }] },
        { data: [{ id: 'floor-1' }] },
        { data: [{ id: 'u1', floor_id: 'otro-piso', price: 100 }] },
      ],
    });
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'user-1' } } as never);

    const res = await PATCH(jsonRequest(URL_, { ids: ['u1'], status: 'sold' }, { method: 'PATCH' }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ updated: [], skipped: [{ id: 'u1', reason: 'No pertenece a este proyecto' }] });
  });

  it('ajuste de precio: calcula el delta a partir del precio que hay en la base, no del que mandó el cliente', async () => {
    vi.mocked(resolveRequestedProjectId).mockResolvedValue('project-1');
    const supabase = mockSupabase({
      results: [
        { data: [{ id: 'building-1' }] },
        { data: [{ id: 'floor-1' }] },
        { data: [{ id: 'u1', floor_id: 'floor-1', price: 1000 }, { id: 'u2', floor_id: 'floor-1', price: null }] },
        { error: null }, // update de u1
      ],
    });
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'user-1' } } as never);

    const res = await PATCH(jsonRequest(URL_, {
      ids: ['u1', 'u2'],
      priceAdjustment: { mode: 'pct', sign: 'increase', amount: 10 },
    }, { method: 'PATCH' }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.updated).toEqual([{ id: 'u1', price: 1100 }]);
    expect(body.skipped).toEqual([{ id: 'u2', reason: 'Sin precio cargado' }]);
  });

  it('ajuste de precio con sign decrease y mode fixed', async () => {
    vi.mocked(resolveRequestedProjectId).mockResolvedValue('project-1');
    const supabase = mockSupabase({
      results: [
        { data: [{ id: 'building-1' }] },
        { data: [{ id: 'floor-1' }] },
        { data: [{ id: 'u1', floor_id: 'floor-1', price: 500 }] },
        { error: null },
      ],
    });
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'user-1' } } as never);

    const res = await PATCH(jsonRequest(URL_, {
      ids: ['u1'],
      priceAdjustment: { mode: 'fixed', sign: 'decrease', amount: 800 },
    }, { method: 'PATCH' }));

    // Nunca queda negativo: se clampea en 0.
    expect((await res.json()).updated).toEqual([{ id: 'u1', price: 0 }]);
  });

  it('sin edificios en el proyecto: no llega a pedir units, updated vacío', async () => {
    vi.mocked(resolveRequestedProjectId).mockResolvedValue('project-1');
    const supabase = mockSupabase({ results: [{ data: [] }] }); // buildings vacío
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'user-1' } } as never);

    const res = await PATCH(jsonRequest(URL_, { ids: ['u1'], status: 'sold' }, { method: 'PATCH' }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ updated: [], skipped: [{ id: 'u1', reason: 'No pertenece a este proyecto' }] });
  });
});
