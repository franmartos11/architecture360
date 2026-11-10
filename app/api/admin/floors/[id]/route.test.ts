import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/require-project-access', () => ({
  requireProjectAccess: vi.fn(),
  resolveProjectIdFromFloor: vi.fn(),
}));

import { requireProjectAccess, resolveProjectIdFromFloor } from '@/lib/supabase/require-project-access';
import { mockSupabase, jsonRequest } from '@/lib/test-helpers/supabase-mock';
import { PATCH, DELETE } from './route';

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe('PATCH /api/admin/floors/[id]', () => {
  beforeEach(() => {
    vi.mocked(requireProjectAccess).mockReset();
    vi.mocked(resolveProjectIdFromFloor).mockReset();
  });

  it('piso inexistente: 404', async () => {
    vi.mocked(resolveProjectIdFromFloor).mockResolvedValue(null);
    const res = await PATCH(jsonRequest('http://localhost/api/admin/floors/no-existe', { label: 'x' }), params('no-existe'));
    expect(res.status).toBe(404);
  });

  it('sin acceso al proyecto: 401', async () => {
    vi.mocked(resolveProjectIdFromFloor).mockResolvedValue('project-1');
    vi.mocked(requireProjectAccess).mockResolvedValue(null);

    const res = await PATCH(jsonRequest('http://localhost/api/admin/floors/floor-1', { label: 'x' }), params('floor-1'));
    expect(res.status).toBe(401);
  });

  it('error de la base al actualizar: 500 con el mensaje', async () => {
    vi.mocked(resolveProjectIdFromFloor).mockResolvedValue('project-1');
    const supabase = mockSupabase({ results: [{ data: null, error: { message: 'update failed' } }] });
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'user-1' } } as never);

    const res = await PATCH(jsonRequest('http://localhost/api/admin/floors/floor-1', { label: 'Nuevo' }), params('floor-1'));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe('No se pudo completar la operación. Probá de nuevo en un rato.'); // no filtra el mensaje de la base
  });

  it('actualización válida: solo manda los campos presentes en el body', async () => {
    vi.mocked(resolveProjectIdFromFloor).mockResolvedValue('project-1');
    const supabase = mockSupabase({ results: [{ data: { id: 'floor-1', label: 'Nuevo' }, error: null }] });
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'user-1' } } as never);

    const res = await PATCH(jsonRequest('http://localhost/api/admin/floors/floor-1', { label: 'Nuevo' }), params('floor-1'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: 'floor-1', label: 'Nuevo' });
  });
});

describe('DELETE /api/admin/floors/[id]', () => {
  beforeEach(() => {
    vi.mocked(requireProjectAccess).mockReset();
    vi.mocked(resolveProjectIdFromFloor).mockReset();
  });

  it('piso inexistente: 404', async () => {
    vi.mocked(resolveProjectIdFromFloor).mockResolvedValue(null);
    const res = await DELETE(jsonRequest('http://localhost/api/admin/floors/no-existe'), params('no-existe'));
    expect(res.status).toBe(404);
  });

  it('sin acceso al proyecto: 401', async () => {
    vi.mocked(resolveProjectIdFromFloor).mockResolvedValue('project-1');
    vi.mocked(requireProjectAccess).mockResolvedValue(null);

    const res = await DELETE(jsonRequest('http://localhost/api/admin/floors/floor-1'), params('floor-1'));
    expect(res.status).toBe(401);
  });

  it('error de la base al borrar: 500 con el mensaje', async () => {
    vi.mocked(resolveProjectIdFromFloor).mockResolvedValue('project-1');
    const supabase = mockSupabase({ results: [{ error: { message: 'delete failed' } }] });
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'user-1' } } as never);

    const res = await DELETE(jsonRequest('http://localhost/api/admin/floors/floor-1'), params('floor-1'));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe('No se pudo completar la operación. Probá de nuevo en un rato.'); // no filtra el mensaje de la base
  });

  it('borrado válido: 200 con success true', async () => {
    vi.mocked(resolveProjectIdFromFloor).mockResolvedValue('project-1');
    const supabase = mockSupabase({ results: [{ error: null }] });
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'user-1' } } as never);

    const res = await DELETE(jsonRequest('http://localhost/api/admin/floors/floor-1'), params('floor-1'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
  });
});

describe('PATCH /api/admin/floors/[id]: validación de forma y topes', () => {
  beforeEach(() => {
    vi.mocked(requireProjectAccess).mockReset();
    vi.mocked(resolveProjectIdFromFloor).mockReset();
  });

  it.each([
    ['floorKind inventado', { floorKind: 'sotano' }],
    ['number como texto', { number: '3' }],
    ['planImage con javascript:', { planImage: 'javascript:alert(1)' }],
    ['unitDots con más de 1000 marcadores', { unitDots: Array(1001).fill({ unitId: 'A1', x: 1, y: 1 }) }],
    ['unitDots con un marcador sin unitId', { unitDots: [{ x: 1, y: 1 }] }],
  ])('400 con %s, sin tocar la base', async (_n, body) => {
    vi.mocked(resolveProjectIdFromFloor).mockResolvedValue('project-1');
    const supabase = mockSupabase({ results: [] });
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'user-1' } } as never);

    const res = await PATCH(jsonRequest('http://localhost/api/admin/floors/floor-1', body, { method: 'PATCH' }), params('floor-1'));
    expect(res.status).toBe(400);
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('acepta marcadores con campos extra (color, estilo) como los manda el panel', async () => {
    vi.mocked(resolveProjectIdFromFloor).mockResolvedValue('project-1');
    const supabase = mockSupabase({ results: [{ data: { id: 'floor-1' } }] });
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'user-1' } } as never);
    const dots = [{ unitId: 'A1', x: 10, y: 20, color: '#fff', style: 'dot' }];
    const res = await PATCH(jsonRequest('http://localhost/api/admin/floors/floor-1', { unitDots: dots }, { method: 'PATCH' }), params('floor-1'));
    expect(res.status).toBe(200);
    expect(supabase.from.mock.results[0].value.update.mock.calls[0][0]).toEqual({ unit_dots: dots });
  });
});
