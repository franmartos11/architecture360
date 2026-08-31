import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/require-project-access', () => ({
  requireProjectAccess: vi.fn(),
  resolveProjectIdFromBuilding: vi.fn(),
}));

import { requireProjectAccess, resolveProjectIdFromBuilding } from '@/lib/supabase/require-project-access';
import { mockSupabase, jsonRequest } from '@/lib/test-helpers/supabase-mock';
import { GET, PATCH, DELETE } from './route';

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

function get(url: string) {
  return new Request(url);
}

describe('GET /api/admin/buildings/[id]', () => {
  beforeEach(() => {
    vi.mocked(requireProjectAccess).mockReset();
    vi.mocked(resolveProjectIdFromBuilding).mockReset();
  });

  it('edificio inexistente (no resuelve project_id): 404', async () => {
    vi.mocked(resolveProjectIdFromBuilding).mockResolvedValue(null);

    const res = await GET(get('http://localhost/api/admin/buildings/building-1'), params('building-1'));
    expect(res.status).toBe(404);
  });

  it('sin acceso al proyecto: 401', async () => {
    vi.mocked(resolveProjectIdFromBuilding).mockResolvedValue('project-1');
    vi.mocked(requireProjectAccess).mockResolvedValue(null);

    const res = await GET(get('http://localhost/api/admin/buildings/building-1'), params('building-1'));
    expect(res.status).toBe(401);
  });

  it('error de la base al leer el edificio: 500', async () => {
    vi.mocked(resolveProjectIdFromBuilding).mockResolvedValue('project-1');
    const supabase = mockSupabase({ results: [{ data: null, error: { message: 'db down' } }] });
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'user-1' } } as never);

    const res = await GET(get('http://localhost/api/admin/buildings/building-1'), params('building-1'));
    expect(res.status).toBe(500);
  });

  it('edificio ya borrado (maybeSingle sin fila): 404, aunque resolveProjectIdFromBuilding haya devuelto un proyecto', async () => {
    vi.mocked(resolveProjectIdFromBuilding).mockResolvedValue('project-1');
    const supabase = mockSupabase({ results: [{ data: null, error: null }] });
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'user-1' } } as never);

    const res = await GET(get('http://localhost/api/admin/buildings/building-1'), params('building-1'));
    expect(res.status).toBe(404);
  });

  it('edificio sin pisos: floors y units vacíos, sin consultar units', async () => {
    vi.mocked(resolveProjectIdFromBuilding).mockResolvedValue('project-1');
    const supabase = mockSupabase({
      results: [
        { data: { id: 'building-1', name: 'Torre del Mar' } }, // buildings
        { data: [] }, // floors
      ],
    });
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'user-1' } } as never);

    const res = await GET(get('http://localhost/api/admin/buildings/building-1'), params('building-1'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ building: { id: 'building-1', name: 'Torre del Mar' }, floors: [], units: [] });
  });

  it('edificio con pisos y unidades: devuelve los tres juntos', async () => {
    vi.mocked(resolveProjectIdFromBuilding).mockResolvedValue('project-1');
    const supabase = mockSupabase({
      results: [
        { data: { id: 'building-1', name: 'Torre del Mar' } },
        { data: [{ id: 'floor-1', number: 1 }] },
        { data: [{ floor_id: 'floor-1', interior_image_url: null, price: 100000 }] },
      ],
    });
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'user-1' } } as never);

    const res = await GET(get('http://localhost/api/admin/buildings/building-1'), params('building-1'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      building: { id: 'building-1', name: 'Torre del Mar' },
      floors: [{ id: 'floor-1', number: 1 }],
      units: [{ floor_id: 'floor-1', interior_image_url: null, price: 100000 }],
    });
  });
});

describe('PATCH /api/admin/buildings/[id]', () => {
  beforeEach(() => {
    vi.mocked(requireProjectAccess).mockReset();
    vi.mocked(resolveProjectIdFromBuilding).mockReset();
  });

  it('edificio inexistente: 404', async () => {
    vi.mocked(resolveProjectIdFromBuilding).mockResolvedValue(null);

    const res = await PATCH(jsonRequest('http://localhost/api/admin/buildings/building-1', { name: 'Nuevo' }), params('building-1'));
    expect(res.status).toBe(404);
  });

  it('sin acceso al proyecto: 401', async () => {
    vi.mocked(resolveProjectIdFromBuilding).mockResolvedValue('project-1');
    vi.mocked(requireProjectAccess).mockResolvedValue(null);

    const res = await PATCH(jsonRequest('http://localhost/api/admin/buildings/building-1', { name: 'Nuevo' }), params('building-1'));
    expect(res.status).toBe(401);
  });

  it('edición válida: no permite tocar el slug, actualiza el resto', async () => {
    vi.mocked(resolveProjectIdFromBuilding).mockResolvedValue('project-1');
    const supabase = mockSupabase({ results: [{ data: { id: 'building-1', name: 'Nuevo Nombre' } }] });
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'user-1' } } as never);

    const res = await PATCH(
      jsonRequest('http://localhost/api/admin/buildings/building-1', { name: 'Nuevo Nombre', slug: 'deberia-ignorarse' }),
      params('building-1')
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: 'building-1', name: 'Nuevo Nombre' });
  });

  it('error de la base al actualizar: 500 con el mensaje', async () => {
    vi.mocked(resolveProjectIdFromBuilding).mockResolvedValue('project-1');
    const supabase = mockSupabase({ results: [{ data: null, error: { message: 'update failed' } }] });
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'user-1' } } as never);

    const res = await PATCH(jsonRequest('http://localhost/api/admin/buildings/building-1', { name: 'Nuevo' }), params('building-1'));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe('update failed');
  });
});

describe('DELETE /api/admin/buildings/[id]', () => {
  beforeEach(() => {
    vi.mocked(requireProjectAccess).mockReset();
    vi.mocked(resolveProjectIdFromBuilding).mockReset();
  });

  it('edificio inexistente: 404', async () => {
    vi.mocked(resolveProjectIdFromBuilding).mockResolvedValue(null);

    const res = await DELETE(jsonRequest('http://localhost/api/admin/buildings/building-1'), params('building-1'));
    expect(res.status).toBe(404);
  });

  it('sin acceso al proyecto: 401', async () => {
    vi.mocked(resolveProjectIdFromBuilding).mockResolvedValue('project-1');
    vi.mocked(requireProjectAccess).mockResolvedValue(null);

    const res = await DELETE(jsonRequest('http://localhost/api/admin/buildings/building-1'), params('building-1'));
    expect(res.status).toBe(401);
  });

  it('único edificio del proyecto: 400, no borra', async () => {
    vi.mocked(resolveProjectIdFromBuilding).mockResolvedValue('project-1');
    const supabase = mockSupabase({ results: [{ count: 1 }] }); // count head:true
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'user-1' } } as never);

    const res = await DELETE(jsonRequest('http://localhost/api/admin/buildings/building-1'), params('building-1'));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('No se puede borrar el único edificio del proyecto.');
  });

  it('hay más de un edificio: borra y devuelve success', async () => {
    vi.mocked(resolveProjectIdFromBuilding).mockResolvedValue('project-1');
    const supabase = mockSupabase({ results: [{ count: 2 }, { error: null }] });
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'user-1' } } as never);

    const res = await DELETE(jsonRequest('http://localhost/api/admin/buildings/building-1'), params('building-1'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
  });

  it('error de la base al borrar: 500 con el mensaje', async () => {
    vi.mocked(resolveProjectIdFromBuilding).mockResolvedValue('project-1');
    const supabase = mockSupabase({ results: [{ count: 2 }, { error: { message: 'delete failed' } }] });
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'user-1' } } as never);

    const res = await DELETE(jsonRequest('http://localhost/api/admin/buildings/building-1'), params('building-1'));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe('delete failed');
  });
});
