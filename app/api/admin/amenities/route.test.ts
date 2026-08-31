import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/require-project-access', () => ({
  requireProjectAccess: vi.fn(),
  resolveRequestedProjectId: vi.fn(),
  resolveProjectIdFromBuilding: vi.fn(),
}));

import {
  requireProjectAccess,
  resolveRequestedProjectId,
  resolveProjectIdFromBuilding,
} from '@/lib/supabase/require-project-access';
import { mockSupabase, jsonRequest } from '@/lib/test-helpers/supabase-mock';
import { POST } from './route';

describe('POST /api/admin/amenities', () => {
  beforeEach(() => {
    vi.mocked(requireProjectAccess).mockReset();
    vi.mocked(resolveRequestedProjectId).mockReset();
    vi.mocked(resolveProjectIdFromBuilding).mockReset();
  });

  it('proyecto activo no encontrado: 404 antes de leer el body', async () => {
    vi.mocked(resolveRequestedProjectId).mockResolvedValue(null);

    const res = await POST(jsonRequest('http://localhost/api/admin/amenities', { name: 'Pileta' }));
    expect(res.status).toBe(404);
  });

  it('falta name: 400', async () => {
    vi.mocked(resolveRequestedProjectId).mockResolvedValue('project-1');

    const res = await POST(jsonRequest('http://localhost/api/admin/amenities', { name: '' }));
    expect(res.status).toBe(400);
  });

  it('buildingId de otro proyecto: 400, no llega a chequear auth', async () => {
    vi.mocked(resolveRequestedProjectId).mockResolvedValue('project-1');
    vi.mocked(resolveProjectIdFromBuilding).mockResolvedValue('project-2');

    const res = await POST(jsonRequest('http://localhost/api/admin/amenities', { name: 'Pileta', buildingId: 'building-1' }));
    expect(res.status).toBe(400);
    expect(requireProjectAccess).not.toHaveBeenCalled();
  });

  it('sin acceso al proyecto: 401', async () => {
    vi.mocked(resolveRequestedProjectId).mockResolvedValue('project-1');
    vi.mocked(requireProjectAccess).mockResolvedValue(null);

    const res = await POST(jsonRequest('http://localhost/api/admin/amenities', { name: 'Pileta' }));
    expect(res.status).toBe(401);
  });

  it('alta válida sin buildingId: inserta y devuelve 201', async () => {
    vi.mocked(resolveRequestedProjectId).mockResolvedValue('project-1');
    const supabase = mockSupabase({
      results: [{ data: { id: 'amenity-1', name: 'Pileta' } }], // .insert(...).select().single()
    });
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'user-1' } } as never);

    const res = await POST(jsonRequest('http://localhost/api/admin/amenities', { name: 'Pileta' }));
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ id: 'amenity-1', name: 'Pileta' });
    expect(resolveProjectIdFromBuilding).not.toHaveBeenCalled();
  });

  it('alta válida con buildingId del mismo proyecto: inserta y devuelve 201', async () => {
    vi.mocked(resolveRequestedProjectId).mockResolvedValue('project-1');
    vi.mocked(resolveProjectIdFromBuilding).mockResolvedValue('project-1');
    const supabase = mockSupabase({
      results: [{ data: { id: 'amenity-1', name: 'Gimnasio', building_id: 'building-1' } }],
    });
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'user-1' } } as never);

    const res = await POST(jsonRequest('http://localhost/api/admin/amenities', { name: 'Gimnasio', buildingId: 'building-1' }));
    expect(res.status).toBe(201);
  });

  it('error de la base al insertar: 500 con el mensaje', async () => {
    vi.mocked(resolveRequestedProjectId).mockResolvedValue('project-1');
    const supabase = mockSupabase({ results: [{ data: null, error: { message: 'insert failed' } }] });
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'user-1' } } as never);

    const res = await POST(jsonRequest('http://localhost/api/admin/amenities', { name: 'Pileta' }));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe('insert failed');
  });
});
