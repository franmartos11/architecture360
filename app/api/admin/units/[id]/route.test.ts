import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/require-project-access', () => ({
  requireProjectAccess: vi.fn(),
  resolveProjectIdFromUnit: vi.fn(),
}));

import { requireProjectAccess, resolveProjectIdFromUnit } from '@/lib/supabase/require-project-access';
import { mockSupabase, jsonRequest } from '@/lib/test-helpers/supabase-mock';
import { GET, PATCH, DELETE } from './route';

function get(url: string) {
  return new Request(url);
}

function del(url: string) {
  return new Request(url, { method: 'DELETE' });
}

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe('GET /api/admin/units/[id]', () => {
  beforeEach(() => {
    vi.mocked(requireProjectAccess).mockReset();
    vi.mocked(resolveProjectIdFromUnit).mockReset();
  });

  it('unidad inexistente: 404', async () => {
    vi.mocked(resolveProjectIdFromUnit).mockResolvedValue(null);
    const res = await GET(get('http://localhost/api/admin/units/unit-1'), ctx('unit-1'));
    expect(res.status).toBe(404);
  });

  it('sin acceso al proyecto de la unidad: 401', async () => {
    vi.mocked(resolveProjectIdFromUnit).mockResolvedValue('project-1');
    vi.mocked(requireProjectAccess).mockResolvedValue(null);
    const res = await GET(get('http://localhost/api/admin/units/unit-1'), ctx('unit-1'));
    expect(res.status).toBe(401);
  });

  it('con acceso: devuelve la unidad', async () => {
    vi.mocked(resolveProjectIdFromUnit).mockResolvedValue('project-1');
    const supabase = mockSupabase({ results: [{ data: { id: 'unit-1', code: 'A1' } }] });
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'user-1' } } as never);

    const res = await GET(get('http://localhost/api/admin/units/unit-1'), ctx('unit-1'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: 'unit-1', code: 'A1' });
  });

  it('fila no encontrada tras el acceso (data null): 404', async () => {
    vi.mocked(resolveProjectIdFromUnit).mockResolvedValue('project-1');
    const supabase = mockSupabase({ results: [{ data: null }] });
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'user-1' } } as never);

    const res = await GET(get('http://localhost/api/admin/units/unit-1'), ctx('unit-1'));
    expect(res.status).toBe(404);
  });

  it('error de la base: 500 con el mensaje', async () => {
    vi.mocked(resolveProjectIdFromUnit).mockResolvedValue('project-1');
    const supabase = mockSupabase({ results: [{ error: { message: 'boom' } }] });
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'user-1' } } as never);

    const res = await GET(get('http://localhost/api/admin/units/unit-1'), ctx('unit-1'));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe('boom');
  });
});

describe('PATCH /api/admin/units/[id]', () => {
  beforeEach(() => {
    vi.mocked(requireProjectAccess).mockReset();
    vi.mocked(resolveProjectIdFromUnit).mockReset();
  });

  it('unidad inexistente: 404 antes de leer el body', async () => {
    vi.mocked(resolveProjectIdFromUnit).mockResolvedValue(null);
    const res = await PATCH(jsonRequest('http://localhost/api/admin/units/unit-1', { code: 'A1' }, { method: 'PATCH' }), ctx('unit-1'));
    expect(res.status).toBe(404);
  });

  it('sin acceso al proyecto de la unidad: 401', async () => {
    vi.mocked(resolveProjectIdFromUnit).mockResolvedValue('project-1');
    vi.mocked(requireProjectAccess).mockResolvedValue(null);
    const res = await PATCH(jsonRequest('http://localhost/api/admin/units/unit-1', { code: 'A1' }, { method: 'PATCH' }), ctx('unit-1'));
    expect(res.status).toBe(401);
  });

  it('status inválido: 400', async () => {
    vi.mocked(resolveProjectIdFromUnit).mockResolvedValue('project-1');
    const supabase = mockSupabase({ results: [] });
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'user-1' } } as never);

    const res = await PATCH(
      jsonRequest('http://localhost/api/admin/units/unit-1', { status: 'vendido' }, { method: 'PATCH' }),
      ctx('unit-1')
    );
    expect(res.status).toBe(400);
    expect(supabase.from).not.toHaveBeenCalled();
  });

  // Espejo de NOT_NULL_FIELDS (route.ts) = columnas NOT NULL de units en schema.sql.
  const NOT_NULL_LABELS: Record<string, string> = {
    code: 'Código', type: 'Tipología', bedrooms: 'Dormitorios', bathrooms: 'Baños',
    hasServiceRoom: 'Cuarto de servicio', balconyArea: 'Superficie de balcón', externalArea: 'Superficie exterior',
    currency: 'Moneda', status: 'Estado', galleryImages: 'Galería', garageSpaces: 'Cocheras',
    garageCovered: 'Cocheras cubiertas', garageUncovered: 'Cocheras descubiertas', livingRooms: 'Livings',
    kitchens: 'Cocinas', otherRoomsCount: 'Otros ambientes', floorsCount: 'Cantidad de plantas',
    features: 'Características', parkingSpots: 'Cocheras asignadas',
  };
  const NOT_NULL = [
    'code', 'type', 'balconyArea', 'externalArea', 'bedrooms', 'bathrooms', 'hasServiceRoom',
    'garageSpaces', 'livingRooms', 'kitchens', 'otherRoomsCount', 'floorsCount',
    'currency', 'status', 'galleryImages', 'garageCovered', 'garageUncovered', 'features', 'parkingSpots',
  ];
  it.each(NOT_NULL)('null en una columna NOT NULL (%s): 400 legible, no actualiza', async (campo) => {
    vi.mocked(resolveProjectIdFromUnit).mockResolvedValue('project-1');
    const updateSpy = vi.fn();
    const supabase = { from: vi.fn(() => ({ update: updateSpy })) };
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'user-1' } } as never);

    const res = await PATCH(
      jsonRequest('http://localhost/api/admin/units/unit-1', { [campo]: null }, { method: 'PATCH' }),
      ctx('unit-1')
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe(`${NOT_NULL_LABELS[campo]} no puede quedar vacío.`);
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it('ignora claves del body no presentes en el FIELD_MAP, y sanitiza los campos de texto mapeados', async () => {
    vi.mocked(resolveProjectIdFromUnit).mockResolvedValue('project-1');
    const updateSpy = vi.fn((_payload: Record<string, unknown>) => ({
      eq: () => ({ select: () => ({ single: async () => ({ data: { id: 'unit-1' }, error: null }) }) }),
    }));
    const supabase = { from: vi.fn(() => ({ update: updateSpy })) };
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'user-1' } } as never);

    const res = await PATCH(
      jsonRequest(
        'http://localhost/api/admin/units/unit-1',
        { code: 'A1', status: 'available', notInFieldMap: 'should be dropped', id: 'attacker-controlled' },
        { method: 'PATCH' }
      ),
      ctx('unit-1')
    );

    expect(res.status).toBe(200);
    const updatePayload = updateSpy.mock.calls[0][0] as Record<string, unknown>;
    expect(updatePayload).toMatchObject({ code: 'A1', status: 'available' });
    expect(updatePayload).not.toHaveProperty('notInFieldMap');
    expect(updatePayload).not.toHaveProperty('id');
    expect(updatePayload).toHaveProperty('updated_at');
  });

  it('parkingSpots se mapea a la columna parking_spots tal cual', async () => {
    vi.mocked(resolveProjectIdFromUnit).mockResolvedValue('project-1');
    const updateSpy = vi.fn((_payload: Record<string, unknown>) => ({
      eq: () => ({ select: () => ({ single: async () => ({ data: { id: 'unit-1' }, error: null }) }) }),
    }));
    const supabase = { from: vi.fn(() => ({ update: updateSpy })) };
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'user-1' } } as never);

    const spots = [
      { floorId: 'floor-ss1', label: 'C-12', polygon: [{ x: 10, y: 20 }, { x: 30, y: 20 }, { x: 30, y: 40 }] },
    ];
    const res = await PATCH(
      jsonRequest('http://localhost/api/admin/units/unit-1', { parkingSpots: spots }, { method: 'PATCH' }),
      ctx('unit-1')
    );

    expect(res.status).toBe(200);
    expect(updateSpy.mock.calls[0][0].parking_spots).toEqual(spots);
  });

  it('vaciar las cocheras: manda [] (no se confunde con "no mandar nada")', async () => {
    vi.mocked(resolveProjectIdFromUnit).mockResolvedValue('project-1');
    const updateSpy = vi.fn((_payload: Record<string, unknown>) => ({
      eq: () => ({ select: () => ({ single: async () => ({ data: { id: 'unit-1' }, error: null }) }) }),
    }));
    const supabase = { from: vi.fn(() => ({ update: updateSpy })) };
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'user-1' } } as never);

    await PATCH(
      jsonRequest('http://localhost/api/admin/units/unit-1', { parkingSpots: [] }, { method: 'PATCH' }),
      ctx('unit-1')
    );
    expect(updateSpy.mock.calls[0][0].parking_spots).toEqual([]);
  });

  it('código duplicado en el piso (23505): 409 con mensaje claro, no 500', async () => {
    vi.mocked(resolveProjectIdFromUnit).mockResolvedValue('project-1');
    const supabase = mockSupabase({
      results: [{ data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint' } }],
    });
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'user-1' } } as never);

    const res = await PATCH(
      jsonRequest('http://localhost/api/admin/units/unit-1', { code: 'A1' }, { method: 'PATCH' }),
      ctx('unit-1')
    );
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('Ya existe una unidad con el código "A1" en este piso.');
  });

  it('error de la base al actualizar: 500 con el mensaje', async () => {
    vi.mocked(resolveProjectIdFromUnit).mockResolvedValue('project-1');
    const supabase = mockSupabase({ results: [{ error: { message: 'boom' } }] });
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'user-1' } } as never);

    const res = await PATCH(
      jsonRequest('http://localhost/api/admin/units/unit-1', { code: 'A1' }, { method: 'PATCH' }),
      ctx('unit-1')
    );
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe('boom');
  });
});

describe('DELETE /api/admin/units/[id]', () => {
  beforeEach(() => {
    vi.mocked(requireProjectAccess).mockReset();
    vi.mocked(resolveProjectIdFromUnit).mockReset();
  });

  it('unidad inexistente: 404', async () => {
    vi.mocked(resolveProjectIdFromUnit).mockResolvedValue(null);
    const res = await DELETE(del('http://localhost/api/admin/units/unit-1'), ctx('unit-1'));
    expect(res.status).toBe(404);
  });

  it('sin acceso al proyecto de la unidad: 401', async () => {
    vi.mocked(resolveProjectIdFromUnit).mockResolvedValue('project-1');
    vi.mocked(requireProjectAccess).mockResolvedValue(null);
    const res = await DELETE(del('http://localhost/api/admin/units/unit-1'), ctx('unit-1'));
    expect(res.status).toBe(401);
  });

  it('con acceso: borra y devuelve success', async () => {
    vi.mocked(resolveProjectIdFromUnit).mockResolvedValue('project-1');
    const supabase = mockSupabase({ results: [{ error: null }] });
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'user-1' } } as never);

    const res = await DELETE(del('http://localhost/api/admin/units/unit-1'), ctx('unit-1'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
  });

  it('error de la base al borrar: 500 con el mensaje', async () => {
    vi.mocked(resolveProjectIdFromUnit).mockResolvedValue('project-1');
    const supabase = mockSupabase({ results: [{ error: { message: 'boom' } }] });
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'user-1' } } as never);

    const res = await DELETE(del('http://localhost/api/admin/units/unit-1'), ctx('unit-1'));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe('boom');
  });
});
