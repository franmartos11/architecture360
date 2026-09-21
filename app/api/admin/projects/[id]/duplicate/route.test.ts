import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/require-project-access', () => ({ requireProjectAccess: vi.fn() }));

import { requireProjectAccess } from '@/lib/supabase/require-project-access';
import { mockSupabase, jsonRequest } from '@/lib/test-helpers/supabase-mock';
import { POST } from './route';

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

function req(id: string) {
  return jsonRequest(`http://localhost/api/admin/projects/${id}/duplicate`, {});
}

describe('POST /api/admin/projects/[id]/duplicate', () => {
  beforeEach(() => {
    vi.mocked(requireProjectAccess).mockReset();
  });

  it('sin acceso al proyecto: 401', async () => {
    vi.mocked(requireProjectAccess).mockResolvedValue(null);
    const res = await POST(req('project-1'), params('project-1'));
    expect(res.status).toBe(401);
  });

  it('proyecto de origen no encontrado: 404', async () => {
    const supabase = mockSupabase({ results: [{ data: null }] });
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'user-1' } } as never);
    const res = await POST(req('project-1'), params('project-1'));
    expect(res.status).toBe(404);
  });

  // Hallazgo 1 de la ronda de corrección: al duplicar un proyecto entero,
  // cada unidad copiada tiene que apuntar su(s) cochera(s) al piso YA
  // duplicado (floorIdMap), no al del proyecto original. floorIdMap acá
  // cubre TODOS los pisos de TODOS los edificios del proyecto.
  it('remapea el floorId de parking_spots al copiar las unidades del proyecto', async () => {
    const sourceProject = { id: 'project-src', name: 'Proyecto Test', project_type: 'edificio', sale_mode: 'venta' };
    const createdProject = { id: 'project-new', slug: 'proyecto-test-copia', name: 'Proyecto Test (copia)' };
    const sourceBuilding = { id: 'b-src', slug: 'torre-a', name: 'Torre A' };
    const newBuilding = { id: 'b-new', slug: 'torre-a' };
    const floorParking = { id: 'floor-p1', building_id: 'b-src', number: -1, label: 'Subsuelo 1', plan_image: 'ss1.png', unit_dots: [], floor_kind: 'parking', floor_kind_description: null };
    const floorUnits = { id: 'floor-u1', building_id: 'b-src', number: 7, label: 'Piso 7', plan_image: 'p7.png', unit_dots: [], floor_kind: 'units', floor_kind_description: null };
    const newFloorParking = { id: 'floor-p1-new' };
    const newFloorUnits = { id: 'floor-u1-new' };
    const sourceUnit = {
      id: 'unit-7b', floor_id: 'floor-u1', code: '7B', created_at: 't', updated_at: 't',
      parking_spots: [
        { floorId: 'floor-p1', label: 'C-7', polygon: [{ x: 1, y: 1 }] },
        { floorId: 'floor-huerfano', polygon: [{ x: 2, y: 2 }] }, // piso fuera del mapa: se descarta
      ],
    };

    const base = mockSupabase({
      results: [
        { data: sourceProject },                                 // 1: projects select (fuente)
        { data: [] },                                              // 2: ensureUniqueSlug (projects)
        { data: createdProject, error: null },                     // 3: projects insert
        { data: [sourceBuilding] },                                 // 4: buildings select
        { data: [newBuilding], error: null },                       // 5: buildings insert
        { data: [floorParking, floorUnits] },                       // 6: floors select
        { data: [newFloorParking, newFloorUnits], error: null },    // 7: floors insert
        { data: [sourceUnit] },                                     // 8: units select
        // 9: units insert — interceptada con el spy
        { data: [] },                                               // 10: amenities select
        { data: [] },                                               // 11: aerial_slides select
        { data: [] },                                               // 12: points_of_interest select
      ],
    });

    const insertUnitsSpy = vi.fn((_rows: Record<string, unknown>[]) => Promise.resolve({ error: null }));
    let calls = 0;
    const supabase = {
      ...base,
      from: vi.fn((table: string) => {
        calls++;
        if (calls === 9) return { insert: insertUnitsSpy };
        return base.from(table);
      }),
    };
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'user-1' } } as never);

    const res = await POST(req('project-src'), params('project-src'));
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual(createdProject);

    expect(insertUnitsSpy).toHaveBeenCalledTimes(1);
    const insertedUnits = insertUnitsSpy.mock.calls[0][0] as Array<{ floor_id: string; parking_spots: { floorId: string }[] }>;
    expect(insertedUnits).toHaveLength(1);
    expect(insertedUnits[0].floor_id).toBe('floor-u1-new');
    expect(insertedUnits[0].parking_spots).toEqual([{ floorId: 'floor-p1-new', label: 'C-7', polygon: [{ x: 1, y: 1 }] }]);
  });
});
