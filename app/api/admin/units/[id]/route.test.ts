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
