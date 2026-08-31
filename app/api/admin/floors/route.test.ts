import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/require-project-access', () => ({
  requireProjectAccess: vi.fn(),
  resolveProjectIdFromBuilding: vi.fn(),
}));

import { requireProjectAccess, resolveProjectIdFromBuilding } from '@/lib/supabase/require-project-access';
import { mockSupabase, jsonRequest } from '@/lib/test-helpers/supabase-mock';
import { POST } from './route';

const VALID_BODY = { buildingId: 'building-1', number: 3, label: 'Piso 3' };

describe('POST /api/admin/floors', () => {
  beforeEach(() => {
    vi.mocked(requireProjectAccess).mockReset();
    vi.mocked(resolveProjectIdFromBuilding).mockReset();
  });

  it('faltan campos requeridos: 400 antes de resolver el proyecto', async () => {
    const res = await POST(jsonRequest('http://localhost/api/admin/floors', { buildingId: 'building-1' }));
    expect(res.status).toBe(400);
    expect(resolveProjectIdFromBuilding).not.toHaveBeenCalled();
  });

  it('edificio inexistente: 404', async () => {
    vi.mocked(resolveProjectIdFromBuilding).mockResolvedValue(null);
    const res = await POST(jsonRequest('http://localhost/api/admin/floors', VALID_BODY));
    expect(res.status).toBe(404);
  });

  it('sin acceso al proyecto: 401', async () => {
    vi.mocked(resolveProjectIdFromBuilding).mockResolvedValue('project-1');
    vi.mocked(requireProjectAccess).mockResolvedValue(null);

    const res = await POST(jsonRequest('http://localhost/api/admin/floors', VALID_BODY));
    expect(res.status).toBe(401);
  });

  it('error de la base al insertar: 500 con el mensaje', async () => {
    vi.mocked(resolveProjectIdFromBuilding).mockResolvedValue('project-1');
    const supabase = mockSupabase({ results: [{ data: null, error: { message: 'insert failed' } }] });
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'user-1' } } as never);

    const res = await POST(jsonRequest('http://localhost/api/admin/floors', VALID_BODY));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe('insert failed');
  });

  it('alta válida: inserta y devuelve 201 con la fila creada', async () => {
    vi.mocked(resolveProjectIdFromBuilding).mockResolvedValue('project-1');
    const supabase = mockSupabase({
      results: [{ data: { id: 'floor-1', number: 3, label: 'Piso 3' }, error: null }],
    });
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'user-1' } } as never);

    const res = await POST(jsonRequest('http://localhost/api/admin/floors', VALID_BODY));
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ id: 'floor-1', number: 3, label: 'Piso 3' });
  });
});
