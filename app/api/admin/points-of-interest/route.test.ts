import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/require-project-access', () => ({
  requireProjectAccess: vi.fn(),
  resolveRequestedProjectId: vi.fn(),
}));

import { requireProjectAccess, resolveRequestedProjectId } from '@/lib/supabase/require-project-access';
import { mockSupabase, jsonRequest } from '@/lib/test-helpers/supabase-mock';
import { POST } from './route';

const VALID_BODY = { name: 'Colegio San José', category: 'colegio' };

describe('POST /api/admin/points-of-interest', () => {
  beforeEach(() => {
    vi.mocked(requireProjectAccess).mockReset();
    vi.mocked(resolveRequestedProjectId).mockReset();
  });

  it('proyecto no encontrado: 404', async () => {
    vi.mocked(resolveRequestedProjectId).mockResolvedValue(null);
    const res = await POST(jsonRequest('http://localhost/api/admin/points-of-interest', VALID_BODY));
    expect(res.status).toBe(404);
  });

  it('sin acceso al proyecto: 401', async () => {
    vi.mocked(resolveRequestedProjectId).mockResolvedValue('project-1');
    vi.mocked(requireProjectAccess).mockResolvedValue(null);

    const res = await POST(jsonRequest('http://localhost/api/admin/points-of-interest', VALID_BODY));
    expect(res.status).toBe(401);
  });

  it('falta name: 400', async () => {
    vi.mocked(resolveRequestedProjectId).mockResolvedValue('project-1');
    const supabase = mockSupabase({ results: [] });
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'user-1' } } as never);

    const res = await POST(jsonRequest('http://localhost/api/admin/points-of-interest', { category: 'colegio' }));
    expect(res.status).toBe(400);
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('category inválida: 400', async () => {
    vi.mocked(resolveRequestedProjectId).mockResolvedValue('project-1');
    const supabase = mockSupabase({ results: [] });
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'user-1' } } as never);

    const res = await POST(jsonRequest('http://localhost/api/admin/points-of-interest', { name: 'x', category: 'inventado' }));
    expect(res.status).toBe(400);
  });

  it('error de la base al insertar: 500 con el mensaje', async () => {
    vi.mocked(resolveRequestedProjectId).mockResolvedValue('project-1');
    const supabase = mockSupabase({ results: [{ data: null, error: { message: 'insert failed' } }] });
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'user-1' } } as never);

    const res = await POST(jsonRequest('http://localhost/api/admin/points-of-interest', VALID_BODY));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe('No se pudo completar la operación. Probá de nuevo en un rato.'); // no filtra el mensaje de la base
  });

  it('alta válida: inserta y devuelve 201 con la fila creada', async () => {
    vi.mocked(resolveRequestedProjectId).mockResolvedValue('project-1');
    const supabase = mockSupabase({
      results: [{ data: { id: 'poi-1', name: 'Colegio San José', category: 'colegio' }, error: null }],
    });
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'user-1' } } as never);

    const res = await POST(jsonRequest('http://localhost/api/admin/points-of-interest', VALID_BODY));
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ id: 'poi-1', name: 'Colegio San José', category: 'colegio' });
  });

  it('sin category: usa "otro" por default', async () => {
    vi.mocked(resolveRequestedProjectId).mockResolvedValue('project-1');
    const supabase = mockSupabase({
      results: [{ data: { id: 'poi-1', name: 'Plaza', category: 'otro' }, error: null }],
    });
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'user-1' } } as never);

    const res = await POST(jsonRequest('http://localhost/api/admin/points-of-interest', { name: 'Plaza' }));
    expect(res.status).toBe(201);
  });
});

describe('POST /api/admin/points-of-interest: validación de forma y topes', () => {
  beforeEach(() => {
    vi.mocked(requireProjectAccess).mockReset();
    vi.mocked(resolveRequestedProjectId).mockReset();
  });

  it.each([
    ['latitud fuera de rango', { name: 'Colegio', latitude: 200 }],
    ['longitud fuera de rango', { name: 'Colegio', longitude: -400 }],
    ['imagen con javascript:', { name: 'Colegio', image: 'javascript:alert(1)' }],
    ['minutos negativos', { name: 'Colegio', walkMinutes: -5 }],
    ['minutos como texto raro', { name: 'Colegio', walkMinutes: 'mucho' }],
    ['descripción gigante', { name: 'Colegio', description: 'x'.repeat(2001) }],
  ])('400 con %s, sin tocar la base', async (_n, body) => {
    vi.mocked(resolveRequestedProjectId).mockResolvedValue('project-1');
    const supabase = mockSupabase({ results: [] });
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'user-1' } } as never);
    const res = await POST(jsonRequest('http://localhost/api/admin/points-of-interest', body));
    expect(res.status).toBe(400);
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('acepta los minutos escritos como texto numérico (la ruta los convierte con Number)', async () => {
    vi.mocked(resolveRequestedProjectId).mockResolvedValue('project-1');
    const supabase = mockSupabase({ results: [{ data: { id: 'poi-1' } }] });
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'user-1' } } as never);
    const res = await POST(jsonRequest('http://localhost/api/admin/points-of-interest', { name: 'Colegio', walkMinutes: '12' }));
    expect(res.status).toBe(201);
    expect(supabase.from.mock.results[0].value.insert.mock.calls[0][0].walk_minutes).toBe(12);
  });
});
