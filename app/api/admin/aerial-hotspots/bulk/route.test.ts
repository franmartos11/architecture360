import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/require-project-access', () => ({
  requireProjectAccess: vi.fn(),
  resolveProjectIdFromSlide: vi.fn(),
  resolveProjectIdFromBuilding: vi.fn(),
}));

import {
  requireProjectAccess,
  resolveProjectIdFromSlide,
  resolveProjectIdFromBuilding,
} from '@/lib/supabase/require-project-access';
import { mockSupabase, jsonRequest } from '@/lib/test-helpers/supabase-mock';
import { POST } from './route';

const ITEM_A = { slideId: 'slide-1', buildingId: 'building-1', x: 0.5, y: 0.25, polygon: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }] };
const ITEM_B = { slideId: 'slide-1', buildingId: 'building-2', x: 0.4, y: 0.6 };

describe('POST /api/admin/aerial-hotspots/bulk', () => {
  beforeEach(() => {
    vi.mocked(requireProjectAccess).mockReset();
    vi.mocked(resolveProjectIdFromSlide).mockReset();
    vi.mocked(resolveProjectIdFromBuilding).mockReset();
  });

  it('sin items: 400 sin resolver nada', async () => {
    const res = await POST(jsonRequest('http://localhost/api/admin/aerial-hotspots/bulk', { items: [] }));
    expect(res.status).toBe(400);
    expect(resolveProjectIdFromSlide).not.toHaveBeenCalled();
  });

  it('un item mal formado (falta x): 400 sin resolver nada', async () => {
    const res = await POST(
      jsonRequest('http://localhost/api/admin/aerial-hotspots/bulk', { items: [{ slideId: 's', buildingId: 'b', y: 1 }] })
    );
    expect(res.status).toBe(400);
    expect(resolveProjectIdFromSlide).not.toHaveBeenCalled();
  });

  it('un slide de otro proyecto: rechazado con 400', async () => {
    vi.mocked(resolveProjectIdFromSlide).mockResolvedValue('project-1');
    vi.mocked(resolveProjectIdFromBuilding)
      .mockResolvedValueOnce('project-1')
      .mockResolvedValueOnce('project-2');

    const res = await POST(jsonRequest('http://localhost/api/admin/aerial-hotspots/bulk', { items: [ITEM_A, ITEM_B] }));
    expect(res.status).toBe(400);
    expect(requireProjectAccess).not.toHaveBeenCalled();
  });

  it('un edificio inexistente: 404', async () => {
    vi.mocked(resolveProjectIdFromSlide).mockResolvedValue('project-1');
    vi.mocked(resolveProjectIdFromBuilding).mockResolvedValue(null);

    const res = await POST(jsonRequest('http://localhost/api/admin/aerial-hotspots/bulk', { items: [ITEM_A] }));
    expect(res.status).toBe(404);
  });

  it('sin acceso al proyecto: 401', async () => {
    vi.mocked(resolveProjectIdFromSlide).mockResolvedValue('project-1');
    vi.mocked(resolveProjectIdFromBuilding).mockResolvedValue('project-1');
    vi.mocked(requireProjectAccess).mockResolvedValue(null);

    const res = await POST(jsonRequest('http://localhost/api/admin/aerial-hotspots/bulk', { items: [ITEM_A] }));
    expect(res.status).toBe(401);
  });

  it('error al leer los hotspots existentes: 500', async () => {
    vi.mocked(resolveProjectIdFromSlide).mockResolvedValue('project-1');
    vi.mocked(resolveProjectIdFromBuilding).mockResolvedValue('project-1');
    const supabase = mockSupabase({ results: [{ data: null, error: { message: 'boom' } }] });
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'user-1' } } as never);

    const res = await POST(jsonRequest('http://localhost/api/admin/aerial-hotspots/bulk', { items: [ITEM_A] }));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe('boom');
  });

  it('camino feliz: un item nuevo (insert) y uno existente (update), un resultado por cada uno', async () => {
    vi.mocked(resolveProjectIdFromSlide).mockResolvedValue('project-1');
    vi.mocked(resolveProjectIdFromBuilding).mockResolvedValue('project-1');
    const supabase = mockSupabase({
      results: [
        { data: [{ id: 'hotspot-existing', slide_id: 'slide-1', building_id: 'building-2' }] }, // select existentes
        { data: { id: 'hotspot-new', slide_id: 'slide-1', building_id: 'building-1' } }, // insert de ITEM_A
        { data: { id: 'hotspot-existing', slide_id: 'slide-1', building_id: 'building-2' } }, // update de ITEM_B
      ],
    });
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'user-1' } } as never);

    const res = await POST(jsonRequest('http://localhost/api/admin/aerial-hotspots/bulk', { items: [ITEM_A, ITEM_B] }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.results).toEqual([
      { slideId: 'slide-1', buildingId: 'building-1', success: true, data: { id: 'hotspot-new', slide_id: 'slide-1', building_id: 'building-1' }, error: null },
      { slideId: 'slide-1', buildingId: 'building-2', success: true, data: { id: 'hotspot-existing', slide_id: 'slide-1', building_id: 'building-2' }, error: null },
    ]);
  });

  it('uno de los items falla al escribir: el otro se guarda igual y cada uno informa su resultado', async () => {
    vi.mocked(resolveProjectIdFromSlide).mockResolvedValue('project-1');
    vi.mocked(resolveProjectIdFromBuilding).mockResolvedValue('project-1');
    const supabase = mockSupabase({
      results: [
        { data: [] }, // select existentes: ninguno todavía
        { data: null, error: { message: 'insert failed' } }, // insert de ITEM_A falla
        { data: { id: 'hotspot-new-2', slide_id: 'slide-1', building_id: 'building-2' } }, // insert de ITEM_B ok
      ],
    });
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'user-1' } } as never);

    const res = await POST(jsonRequest('http://localhost/api/admin/aerial-hotspots/bulk', { items: [ITEM_A, ITEM_B] }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.results[0]).toEqual({ slideId: 'slide-1', buildingId: 'building-1', success: false, data: null, error: 'insert failed' });
    expect(body.results[1]).toEqual({ slideId: 'slide-1', buildingId: 'building-2', success: true, data: { id: 'hotspot-new-2', slide_id: 'slide-1', building_id: 'building-2' }, error: null });
  });
});
