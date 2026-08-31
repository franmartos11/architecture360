import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/require-project-access', () => ({
  requireProjectAccess: vi.fn(),
  resolveProjectIdFromLead: vi.fn(),
}));

import { requireProjectAccess, resolveProjectIdFromLead } from '@/lib/supabase/require-project-access';
import { mockSupabase, jsonRequest } from '@/lib/test-helpers/supabase-mock';
import { PATCH } from './route';

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe('PATCH /api/admin/leads/[id]', () => {
  beforeEach(() => {
    vi.mocked(requireProjectAccess).mockReset();
    vi.mocked(resolveProjectIdFromLead).mockReset();
  });

  it('lead inexistente: 404, sin chequear acceso', async () => {
    vi.mocked(resolveProjectIdFromLead).mockResolvedValue(null);

    const res = await PATCH(jsonRequest('http://localhost/api/admin/leads/lead-1', { status: 'contactado' }), params('lead-1'));
    expect(res.status).toBe(404);
    expect(requireProjectAccess).not.toHaveBeenCalled();
  });

  it('sin acceso al proyecto dueño del lead: 401', async () => {
    vi.mocked(resolveProjectIdFromLead).mockResolvedValue('project-1');
    vi.mocked(requireProjectAccess).mockResolvedValue(null);

    const res = await PATCH(jsonRequest('http://localhost/api/admin/leads/lead-1', { status: 'contactado' }), params('lead-1'));
    expect(res.status).toBe(401);
  });

  it('status fuera del enum: 400 antes de tocar la base', async () => {
    vi.mocked(resolveProjectIdFromLead).mockResolvedValue('project-1');
    const supabase = mockSupabase({ results: [] });
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'user-1' } } as never);

    const res = await PATCH(jsonRequest('http://localhost/api/admin/leads/lead-1', { status: 'ganado' }), params('lead-1'));
    expect(res.status).toBe(400);
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('actualización válida: 200 con la fila actualizada', async () => {
    vi.mocked(resolveProjectIdFromLead).mockResolvedValue('project-1');
    const supabase = mockSupabase({ results: [{ data: { id: 'lead-1', status: 'contactado' } }] });
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'user-1' } } as never);

    const res = await PATCH(jsonRequest('http://localhost/api/admin/leads/lead-1', { status: 'contactado' }), params('lead-1'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: 'lead-1', status: 'contactado' });
  });

  it('body sin status: no cambia nada pero igual actualiza (updates vacío)', async () => {
    vi.mocked(resolveProjectIdFromLead).mockResolvedValue('project-1');
    const supabase = mockSupabase({ results: [{ data: { id: 'lead-1', status: 'nuevo' } }] });
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'user-1' } } as never);

    const res = await PATCH(jsonRequest('http://localhost/api/admin/leads/lead-1', {}), params('lead-1'));
    expect(res.status).toBe(200);
  });

  it('error de la base al actualizar: 500 con el mensaje', async () => {
    vi.mocked(resolveProjectIdFromLead).mockResolvedValue('project-1');
    const supabase = mockSupabase({ results: [{ error: { message: 'update failed' } }] });
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'user-1' } } as never);

    const res = await PATCH(jsonRequest('http://localhost/api/admin/leads/lead-1', { status: 'contactado' }), params('lead-1'));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe('update failed');
  });
});
