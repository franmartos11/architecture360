import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }));

import { createAdminClient } from '@/lib/supabase/admin';
import { notify } from './notify';

function mockAdmin(insertResult: { error: unknown } = { error: null }) {
  const insert = vi.fn().mockResolvedValue(insertResult);
  const from = vi.fn(() => ({ insert }));
  vi.mocked(createAdminClient).mockReturnValue({ from } as never);
  return { from, insert };
}

beforeEach(() => {
  vi.mocked(createAdminClient).mockReset();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('notify', () => {
  it('nunca notifica a uno mismo — ni siquiera intenta el insert', async () => {
    await notify({ recipientId: 'user-1', actorId: 'user-1', type: 'like' });
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  it('inserta la notificación con los campos correctos (con service-role)', async () => {
    const admin = mockAdmin();
    await notify({ recipientId: 'user-1', actorId: 'user-2', type: 'follow', entityId: 'post-1' });
    expect(admin.from).toHaveBeenCalledWith('notifications');
    expect(admin.insert).toHaveBeenCalledWith({
      recipient_id: 'user-1',
      actor_id: 'user-2',
      type: 'follow',
      entity_id: 'post-1',
    });
  });

  it('entityId omitido se guarda como null, no undefined', async () => {
    const admin = mockAdmin();
    await notify({ recipientId: 'user-1', actorId: 'user-2', type: 'comment' });
    expect(admin.insert).toHaveBeenCalledWith(expect.objectContaining({ entity_id: null }));
  });

  it('un insert rechazado (constraint/FK) no tira — best-effort', async () => {
    mockAdmin({ error: new Error('constraint violado') });
    await expect(notify({ recipientId: 'user-1', actorId: 'user-2', type: 'mention' })).resolves.toBeUndefined();
  });

  it('una excepción al insertar tampoco tira — best-effort', async () => {
    const insert = vi.fn().mockRejectedValue(new Error('network down'));
    vi.mocked(createAdminClient).mockReturnValue({ from: vi.fn(() => ({ insert })) } as never);
    await expect(notify({ recipientId: 'user-1', actorId: 'user-2', type: 'message' })).resolves.toBeUndefined();
  });

  it('si no se puede crear el cliente admin tampoco tira', async () => {
    vi.mocked(createAdminClient).mockImplementation(() => { throw new Error('falta la service key'); });
    await expect(notify({ recipientId: 'user-1', actorId: 'user-2', type: 'like' })).resolves.toBeUndefined();
  });
});
