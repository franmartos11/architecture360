import { describe, it, expect, vi } from 'vitest';
import { notify } from './notify';

function mockSupabase(insertResult: { error: unknown } = { error: null }) {
  const insert = vi.fn().mockResolvedValue(insertResult);
  const from = vi.fn(() => ({ insert }));
  return { from, insert } as unknown as { from: typeof from; insert: typeof insert };
}

describe('notify', () => {
  it('nunca notifica a uno mismo — ni siquiera intenta el insert', async () => {
    const supabase = mockSupabase();
    await notify(supabase as never, { recipientId: 'user-1', actorId: 'user-1', type: 'like' });
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('inserta la notificación con los campos correctos', async () => {
    const supabase = mockSupabase();
    await notify(supabase as never, { recipientId: 'user-1', actorId: 'user-2', type: 'follow', entityId: 'post-1' });
    expect(supabase.from).toHaveBeenCalledWith('notifications');
    expect(supabase.insert).toHaveBeenCalledWith({
      recipient_id: 'user-1',
      actor_id: 'user-2',
      type: 'follow',
      entity_id: 'post-1',
    });
  });

  it('entityId omitido se guarda como null, no undefined', async () => {
    const supabase = mockSupabase();
    await notify(supabase as never, { recipientId: 'user-1', actorId: 'user-2', type: 'comment' });
    expect(supabase.insert).toHaveBeenCalledWith(expect.objectContaining({ entity_id: null }));
  });

  it('un insert rechazado (RLS/constraint) no tira — best-effort', async () => {
    const supabase = mockSupabase({ error: new Error('constraint violado') });
    await expect(
      notify(supabase as never, { recipientId: 'user-1', actorId: 'user-2', type: 'mention' })
    ).resolves.toBeUndefined();
  });

  it('una excepción al insertar tampoco tira — best-effort', async () => {
    const insert = vi.fn().mockRejectedValue(new Error('network down'));
    const supabase = { from: vi.fn(() => ({ insert })) };
    await expect(
      notify(supabase as never, { recipientId: 'user-1', actorId: 'user-2', type: 'message' })
    ).resolves.toBeUndefined();
  });
});
