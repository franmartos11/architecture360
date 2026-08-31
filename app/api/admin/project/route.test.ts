import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/require-project-access', () => ({
  requireProjectAccess: vi.fn(),
  resolveRequestedProjectId: vi.fn(),
}));

import { requireProjectAccess, resolveRequestedProjectId } from '@/lib/supabase/require-project-access';
import { mockSupabase, jsonRequest } from '@/lib/test-helpers/supabase-mock';
import { GET, PATCH } from './route';

function get(url: string) {
  return new Request(url);
}

describe('GET /api/admin/project', () => {
  beforeEach(() => {
    vi.mocked(requireProjectAccess).mockReset();
    vi.mocked(resolveRequestedProjectId).mockReset();
  });

  it('sin proyecto activo: 404', async () => {
    vi.mocked(resolveRequestedProjectId).mockResolvedValue(null);

    const res = await GET(get('http://localhost/api/admin/project'));
    expect(res.status).toBe(404);
    expect(requireProjectAccess).not.toHaveBeenCalled();
  });

  it('sin acceso al proyecto: 401', async () => {
    vi.mocked(resolveRequestedProjectId).mockResolvedValue('project-1');
    vi.mocked(requireProjectAccess).mockResolvedValue(null);

    const res = await GET(get('http://localhost/api/admin/project'));
    expect(res.status).toBe(401);
  });

  it('error al buscar el proyecto: 500', async () => {
    vi.mocked(resolveRequestedProjectId).mockResolvedValue('project-1');
    const supabase = mockSupabase({ results: [{ error: { message: 'db down' } }] });
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'user-1' } } as never);

    const res = await GET(get('http://localhost/api/admin/project'));
    expect(res.status).toBe(500);
  });

  it('proyecto activo ya no existe: 404, sin disparar el resto de los queries', async () => {
    vi.mocked(resolveRequestedProjectId).mockResolvedValue('project-1');
    const supabase = mockSupabase({ results: [{ data: null }] });
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'user-1' } } as never);

    const res = await GET(get('http://localhost/api/admin/project'));
    expect(res.status).toBe(404);
    expect(supabase.from).toHaveBeenCalledTimes(1);
  });

  it('camino feliz sin vistas aéreas ni comentarios: junta todas las secciones del proyecto', async () => {
    vi.mocked(resolveRequestedProjectId).mockResolvedValue('project-1');
    const supabase = mockSupabase({
      results: [
        { data: { id: 'project-1', slug: 'torre-del-mar', name: 'Torre del Mar' } }, // .from('projects')...maybeSingle()
        { data: [{ id: 'building-1' }] }, // .from('buildings')
        { data: [] }, // .from('aerial_slides')
        { data: [{ id: 'amenity-1' }] }, // .from('amenities')
        { data: [{ id: 'poi-1' }] }, // .from('points_of_interest')
        { data: [{ id: 'collab-1' }] }, // .from('project_collaborators')
        { data: [] }, // .from('project_comments')
      ],
    });
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'user-1' } } as never);

    const res = await GET(get('http://localhost/api/admin/project'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      project: { id: 'project-1', slug: 'torre-del-mar', name: 'Torre del Mar' },
      buildings: [{ id: 'building-1' }],
      slides: [],
      hotspots: [],
      amenities: [{ id: 'amenity-1' }],
      pointsOfInterest: [{ id: 'poi-1' }],
      collaborators: [{ id: 'collab-1' }],
      comments: [],
    });
  });

  it('con vistas aéreas: trae también los hotspots de esas vistas', async () => {
    vi.mocked(resolveRequestedProjectId).mockResolvedValue('project-1');
    const supabase = mockSupabase({
      results: [
        { data: { id: 'project-1', slug: 'torre-del-mar' } },
        { data: [] }, // buildings
        { data: [{ id: 'slide-1' }] }, // aerial_slides
        { data: [] }, // amenities
        { data: [] }, // points_of_interest
        { data: [] }, // project_collaborators
        { data: [] }, // project_comments (vacío, sin autores que buscar)
        { data: [{ id: 'hotspot-1', slide_id: 'slide-1' }] }, // aerial_hotspots
      ],
    });
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'user-1' } } as never);

    const res = await GET(get('http://localhost/api/admin/project'));
    const body = await res.json();
    expect(body.slides).toEqual([{ id: 'slide-1' }]);
    expect(body.hotspots).toEqual([{ id: 'hotspot-1', slide_id: 'slide-1' }]);
  });

  it('con comentarios: arma el autor de cada uno a mano (sin FK real a profiles)', async () => {
    vi.mocked(resolveRequestedProjectId).mockResolvedValue('project-1');
    const supabase = mockSupabase({
      results: [
        { data: { id: 'project-1', slug: 'torre-del-mar' } },
        { data: [] }, // buildings
        { data: [] }, // aerial_slides (vacío, sin hotspots que buscar)
        { data: [] }, // amenities
        { data: [] }, // points_of_interest
        { data: [] }, // project_collaborators
        { data: [{ id: 'comment-1', author_id: 'user-2', body: 'Hola' }] }, // project_comments
        { data: [{ id: 'user-2', handle: 'ana', display_name: 'Ana' }] }, // profiles
      ],
    });
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'user-1' } } as never);

    const res = await GET(get('http://localhost/api/admin/project'));
    const body = await res.json();
    expect(body.comments).toEqual([
      { id: 'comment-1', author_id: 'user-2', body: 'Hola', author: { id: 'user-2', handle: 'ana', display_name: 'Ana' } },
    ]);
  });
});

describe('PATCH /api/admin/project', () => {
  beforeEach(() => {
    vi.mocked(requireProjectAccess).mockReset();
    vi.mocked(resolveRequestedProjectId).mockReset();
  });

  it('sin proyecto activo: 404', async () => {
    vi.mocked(resolveRequestedProjectId).mockResolvedValue(null);

    const res = await PATCH(jsonRequest('http://localhost/api/admin/project', { name: 'Nuevo nombre' }));
    expect(res.status).toBe(404);
  });

  it('sin acceso al proyecto: 401', async () => {
    vi.mocked(resolveRequestedProjectId).mockResolvedValue('project-1');
    vi.mocked(requireProjectAccess).mockResolvedValue(null);

    const res = await PATCH(jsonRequest('http://localhost/api/admin/project', { name: 'Nuevo nombre' }));
    expect(res.status).toBe(401);
  });

  it('saleMode fuera del enum aceptado: 400 antes de tocar la base', async () => {
    vi.mocked(resolveRequestedProjectId).mockResolvedValue('project-1');
    const supabase = mockSupabase({ results: [] });
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'user-1' } } as never);

    const res = await PATCH(jsonRequest('http://localhost/api/admin/project', { saleMode: 'alquiler' }));
    expect(res.status).toBe(400);
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('nuevo saleMode incompatible con la forma ya guardada: 400, no actualiza', async () => {
    vi.mocked(resolveRequestedProjectId).mockResolvedValue('project-1');
    const supabase = mockSupabase({ results: [{ data: { project_type: 'unico' } }] }); // 'unico' solo admite 'showcase'
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'user-1' } } as never);

    const res = await PATCH(jsonRequest('http://localhost/api/admin/project', { saleMode: 'venta' }));
    expect(res.status).toBe(400);
    expect(supabase.from).toHaveBeenCalledTimes(1);
  });

  it('actualización simple (sin cambiar saleMode): no consulta project_type, solo actualiza', async () => {
    vi.mocked(resolveRequestedProjectId).mockResolvedValue('project-1');
    const supabase = mockSupabase({ results: [{ data: { id: 'project-1', name: 'Nuevo nombre' }, error: null }] });
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'user-1' } } as never);

    const res = await PATCH(jsonRequest('http://localhost/api/admin/project', { name: 'Nuevo nombre' }));
    expect(res.status).toBe(200);
    expect(supabase.from).toHaveBeenCalledTimes(1);
  });

  it('cambio de saleMode compatible: valida el combo y actualiza', async () => {
    vi.mocked(resolveRequestedProjectId).mockResolvedValue('project-1');
    const supabase = mockSupabase({
      results: [
        { data: { project_type: 'edificio' } }, // edificio admite venta y showcase
        { data: { id: 'project-1', sale_mode: 'showcase' }, error: null },
      ],
    });
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'user-1' } } as never);

    const res = await PATCH(jsonRequest('http://localhost/api/admin/project', { saleMode: 'showcase' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: 'project-1', sale_mode: 'showcase' });
  });

  it('error de la base al actualizar: 500 con el mensaje', async () => {
    vi.mocked(resolveRequestedProjectId).mockResolvedValue('project-1');
    const supabase = mockSupabase({ results: [{ error: { message: 'update failed' } }] });
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'user-1' } } as never);

    const res = await PATCH(jsonRequest('http://localhost/api/admin/project', { name: 'X' }));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe('update failed');
  });
});
