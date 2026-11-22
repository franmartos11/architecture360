import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/require-project-access', () => ({
  requireProjectAccess: vi.fn(),
  resolveProjectIdFromAmenity: vi.fn(),
  resolveProjectIdFromBuilding: vi.fn(),
  resolveProjectIdFromFloor: vi.fn(),
}));

import {
  requireProjectAccess,
  resolveProjectIdFromAmenity,
  resolveProjectIdFromBuilding,
  resolveProjectIdFromFloor,
} from '@/lib/supabase/require-project-access';
import { mockSupabase, jsonRequest } from '@/lib/test-helpers/supabase-mock';
import { PATCH, DELETE } from './route';

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe('PATCH /api/admin/amenities/[id]', () => {
  beforeEach(() => {
    vi.mocked(requireProjectAccess).mockReset();
    vi.mocked(resolveProjectIdFromAmenity).mockReset();
    vi.mocked(resolveProjectIdFromBuilding).mockReset();
    vi.mocked(resolveProjectIdFromFloor).mockReset();
  });

  it('amenity inexistente: 404', async () => {
    vi.mocked(resolveProjectIdFromAmenity).mockResolvedValue(null);

    const res = await PATCH(jsonRequest('http://localhost/api/admin/amenities/amenity-1', { name: 'Nueva' }), params('amenity-1'));
    expect(res.status).toBe(404);
  });

  it('buildingId de otro proyecto: 400, no llega a chequear auth', async () => {
    vi.mocked(resolveProjectIdFromAmenity).mockResolvedValue('project-1');
    vi.mocked(resolveProjectIdFromBuilding).mockResolvedValue('project-2');

    const res = await PATCH(
      jsonRequest('http://localhost/api/admin/amenities/amenity-1', { buildingId: 'building-1' }),
      params('amenity-1')
    );
    expect(res.status).toBe(400);
    expect(requireProjectAccess).not.toHaveBeenCalled();
  });

  it('floorId de otro proyecto: 400, no llega a chequear auth', async () => {
    vi.mocked(resolveProjectIdFromAmenity).mockResolvedValue('project-1');
    vi.mocked(resolveProjectIdFromFloor).mockResolvedValue('project-2');

    const res = await PATCH(
      jsonRequest('http://localhost/api/admin/amenities/amenity-1', { floorId: 'floor-1' }),
      params('amenity-1')
    );
    expect(res.status).toBe(400);
    expect(requireProjectAccess).not.toHaveBeenCalled();
  });

  it('sacar del plano: floorId vacío deja piso, pin y polígono en null', async () => {
    vi.mocked(resolveProjectIdFromAmenity).mockResolvedValue('project-1');
    const supabase = mockSupabase({ results: [{ data: { id: 'amenity-1' } }] });
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'user-1' } } as never);

    const res = await PATCH(
      jsonRequest('http://localhost/api/admin/amenities/amenity-1', { floorId: '', pin: null, polygon: [] }),
      params('amenity-1')
    );
    expect(res.status).toBe(200);
    expect(supabase.from.mock.results[0].value.update.mock.calls[0][0]).toEqual({ floor_id: null, pin: null, polygon: null });
  });

  it('sin acceso al proyecto: 401', async () => {
    vi.mocked(resolveProjectIdFromAmenity).mockResolvedValue('project-1');
    vi.mocked(requireProjectAccess).mockResolvedValue(null);

    const res = await PATCH(jsonRequest('http://localhost/api/admin/amenities/amenity-1', { name: 'Nueva' }), params('amenity-1'));
    expect(res.status).toBe(401);
  });

  it('edición válida: actualiza solo los campos presentes y devuelve la fila', async () => {
    vi.mocked(resolveProjectIdFromAmenity).mockResolvedValue('project-1');
    const supabase = mockSupabase({
      results: [{ data: { id: 'amenity-1', name: 'Nueva' } }], // .update(...).eq().select().single()
    });
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'user-1' } } as never);

    const res = await PATCH(jsonRequest('http://localhost/api/admin/amenities/amenity-1', { name: 'Nueva' }), params('amenity-1'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: 'amenity-1', name: 'Nueva' });
  });

  it('error de la base al actualizar: 500 con el mensaje', async () => {
    vi.mocked(resolveProjectIdFromAmenity).mockResolvedValue('project-1');
    const supabase = mockSupabase({ results: [{ data: null, error: { message: 'update failed' } }] });
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'user-1' } } as never);

    const res = await PATCH(jsonRequest('http://localhost/api/admin/amenities/amenity-1', { name: 'Nueva' }), params('amenity-1'));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe('No se pudo completar la operación. Probá de nuevo en un rato.'); // no filtra el mensaje de la base
  });
});

describe('DELETE /api/admin/amenities/[id]', () => {
  beforeEach(() => {
    vi.mocked(requireProjectAccess).mockReset();
    vi.mocked(resolveProjectIdFromAmenity).mockReset();
  });

  it('amenity inexistente: 404', async () => {
    vi.mocked(resolveProjectIdFromAmenity).mockResolvedValue(null);

    const res = await DELETE(jsonRequest('http://localhost/api/admin/amenities/amenity-1'), params('amenity-1'));
    expect(res.status).toBe(404);
  });

  it('sin acceso al proyecto: 401', async () => {
    vi.mocked(resolveProjectIdFromAmenity).mockResolvedValue('project-1');
    vi.mocked(requireProjectAccess).mockResolvedValue(null);

    const res = await DELETE(jsonRequest('http://localhost/api/admin/amenities/amenity-1'), params('amenity-1'));
    expect(res.status).toBe(401);
  });

  it('borrado válido: 200 con success', async () => {
    vi.mocked(resolveProjectIdFromAmenity).mockResolvedValue('project-1');
    const supabase = mockSupabase({ results: [{ error: null }] }); // .delete().eq()
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'user-1' } } as never);

    const res = await DELETE(jsonRequest('http://localhost/api/admin/amenities/amenity-1'), params('amenity-1'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
  });

  it('error de la base al borrar: 500 con el mensaje', async () => {
    vi.mocked(resolveProjectIdFromAmenity).mockResolvedValue('project-1');
    const supabase = mockSupabase({ results: [{ error: { message: 'delete failed' } }] });
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'user-1' } } as never);

    const res = await DELETE(jsonRequest('http://localhost/api/admin/amenities/amenity-1'), params('amenity-1'));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe('No se pudo completar la operación. Probá de nuevo en un rato.'); // no filtra el mensaje de la base
  });
});

describe('PATCH /api/admin/amenities/[id]: validación de forma y topes', () => {
  beforeEach(() => {
    vi.mocked(requireProjectAccess).mockReset();
    vi.mocked(resolveProjectIdFromAmenity).mockReset();
  });

  it.each([
    ['images no es un array', { images: 'https://a.com/x.jpg' }],
    ['specs con un valor que no es texto', { specs: [{ key: 'SUPERFICIE', value: 240 }] }],
    ['pin con coordenadas de texto', { pin: { x: 'a', y: 'b' } }],
    ['polígono con más de 500 puntos', { polygon: Array(501).fill({ x: 1, y: 1 }) }],
  ])('400 con %s, sin tocar la base', async (_n, body) => {
    vi.mocked(resolveProjectIdFromAmenity).mockResolvedValue('project-1');
    const res = await PATCH(jsonRequest('http://localhost/api/admin/amenities/amenity-1', body, { method: 'PATCH' }), params('amenity-1'));
    expect(res.status).toBe(400);
    expect(requireProjectAccess).not.toHaveBeenCalled();
  });
});
