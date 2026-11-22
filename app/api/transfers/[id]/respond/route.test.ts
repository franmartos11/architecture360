import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));
vi.mock('@/lib/notify', () => ({ notify: vi.fn().mockResolvedValue(undefined) }));

import { createClient } from '@/lib/supabase/server';
import { notify } from '@/lib/notify';
import { mockSupabase, jsonRequest } from '@/lib/test-helpers/supabase-mock';
import { PATCH } from './route';

const ctx = { params: Promise.resolve({ id: 'transfer-1' }) };
const req = (body: unknown) => jsonRequest('http://localhost/api/transfers/transfer-1/respond', body, { method: 'PATCH' });

describe('PATCH /api/transfers/[id]/respond', () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset();
    vi.mocked(notify).mockReset().mockResolvedValue(undefined);
  });

  it('estado inválido: 400', async () => {
    const res = await PATCH(req({ status: 'pending' }), ctx);
    expect(res.status).toBe(400);
  });

  it('sin sesión: 401', async () => {
    vi.mocked(createClient).mockResolvedValue(mockSupabase({ user: null }) as never);
    const res = await PATCH(req({ status: 'accepted' }), ctx);
    expect(res.status).toBe(401);
  });

  it('aceptar llama la RPC con p_transfer_id y devuelve projectId', async () => {
    const supabase = mockSupabase({
      user: { id: 'target-1' },
      results: [{ data: { from_user: 'owner-1' } }],
      rpc: [{ data: 'project-9', error: null }],
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await PATCH(req({ status: 'accepted' }), ctx);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ projectId: 'project-9' });
    expect(supabase.rpc).toHaveBeenCalledWith('accept_ownership_transfer', { p_transfer_id: 'transfer-1' });
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({
      recipientId: 'owner-1', actorId: 'target-1', type: 'ownership_transfer_accepted', entityId: 'project-9',
    }));
  });

  it('aceptar algo que no es propio: 404, sin RPC', async () => {
    const supabase = mockSupabase({ user: { id: 'target-1' }, results: [{ data: null }] });
    vi.mocked(createClient).mockResolvedValue(supabase as never);
    const res = await PATCH(req({ status: 'accepted' }), ctx);
    expect(res.status).toBe(404);
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it('error de la RPC: 409 con el mensaje', async () => {
    const supabase = mockSupabase({
      user: { id: 'target-1' },
      results: [{ data: { from_user: 'owner-1' } }],
      rpc: [{ data: null, error: { code: '55000', message: 'La transferencia ya no está pendiente' } }],
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await PATCH(req({ status: 'accepted' }), ctx);

    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('La transferencia ya no está pendiente');
    expect(notify).not.toHaveBeenCalled();
  });

  it('error de la RPC sin código propio: 500 genérico, sin el mensaje de la base', async () => {
    const supabase = mockSupabase({
      user: { id: 'target-1' },
      results: [{ data: { from_user: 'owner-1' } }],
      rpc: [{ data: null, error: { code: '23503', message: 'insert or update on table "projects" violates foreign key constraint' } }],
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await PATCH(req({ status: 'accepted' }), ctx);

    expect(res.status).toBe(500);
    expect((await res.json()).error).not.toContain('projects');
    expect(notify).not.toHaveBeenCalled();
  });

  it('rechazar actualiza solo si es to_user', async () => {
    const supabase = mockSupabase({ user: { id: 'target-1' }, results: [{ data: [{ id: 'transfer-1' }] }] });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await PATCH(req({ status: 'declined' }), ctx);

    expect(res.status).toBe(200);
    const builder = supabase.from.mock.results[0].value;
    expect(builder.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'declined' }));
    expect(builder.eq).toHaveBeenCalledWith('to_user', 'target-1');
    expect(builder.eq).toHaveBeenCalledWith('id', 'transfer-1');
  });

  it('rechazar algo que no es propio: 404', async () => {
    const supabase = mockSupabase({ user: { id: 'target-1' }, results: [{ data: [] }] });
    vi.mocked(createClient).mockResolvedValue(supabase as never);
    const res = await PATCH(req({ status: 'declined' }), ctx);
    expect(res.status).toBe(404);
  });
});
