import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/require-project-access', () => ({
  requireProjectAccess: vi.fn(),
  resolveProjectIdFromFloor: vi.fn(),
  resolveRequestedProjectId: vi.fn(),
}));

import {
  requireProjectAccess,
  resolveProjectIdFromFloor,
  resolveRequestedProjectId,
} from '@/lib/supabase/require-project-access';
import { mockSupabase, jsonRequest } from '@/lib/test-helpers/supabase-mock';
import { GET, POST } from './route';

function get(url: string) {
  return new Request(url);
}

describe('GET /api/admin/units', () => {
  beforeEach(() => {
    vi.mocked(requireProjectAccess).mockReset();
    vi.mocked(resolveProjectIdFromFloor).mockReset();
    vi.mocked(resolveRequestedProjectId).mockReset();
  });

  it('?floorId=... sin acceso al proyecto: 401', async () => {
    vi.mocked(resolveProjectIdFromFloor).mockResolvedValue('project-1');
    vi.mocked(requireProjectAccess).mockResolvedValue(null);

    const res = await GET(get('http://localhost/api/admin/units?floorId=floor-1'));
    expect(res.status).toBe(401);
  });

  it('?floorId=... con acceso: devuelve las unidades de ese piso', async () => {
    vi.mocked(resolveProjectIdFromFloor).mockResolvedValue('project-1');
    const supabase = mockSupabase({ results: [{ data: [{ id: 'unit-1' }, { id: 'unit-2' }] }] });
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'user-1' } } as never);

    const res = await GET(get('http://localhost/api/admin/units?floorId=floor-1'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([{ id: 'unit-1' }, { id: 'unit-2' }]);
  });

  it('piso inexistente: 404', async () => {
    vi.mocked(resolveProjectIdFromFloor).mockResolvedValue(null);
    const res = await GET(get('http://localhost/api/admin/units?floorId=no-existe'));
    expect(res.status).toBe(404);
  });

  it('listado global: enriquece cada unidad con edificio/piso, y filtra al proyecto activo', async () => {
    vi.mocked(resolveRequestedProjectId).mockResolvedValue('project-1');
    const supabase = mockSupabase({
      results: [
        { data: [{ id: 'building-1', slug: 'torre', name: 'Torre del Mar' }] }, // .from('buildings')
        { data: [{ id: 'floor-1', number: 3, building_id: 'building-1' }] }, // .from('floors')
        { data: [{ id: 'unit-1', floor_id: 'floor-1' }] }, // .from('units')
      ],
    });
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'user-1' } } as never);

    const res = await GET(get('http://localhost/api/admin/units'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([
      { id: 'unit-1', floor_id: 'floor-1', floor_number: 3, building_slug: 'torre', building_name: 'Torre del Mar' },
    ]);
  });

  it('listado global sin edificios: [] sin consultar unidades', async () => {
    vi.mocked(resolveRequestedProjectId).mockResolvedValue('project-1');
    const supabase = mockSupabase({ results: [{ data: [] }] }); // solo .from('buildings'), floors/units no se llegan a pedir
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'user-1' } } as never);

    const res = await GET(get('http://localhost/api/admin/units'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });
});

describe('POST /api/admin/units', () => {
  beforeEach(() => {
    vi.mocked(requireProjectAccess).mockReset();
    vi.mocked(resolveProjectIdFromFloor).mockReset();
  });

  it('faltan campos requeridos: 400 antes de tocar la base', async () => {
    const res = await POST(jsonRequest('http://localhost/api/admin/units', { floorId: 'floor-1' }));
    expect(res.status).toBe(400);
    expect(resolveProjectIdFromFloor).not.toHaveBeenCalled();
  });

  it('status inválido: 400', async () => {
    const res = await POST(
      jsonRequest('http://localhost/api/admin/units', { floorId: 'floor-1', code: 'A1', type: 'monoambiente', status: 'vendido' })
    );
    expect(res.status).toBe(400);
  });

  it('sin acceso al proyecto del piso: 401', async () => {
    vi.mocked(resolveProjectIdFromFloor).mockResolvedValue('project-1');
    vi.mocked(requireProjectAccess).mockResolvedValue(null);

    const res = await POST(jsonRequest('http://localhost/api/admin/units', { floorId: 'floor-1', code: 'A1', type: 'monoambiente' }));
    expect(res.status).toBe(401);
  });

  it('tipo sin "paso de unidades" (casa) que ya tiene una unidad: 409, no inserta', async () => {
    vi.mocked(resolveProjectIdFromFloor).mockResolvedValue('project-1');
    const supabase = mockSupabase({
      results: [
        { data: { project_type: 'casa', sale_mode: 'venta' } }, // .from('projects')...maybeSingle()
        { count: 1 }, // .from('units')...head:true (ya tiene una)
      ],
    });
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'user-1' } } as never);

    const res = await POST(jsonRequest('http://localhost/api/admin/units', { floorId: 'floor-1', code: 'A1', type: 'monoambiente' }));
    expect(res.status).toBe(409);
  });

  it('alta válida: inserta y devuelve 201 con la fila creada', async () => {
    vi.mocked(resolveProjectIdFromFloor).mockResolvedValue('project-1');
    const supabase = mockSupabase({
      results: [
        { data: { project_type: 'edificio', sale_mode: 'venta' } },
        { data: { id: 'unit-1', code: 'A1' } }, // .insert(...).select().single()
      ],
    });
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'user-1' } } as never);

    const res = await POST(jsonRequest('http://localhost/api/admin/units', { floorId: 'floor-1', code: 'A1', type: 'monoambiente' }));
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ id: 'unit-1', code: 'A1' });
  });
});
