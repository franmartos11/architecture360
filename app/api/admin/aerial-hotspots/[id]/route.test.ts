import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/require-project-access', () => ({
  requireProjectAccess: vi.fn(),
  resolveProjectIdFromHotspot: vi.fn(),
  resolveProjectIdFromBuilding: vi.fn(),
}));

import {
  requireProjectAccess,
  resolveProjectIdFromHotspot,
  resolveProjectIdFromBuilding,
} from '@/lib/supabase/require-project-access';
import { mockSupabase, jsonRequest } from '@/lib/test-helpers/supabase-mock';
import { PATCH, DELETE } from './route';

function del(url: string) {
  return new Request(url, { method: 'DELETE' });
}

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe('PATCH /api/admin/aerial-hotspots/[id]', () => {
  beforeEach(() => {
    vi.mocked(requireProjectAccess).mockReset();
    vi.mocked(resolveProjectIdFromHotspot).mockReset();
    vi.mocked(resolveProjectIdFromBuilding).mockReset();
  });

  it('hotspot inexistente: 404', async () => {
    vi.mocked(resolveProjectIdFromHotspot).mockResolvedValue(null);
    const res = await PATCH(
      jsonRequest('http://localhost/api/admin/aerial-hotspots/hotspot-1', { x: 0.1 }, { method: 'PATCH' }),
      ctx('hotspot-1')
    );
    expect(res.status).toBe(404);
  });

  it('cambia a un edificio de otro proyecto: 400, sin llegar a chequear acceso', async () => {
    vi.mocked(resolveProjectIdFromHotspot).mockResolvedValue('project-1');
    vi.mocked(resolveProjectIdFromBuilding).mockResolvedValue('project-2');

    const res = await PATCH(
      jsonRequest('http://localhost/api/admin/aerial-hotspots/hotspot-1', { buildingId: 'building-2' }, { method: 'PATCH' }),
      ctx('hotspot-1')
    );
    expect(res.status).toBe(400);
    expect(requireProjectAccess).not.toHaveBeenCalled();
  });

  it('cambia a un edificio inexistente (resuelve a null): 400', async () => {
    vi.mocked(resolveProjectIdFromHotspot).mockResolvedValue('project-1');
    vi.mocked(resolveProjectIdFromBuilding).mockResolvedValue(null);

    const res = await PATCH(
      jsonRequest('http://localhost/api/admin/aerial-hotspots/hotspot-1', { buildingId: 'no-existe' }, { method: 'PATCH' }),
      ctx('hotspot-1')
    );
    expect(res.status).toBe(400);
  });

  it('sin acceso al proyecto: 401', async () => {
    vi.mocked(resolveProjectIdFromHotspot).mockResolvedValue('project-1');
    vi.mocked(requireProjectAccess).mockResolvedValue(null);

    const res = await PATCH(
      jsonRequest('http://localhost/api/admin/aerial-hotspots/hotspot-1', { x: 0.1 }, { method: 'PATCH' }),
      ctx('hotspot-1')
    );
    expect(res.status).toBe(401);
  });

  it('actualización válida: solo pasa los campos presentes en el body', async () => {
    vi.mocked(resolveProjectIdFromHotspot).mockResolvedValue('project-1');
    vi.mocked(resolveProjectIdFromBuilding).mockResolvedValue('project-1');
    const supabase = mockSupabase({ results: [{ data: { id: 'hotspot-1', x: 0.1, y: 0.2 } }] });
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'user-1' } } as never);

    const res = await PATCH(
      jsonRequest(
        'http://localhost/api/admin/aerial-hotspots/hotspot-1',
        { buildingId: 'building-1', x: 0.1, y: 0.2, polygon: [[0, 0]] },
        { method: 'PATCH' }
      ),
      ctx('hotspot-1')
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: 'hotspot-1', x: 0.1, y: 0.2 });
  });

  it('error de la base al actualizar: 500 con el mensaje', async () => {
    vi.mocked(resolveProjectIdFromHotspot).mockResolvedValue('project-1');
    const supabase = mockSupabase({ results: [{ error: { message: 'boom' } }] });
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'user-1' } } as never);

    const res = await PATCH(
      jsonRequest('http://localhost/api/admin/aerial-hotspots/hotspot-1', { x: 0.1 }, { method: 'PATCH' }),
      ctx('hotspot-1')
    );
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe('boom');
  });
});

describe('DELETE /api/admin/aerial-hotspots/[id]', () => {
  beforeEach(() => {
    vi.mocked(requireProjectAccess).mockReset();
    vi.mocked(resolveProjectIdFromHotspot).mockReset();
  });

  it('hotspot inexistente: 404', async () => {
    vi.mocked(resolveProjectIdFromHotspot).mockResolvedValue(null);
    const res = await DELETE(del('http://localhost/api/admin/aerial-hotspots/hotspot-1'), ctx('hotspot-1'));
    expect(res.status).toBe(404);
  });

  it('sin acceso al proyecto: 401', async () => {
    vi.mocked(resolveProjectIdFromHotspot).mockResolvedValue('project-1');
    vi.mocked(requireProjectAccess).mockResolvedValue(null);
    const res = await DELETE(del('http://localhost/api/admin/aerial-hotspots/hotspot-1'), ctx('hotspot-1'));
    expect(res.status).toBe(401);
  });

  it('con acceso: borra y devuelve success', async () => {
    vi.mocked(resolveProjectIdFromHotspot).mockResolvedValue('project-1');
    const supabase = mockSupabase({ results: [{ error: null }] });
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'user-1' } } as never);

    const res = await DELETE(del('http://localhost/api/admin/aerial-hotspots/hotspot-1'), ctx('hotspot-1'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
  });

  it('error de la base al borrar: 500 con el mensaje', async () => {
    vi.mocked(resolveProjectIdFromHotspot).mockResolvedValue('project-1');
    const supabase = mockSupabase({ results: [{ error: { message: 'boom' } }] });
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'user-1' } } as never);

    const res = await DELETE(del('http://localhost/api/admin/aerial-hotspots/hotspot-1'), ctx('hotspot-1'));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe('boom');
  });
});
