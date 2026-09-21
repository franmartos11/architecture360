import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/require-project-access', () => ({
  requireProjectAccess: vi.fn(),
  resolveProjectIdFromBuilding: vi.fn(),
}));

import { requireProjectAccess, resolveProjectIdFromBuilding } from '@/lib/supabase/require-project-access';
import { mockSupabase, jsonRequest } from '@/lib/test-helpers/supabase-mock';
import { POST } from './route';

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

function req(buildingId: string) {
  return jsonRequest(`http://localhost/api/admin/buildings/${buildingId}/duplicate`, {});
}

describe('POST /api/admin/buildings/[id]/duplicate', () => {
  beforeEach(() => {
    vi.mocked(requireProjectAccess).mockReset();
    vi.mocked(resolveProjectIdFromBuilding).mockReset();
  });

  it('edificio inexistente (no resuelve project_id): 404', async () => {
    vi.mocked(resolveProjectIdFromBuilding).mockResolvedValue(null);
    const res = await POST(req('building-1'), params('building-1'));
    expect(res.status).toBe(404);
  });

  it('sin acceso al proyecto: 401', async () => {
    vi.mocked(resolveProjectIdFromBuilding).mockResolvedValue('project-1');
    vi.mocked(requireProjectAccess).mockResolvedValue(null);
    const res = await POST(req('building-1'), params('building-1'));
    expect(res.status).toBe(401);
  });

  // Hallazgo 1 de la ronda de corrección: al duplicar un edificio, cada
  // unidad copiada tiene que apuntar su(s) cochera(s) al piso YA duplicado
  // (floorIdMap), no al piso del edificio original — si no, el mismo espacio
  // físico queda "propiedad" de dos deptos de dos edificios distintos.
  it('remapea el floorId de parking_spots al copiar las unidades, y descarta las huérfanas', async () => {
    vi.mocked(resolveProjectIdFromBuilding).mockResolvedValue('project-1');

    const sourceBuilding = { id: 'b-src', name: 'Torre A', total_floors: 2, amenities_tour: null, cover_image: null, tour_orientation_degrees: null };
    const createdBuilding = { id: 'b-new', slug: 'torre-a-copia', name: 'Torre A (copia)' };
    const floorParking = { id: 'floor-p1', number: -1, label: 'Subsuelo 1', plan_image: 'ss1.png', unit_dots: [], floor_kind: 'parking', floor_kind_description: null };
    const floorUnits = { id: 'floor-u1', number: 7, label: 'Piso 7', plan_image: 'p7.png', unit_dots: [], floor_kind: 'units', floor_kind_description: null };
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
        { data: { project_type: 'edificio', sale_mode: 'venta' } }, // 1: projects (typeConfig)
        { data: sourceBuilding },                                    // 2: buildings select (fuente)
        { data: [] },                                                 // 3: ensureUniqueSlug (buildings)
        { data: createdBuilding, error: null },                       // 4: buildings insert
        { data: [floorParking, floorUnits], error: null },            // 5: floors select (fuente)
        { data: [newFloorParking, newFloorUnits], error: null },       // 6: floors insert
        { data: [sourceUnit], error: null },                          // 7: units select (fuente)
      ],
    });

    const insertUnitsSpy = vi.fn((_rows: Record<string, unknown>[]) => Promise.resolve({ error: null }));
    let calls = 0;
    const supabase = {
      ...base,
      from: vi.fn((table: string) => {
        calls++;
        if (calls === 8) return { insert: insertUnitsSpy }; // units insert (la que nos interesa)
        return base.from(table);
      }),
    };
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'user-1' } } as never);

    const res = await POST(req('b-src'), params('b-src'));
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual(createdBuilding);

    expect(insertUnitsSpy).toHaveBeenCalledTimes(1);
    const insertedUnits = insertUnitsSpy.mock.calls[0][0] as Array<{ floor_id: string; parking_spots: { floorId: string }[] }>;
    expect(insertedUnits).toHaveLength(1);
    expect(insertedUnits[0].floor_id).toBe('floor-u1-new');
    // La cochera de floor-p1 se remapea a floor-p1-new; la que apuntaba a un
    // piso que no está en el mapa (floor-huerfano) se descarta.
    expect(insertedUnits[0].parking_spots).toEqual([{ floorId: 'floor-p1-new', label: 'C-7', polygon: [{ x: 1, y: 1 }] }]);
  });

  it('proyecto singleBuilding (ej. casa) con edificio propio: 409, no duplica', async () => {
    vi.mocked(resolveProjectIdFromBuilding).mockResolvedValue('project-1');
    const supabase = mockSupabase({ results: [{ data: { project_type: 'casa', sale_mode: 'venta' } }] });
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'user-1' } } as never);

    const res = await POST(req('b-src'), params('b-src'));
    expect(res.status).toBe(409);
  });
});
