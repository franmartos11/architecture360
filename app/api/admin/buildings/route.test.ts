import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/require-project-access', () => ({
  requireProjectAccess: vi.fn(),
  resolveRequestedProjectId: vi.fn(),
}));

import { requireProjectAccess, resolveRequestedProjectId } from '@/lib/supabase/require-project-access';
import { mockSupabase, jsonRequest } from '@/lib/test-helpers/supabase-mock';
import { GET, POST } from './route';

function get(url: string) {
  return new Request(url);
}

describe('GET /api/admin/buildings', () => {
  beforeEach(() => {
    vi.mocked(requireProjectAccess).mockReset();
    vi.mocked(resolveRequestedProjectId).mockReset();
  });

  it('proyecto activo no encontrado: 404', async () => {
    vi.mocked(resolveRequestedProjectId).mockResolvedValue(null);

    const res = await GET(get('http://localhost/api/admin/buildings'));
    expect(res.status).toBe(404);
  });

  it('sin acceso al proyecto: 401', async () => {
    vi.mocked(resolveRequestedProjectId).mockResolvedValue('project-1');
    vi.mocked(requireProjectAccess).mockResolvedValue(null);

    const res = await GET(get('http://localhost/api/admin/buildings'));
    expect(res.status).toBe(401);
  });

  it('error de la base al leer buildings: 500', async () => {
    vi.mocked(resolveRequestedProjectId).mockResolvedValue('project-1');
    const supabase = mockSupabase({ results: [{ data: null, error: { message: 'db down' } }] });
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'user-1' } } as never);

    const res = await GET(get('http://localhost/api/admin/buildings'));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe('db down');
  });

  it('sin edificios: [] sin consultar floors', async () => {
    vi.mocked(resolveRequestedProjectId).mockResolvedValue('project-1');
    const supabase = mockSupabase({ results: [{ data: [] }] }); // solo .from('buildings')
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'user-1' } } as never);

    const res = await GET(get('http://localhost/api/admin/buildings'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
    expect(supabase.from).toHaveBeenCalledTimes(1);
  });

  it('con edificios: agrega floors_loaded y first_floor_id por edificio', async () => {
    vi.mocked(resolveRequestedProjectId).mockResolvedValue('project-1');
    const supabase = mockSupabase({
      results: [
        { data: [{ id: 'building-1', slug: 'torre', name: 'Torre del Mar' }] }, // .from('buildings')
        {
          data: [
            { id: 'floor-1', building_id: 'building-1', number: 1 },
            { id: 'floor-2', building_id: 'building-1', number: 2 },
          ],
        }, // .from('floors')
      ],
    });
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'user-1' } } as never);

    const res = await GET(get('http://localhost/api/admin/buildings'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([
      { id: 'building-1', slug: 'torre', name: 'Torre del Mar', floors_loaded: 2, first_floor_id: 'floor-1' },
    ]);
  });
});

describe('POST /api/admin/buildings', () => {
  beforeEach(() => {
    vi.mocked(requireProjectAccess).mockReset();
    vi.mocked(resolveRequestedProjectId).mockReset();
  });

  it('proyecto activo no encontrado: 404', async () => {
    vi.mocked(resolveRequestedProjectId).mockResolvedValue(null);

    const res = await POST(jsonRequest('http://localhost/api/admin/buildings', { name: 'Torre del Mar' }));
    expect(res.status).toBe(404);
  });

  it('sin acceso al proyecto: 401', async () => {
    vi.mocked(resolveRequestedProjectId).mockResolvedValue('project-1');
    vi.mocked(requireProjectAccess).mockResolvedValue(null);

    const res = await POST(jsonRequest('http://localhost/api/admin/buildings', { name: 'Torre del Mar' }));
    expect(res.status).toBe(401);
  });

  it('falta name: 400', async () => {
    vi.mocked(resolveRequestedProjectId).mockResolvedValue('project-1');
    const supabase = mockSupabase({ results: [] });
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'user-1' } } as never);

    const res = await POST(jsonRequest('http://localhost/api/admin/buildings', { name: '' }));
    expect(res.status).toBe(400);
  });

  it('tipo "casa" (singleBuilding) que ya tiene un edificio: 409, no inserta', async () => {
    vi.mocked(resolveRequestedProjectId).mockResolvedValue('project-1');
    const supabase = mockSupabase({
      results: [
        { data: { project_type: 'casa', sale_mode: 'venta' } }, // .from('projects')
        { count: 1 }, // .from('buildings') count head:true
      ],
    });
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'user-1' } } as never);

    const res = await POST(jsonRequest('http://localhost/api/admin/buildings', { name: 'Casa Nueva' }));
    expect(res.status).toBe(409);
  });

  it('slug duplicado (Postgres 23505) al insertar: 409 con mensaje de slug', async () => {
    vi.mocked(resolveRequestedProjectId).mockResolvedValue('project-1');
    const supabase = mockSupabase({
      results: [
        { data: { project_type: 'edificio', sale_mode: 'venta' } }, // .from('projects')
        { data: [] }, // ensureUniqueSlug: .from('buildings').select().like()
        { data: null, error: { code: '23505', message: 'duplicate key' } }, // .from('buildings').insert()
      ],
    });
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'user-1' } } as never);

    const res = await POST(jsonRequest('http://localhost/api/admin/buildings', { name: 'Torre del Mar' }));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('Ese slug ya está en uso en este proyecto.');
  });

  it('error genérico de la base al insertar: 500 con el mensaje', async () => {
    vi.mocked(resolveRequestedProjectId).mockResolvedValue('project-1');
    const supabase = mockSupabase({
      results: [
        { data: { project_type: 'edificio', sale_mode: 'venta' } },
        { data: [] },
        { data: null, error: { message: 'insert failed' } },
      ],
    });
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'user-1' } } as never);

    const res = await POST(jsonRequest('http://localhost/api/admin/buildings', { name: 'Torre del Mar' }));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe('insert failed');
  });

  it('alta válida — "edificio" (con paso de piso): no auto-provisiona piso/unidad', async () => {
    vi.mocked(resolveRequestedProjectId).mockResolvedValue('project-1');
    const supabase = mockSupabase({
      results: [
        { data: { project_type: 'edificio', sale_mode: 'venta' } },
        { data: [] }, // ensureUniqueSlug
        { data: { id: 'building-1', slug: 'torre-del-mar', name: 'Torre del Mar' } }, // insert
      ],
    });
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'user-1' } } as never);

    const res = await POST(jsonRequest('http://localhost/api/admin/buildings', { name: 'Torre del Mar' }));
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({
      id: 'building-1', slug: 'torre-del-mar', name: 'Torre del Mar', floor_id: null, unit_id: null,
    });
  });

  it('alta válida — "loteo" (sin paso de piso, con paso de unidad): auto-provisiona un piso pero no una unidad', async () => {
    vi.mocked(resolveRequestedProjectId).mockResolvedValue('project-1');
    const supabase = mockSupabase({
      results: [
        { data: { project_type: 'loteo', sale_mode: 'venta' } },
        { count: 0 }, // singleBuilding: no tiene todavía ninguna etapa
        { data: [] }, // ensureUniqueSlug
        { data: { id: 'building-1', slug: 'etapa-1', name: 'Etapa 1' } }, // insert building
        { data: { id: 'floor-1' } }, // insert floor
      ],
    });
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'user-1' } } as never);

    const res = await POST(jsonRequest('http://localhost/api/admin/buildings', { name: 'Etapa 1' }));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.floor_id).toBe('floor-1');
    expect(json.unit_id).toBeNull();
  });

  it('alta válida — "casa" (sin paso de piso ni de unidad): auto-provisiona piso Y unidad', async () => {
    vi.mocked(resolveRequestedProjectId).mockResolvedValue('project-1');
    const supabase = mockSupabase({
      results: [
        { data: { project_type: 'casa', sale_mode: 'venta' } },
        { count: 0 },
        { data: [] },
        { data: { id: 'building-1', slug: 'casa-1', name: 'Casa 1' } },
        { data: { id: 'floor-1' } },
        { data: { id: 'unit-1' } },
      ],
    });
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'user-1' } } as never);

    const res = await POST(jsonRequest('http://localhost/api/admin/buildings', { name: 'Casa 1' }));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.floor_id).toBe('floor-1');
    expect(json.unit_id).toBe('unit-1');
  });
});
