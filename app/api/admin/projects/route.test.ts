import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));
vi.mock('@/lib/supabase/require-project-access', () => ({ resolveActiveProjectId: vi.fn() }));
vi.mock('@/lib/provision-structure', () => ({ provisionSingleUnitStructure: vi.fn() }));

import { createClient } from '@/lib/supabase/server';
import { resolveActiveProjectId } from '@/lib/supabase/require-project-access';
import { provisionSingleUnitStructure } from '@/lib/provision-structure';
import { mockSupabase, jsonRequest } from '@/lib/test-helpers/supabase-mock';
import { GET, POST } from './route';

describe('GET /api/admin/projects', () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset();
    vi.mocked(resolveActiveProjectId).mockReset();
  });

  it('sin sesión: 401', async () => {
    const supabase = mockSupabase({ user: null, results: [] });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await GET();
    expect(res.status).toBe(401);
  });

  it('error al listar los proyectos: 500', async () => {
    const supabase = mockSupabase({ user: { id: 'user-1' }, results: [{ error: { message: 'db down' } }] });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await GET();
    expect(res.status).toBe(500);
  });

  it('sin proyectos: no consulta leads/comentarios y devuelve lista vacía', async () => {
    const supabase = mockSupabase({ user: { id: 'user-1' }, results: [{ data: [] }] });
    vi.mocked(createClient).mockResolvedValue(supabase as never);
    vi.mocked(resolveActiveProjectId).mockResolvedValue(null);

    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ projects: [], activeProjectId: null });
    expect(supabase.from).toHaveBeenCalledTimes(1);
  });

  it('con proyectos: enriquece cada uno con sus leads pendientes y comentarios, y marca el activo', async () => {
    const supabase = mockSupabase({
      user: { id: 'user-1' },
      results: [
        { data: [{ id: 'project-1', name: 'Torre del Mar' }, { id: 'project-2', name: 'Casa Roble' }] }, // .from('projects')
        { data: [{ project_id: 'project-1' }, { project_id: 'project-1' }] }, // .from('leads') status=nuevo
        { data: [{ project_id: 'project-2' }] }, // .from('project_comments')
        { data: [] }, // .from('buildings')
        { data: [] }, // .from('amenities')
        { data: [] }, // .from('aerial_slides')
        { data: [] }, // .from('points_of_interest')
        { data: [] }, // .from('project_collaborators')
      ],
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);
    vi.mocked(resolveActiveProjectId).mockResolvedValue('project-1');

    const res = await GET();
    expect(res.status).toBe(200);
    // Sin type/saleMode en el mock, getProjectTypeConfig cae a los defaults
    // (edificio/venta) — de ahí el total=6 (about/team/amenities/masterplan/
    // typologies/location; before_after/process quedan afuera por no ser showcase).
    expect(await res.json()).toEqual({
      projects: [
        { id: 'project-1', name: 'Torre del Mar', pendingLeadsCount: 2, commentsCount: 0, progress: { done: 0, total: 6 } },
        { id: 'project-2', name: 'Casa Roble', pendingLeadsCount: 0, commentsCount: 1, progress: { done: 0, total: 6 } },
      ],
      activeProjectId: 'project-1',
    });
  });
});

describe('POST /api/admin/projects', () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset();
    vi.mocked(provisionSingleUnitStructure).mockReset().mockResolvedValue({ buildingId: 'b-1', floorId: 'f-1', unitId: 'u-1' });
  });

  it('sin sesión: 401', async () => {
    const supabase = mockSupabase({ user: null, results: [] });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await POST(jsonRequest('http://localhost/api/admin/projects', { name: 'Torre del Mar' }));
    expect(res.status).toBe(401);
  });

  it('sin name: 400 antes de tocar la base', async () => {
    const supabase = mockSupabase({ user: { id: 'user-1' }, results: [] });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await POST(jsonRequest('http://localhost/api/admin/projects', {}));
    expect(res.status).toBe(400);
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('projectType fuera del catálogo: 400', async () => {
    const supabase = mockSupabase({ user: { id: 'user-1' }, results: [] });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await POST(jsonRequest('http://localhost/api/admin/projects', { name: 'X', projectType: 'rascacielos' }));
    expect(res.status).toBe(400);
  });

  it('saleMode fuera del catálogo: 400', async () => {
    const supabase = mockSupabase({ user: { id: 'user-1' }, results: [] });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await POST(jsonRequest('http://localhost/api/admin/projects', { name: 'X', saleMode: 'alquiler' }));
    expect(res.status).toBe(400);
  });

  it('combinación forma+propósito inválida (ej. "unico" + "venta"): 400', async () => {
    const supabase = mockSupabase({ user: { id: 'user-1' }, results: [] });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await POST(jsonRequest('http://localhost/api/admin/projects', { name: 'Museo', projectType: 'unico', saleMode: 'venta' }));
    expect(res.status).toBe(400);
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('slug repetido (23505): 409', async () => {
    const supabase = mockSupabase({
      user: { id: 'user-1' },
      results: [
        { data: [] }, // ensureUniqueSlug: sin colisiones -> igual intenta insertar con ese slug
        { error: { code: '23505', message: 'duplicate' } }, // insert falla igual (carrera)
      ],
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await POST(jsonRequest('http://localhost/api/admin/projects', { name: 'Torre del Mar' }));
    expect(res.status).toBe(409);
  });

  it('error genérico al insertar: 500', async () => {
    const supabase = mockSupabase({
      user: { id: 'user-1' },
      results: [{ data: [] }, { error: { message: 'insert failed' } }],
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await POST(jsonRequest('http://localhost/api/admin/projects', { name: 'Torre del Mar' }));
    expect(res.status).toBe(500);
  });

  it('alta de un edificio (tiene paso de unidades): no auto-provisiona nada', async () => {
    const supabase = mockSupabase({
      user: { id: 'user-1' },
      results: [
        { data: [] }, // ensureUniqueSlug
        { data: { id: 'project-1', slug: 'torre-del-mar', name: 'Torre del Mar', project_type: 'edificio', sale_mode: 'venta' }, error: null },
      ],
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await POST(jsonRequest('http://localhost/api/admin/projects', { name: 'Torre del Mar' }));
    expect(res.status).toBe(201);
    expect(provisionSingleUnitStructure).not.toHaveBeenCalled();
  });

  it('alta de una casa (sin paso de unidades): auto-provisiona building+piso+unidad', async () => {
    const supabase = mockSupabase({
      user: { id: 'user-1' },
      results: [
        { data: [] }, // ensureUniqueSlug
        { data: { id: 'project-1', slug: 'mi-casa', name: 'Mi Casa', project_type: 'casa', sale_mode: 'venta' }, error: null },
      ],
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await POST(jsonRequest('http://localhost/api/admin/projects', { name: 'Mi Casa', projectType: 'casa' }));
    expect(res.status).toBe(201);
    expect(provisionSingleUnitStructure).toHaveBeenCalledWith(supabase, { projectId: 'project-1', name: 'Mi Casa' });
  });

  it('si la auto-provisión de la casa falla, el proyecto igual queda creado (red de seguridad del wizard)', async () => {
    const supabase = mockSupabase({
      user: { id: 'user-1' },
      results: [
        { data: [] },
        { data: { id: 'project-1', slug: 'mi-casa', name: 'Mi Casa', project_type: 'casa', sale_mode: 'venta' }, error: null },
      ],
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);
    vi.mocked(provisionSingleUnitStructure).mockRejectedValue(new Error('boom'));

    const res = await POST(jsonRequest('http://localhost/api/admin/projects', { name: 'Mi Casa', projectType: 'casa' }));
    expect(res.status).toBe(201);
  });
});
