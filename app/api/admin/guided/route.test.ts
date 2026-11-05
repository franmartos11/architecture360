import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/require-project-access', () => ({
  requireProjectAccess: vi.fn(),
  resolveRequestedProjectId: vi.fn(),
}));
vi.mock('@/lib/slug', () => ({
  slugify: (s: string) => s.toLowerCase().replace(/\s+/g, '-'),
  ensureUniqueSlug: vi.fn(async (_s: unknown, opts: { base: string }) => opts.base),
}));

import { requireProjectAccess, resolveRequestedProjectId } from '@/lib/supabase/require-project-access';
import { mockSupabase, jsonRequest, type MockResult } from '@/lib/test-helpers/supabase-mock';
import { GET, POST, PATCH } from './route';

const URL = 'http://localhost/api/admin/guided';

function withAccess(results: MockResult[]) {
  vi.mocked(resolveRequestedProjectId).mockResolvedValue('project-1');
  const supabase = mockSupabase({ results });
  vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'user-1' } } as never);
  return supabase;
}

beforeEach(() => {
  vi.mocked(requireProjectAccess).mockReset();
  vi.mocked(resolveRequestedProjectId).mockReset();
});

describe('GET /api/admin/guided', () => {
  it('sin proyecto: 404', async () => {
    vi.mocked(resolveRequestedProjectId).mockResolvedValue(null);
    expect((await GET(new Request(URL))).status).toBe(404);
  });

  it('sin acceso: 401', async () => {
    vi.mocked(resolveRequestedProjectId).mockResolvedValue('project-1');
    vi.mocked(requireProjectAccess).mockResolvedValue(null);
    expect((await GET(new Request(URL))).status).toBe(401);
  });

  it('arma el árbol edificios → pisos → unidades', async () => {
    withAccess([
      { data: [{ id: 'b1', name: 'Torre' }] },
      { data: [{ id: 'f1', building_id: 'b1', number: 1 }] },
      { data: [{ id: 'u1', floor_id: 'f1', code: '1A' }] },
    ]);
    const res = await GET(new Request(URL));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.buildings[0].floors[0].units[0].code).toBe('1A');
  });
});

describe('POST /api/admin/guided', () => {
  it('kind que no coincide con el tipo del proyecto: 400', async () => {
    withAccess([{ data: { name: 'P', project_type: 'loteo', sale_mode: 'venta' } }]);
    const res = await POST(jsonRequest(URL, { kind: 'edificio', towers: [{ name: 'T', floors: 1, perFloor: 1 }] }));
    expect(res.status).toBe(400);
  });

  it('proyecto que ya tiene estructura: 409', async () => {
    withAccess([
      { data: { name: 'P', project_type: 'edificio', sale_mode: 'venta' } },
      { count: 1 },
    ]);
    const res = await POST(jsonRequest(URL, { kind: 'edificio', towers: [{ name: 'T', floors: 1, perFloor: 1 }] }));
    expect(res.status).toBe(409);
  });

  it('crea edificio, pisos y unidades en un solo request', async () => {
    const supabase = withAccess([
      { data: { name: 'P', project_type: 'edificio', sale_mode: 'venta' } },
      { count: 0 },
      { data: { id: 'b1' } },
      { data: [{ id: 'f1', number: 1 }, { id: 'f2', number: 2 }] },
      { error: null },
      { data: [] }, // loadTree: buildings
    ]);
    const res = await POST(jsonRequest(URL, { kind: 'edificio', scheme: 'letter', towers: [{ name: 'Torre', floors: 2, perFloor: 2, groundFloor: 'none', penthouses: 0 }] }));
    expect(res.status).toBe(201);
    expect((await res.json()).unitsCreated).toBe(4);
    const unitsInsert = supabase.from.mock.results[4].value.insert.mock.calls[0][0] as { floor_id: string; code: string }[];
    expect(unitsInsert.map(u => [u.floor_id, u.code])).toEqual([['f1', '1A'], ['f1', '1B'], ['f2', '2A'], ['f2', '2B']]);
  });

  it('respeta un piso con otra cantidad de unidades', async () => {
    const supabase = withAccess([
      { data: { name: 'P', project_type: 'edificio', sale_mode: 'venta' } },
      { count: 0 },
      { data: { id: 'b1' } },
      { data: [{ id: 'f1', number: 1 }, { id: 'f2', number: 2 }] },
      { error: null },
      { data: [] },
    ]);
    const res = await POST(jsonRequest(URL, { kind: 'edificio', scheme: 'letter', towers: [{ name: 'Torre', floors: 2, perFloor: 3, groundFloor: 'none', penthouses: 0, floorOverrides: { '2': 1, '9': 5, x: 2 } }] }));
    expect(res.status).toBe(201);
    const rows = supabase.from.mock.results[4].value.insert.mock.calls[0][0] as { code: string }[];
    expect(rows.map(r => r.code)).toEqual(['1A', '1B', '1C', '2A']);
  });

  it('dúplex con una unidad de otro modelo', async () => {
    const supabase = withAccess([
      { data: { name: 'P', project_type: 'duplex', sale_mode: 'venta' } },
      { count: 0 },
      { data: { id: 'b1' } },
      { data: [{ id: 'f1', number: 1 }] },
      { error: null },
      { data: [] },
    ]);
    const models = [{ name: 'Frente', bedrooms: 3 }, { name: 'Fondo', bedrooms: 2 }];
    const res = await POST(jsonRequest(URL, { kind: 'duplex', count: 1, perDuplex: 2, models, unitModels: { 'D1-A': 1, 'X-9': 0 } }));
    expect(res.status).toBe(201);
    const rows = supabase.from.mock.results[4].value.insert.mock.calls[0][0] as { model_name: string }[];
    expect(rows.map(r => r.model_name)).toEqual(['Fondo', 'Fondo']);
  });

  it('si falla a mitad de camino borra lo creado', async () => {
    const supabase = withAccess([
      { data: { name: 'P', project_type: 'edificio', sale_mode: 'venta' } },
      { count: 0 },
      { data: { id: 'b1' } },
      { data: null, error: { message: 'boom' } },
      { error: null }, // delete
    ]);
    const res = await POST(jsonRequest(URL, { kind: 'edificio', towers: [{ name: 'Torre', floors: 1, perFloor: 1 }] }));
    expect(res.status).toBe(500);
    expect(supabase.from.mock.calls[4][0]).toBe('buildings');
    expect(supabase.from.mock.results[4].value.delete).toHaveBeenCalled();
  });
});

describe('PATCH /api/admin/guided', () => {
  it('sin cambios: 400', async () => {
    withAccess([]);
    expect((await PATCH(jsonRequest(URL, {}, { method: 'PATCH' }))).status).toBe(400);
  });

  it('status inválido: 400', async () => {
    withAccess([]);
    const res = await PATCH(jsonRequest(URL, { units: [{ id: 'u1', status: 'perdido' }] }, { method: 'PATCH' }));
    expect(res.status).toBe(400);
  });

  it('unidad de otro proyecto: 400', async () => {
    withAccess([
      { data: [{ id: 'b1' }] },
      { data: [{ id: 'f1' }] },
      { data: [{ id: 'u1', floor_id: 'f-otro' }] },
    ]);
    const res = await PATCH(jsonRequest(URL, { units: [{ id: 'u1', price: 10 }] }, { method: 'PATCH' }));
    expect(res.status).toBe(400);
  });

  it('acepta precio, superficie, estado y orientación (pegado desde Excel en Unidades)', async () => {
    const supabase = withAccess([
      { data: [{ id: 'b1' }] },
      { data: [{ id: 'f1' }] },
      { data: [{ id: 'u1', floor_id: 'f1' }] },
      { error: null },
    ]);
    const res = await PATCH(jsonRequest(URL, { units: [{ id: 'u1', price: 185000, totalArea: 74, status: 'reserved', orientation: 'NE' }] }, { method: 'PATCH' }));
    expect(res.status).toBe(200);
    expect(supabase.from.mock.results[3].value.update.mock.calls[0][0]).toMatchObject({ price: 185000, total_area: 74, status: 'reserved', orientation: 'NE' });
  });

  it('actualiza unidades y pisos propios', async () => {
    const supabase = withAccess([
      { data: [{ id: 'b1' }] },
      { data: [{ id: 'f1' }] },
      { data: [{ id: 'u1', floor_id: 'f1' }] },
      { error: null },
      { error: null },
    ]);
    const res = await PATCH(jsonRequest(URL, {
      units: [{ id: 'u1', modelName: 'Tipología B', bedrooms: 2, totalArea: 74 }],
      floors: [{ id: 'f1', planImage: 'https://x/plan.png', unitDots: [{ unitId: '1A', x: 1, y: 2 }] }],
    }, { method: 'PATCH' }));
    expect(res.status).toBe(200);
    const unitUpdate = supabase.from.mock.results[3].value.update.mock.calls[0][0];
    expect(unitUpdate).toMatchObject({ model_name: 'Tipología B', bedrooms: 2, total_area: 74 });
    const floorUpdate = supabase.from.mock.results[4].value.update.mock.calls[0][0];
    expect(floorUpdate).toEqual({ plan_image: 'https://x/plan.png', unit_dots: [{ unitId: '1A', x: 1, y: 2 }] });
  });
});
