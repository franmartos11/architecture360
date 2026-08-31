import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));

import { createClient } from '@/lib/supabase/server';
import { mockSupabase } from '@/lib/test-helpers/supabase-mock';
import { GET } from './route';

function makeNotifications(n: number) {
  return Array.from({ length: n }, (_, i) => ({ id: `notif-${i}`, type: 'like' }));
}

describe('GET /api/notifications', () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset();
  });

  it('sin sesión: degrada a lista vacía en vez de 401, sin tocar la base', async () => {
    const supabase = mockSupabase({ user: null, results: [] });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await GET(new Request('http://localhost/api/notifications'));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ notifications: [], hasMore: false, unreadCount: 0 });
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('error de la base (ej. falta la migración de la tabla): degrada a lista vacía en vez de 500', async () => {
    const supabase = mockSupabase({
      user: { id: 'user-1' },
      results: [{ data: null, error: { message: 'relation "notifications" does not exist' } }],
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await GET(new Request('http://localhost/api/notifications'));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ notifications: [], hasMore: false, unreadCount: 0 });
    expect(supabase.from).toHaveBeenCalledTimes(1); // no llega a pedir el unreadCount
  });

  it('camino feliz: devuelve notificaciones y el conteo de no leídas', async () => {
    const supabase = mockSupabase({
      user: { id: 'user-1' },
      results: [
        { data: makeNotifications(5) },
        { count: 2 }, // conteo separado de no leídas
      ],
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await GET(new Request('http://localhost/api/notifications'));

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.notifications).toHaveLength(5);
    expect(json.hasMore).toBe(false);
    expect(json.unreadCount).toBe(2);
  });

  it('una fila más que PAGE_SIZE (21): hasMore true, recortado a 20', async () => {
    const supabase = mockSupabase({
      user: { id: 'user-1' },
      results: [
        { data: makeNotifications(21) },
        { count: 0 },
      ],
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await GET(new Request('http://localhost/api/notifications'));

    const json = await res.json();
    expect(json.hasMore).toBe(true);
    expect(json.notifications).toHaveLength(20);
  });

  it('exactamente PAGE_SIZE (20): hasMore false', async () => {
    const supabase = mockSupabase({
      user: { id: 'user-1' },
      results: [
        { data: makeNotifications(20) },
        { count: 0 },
      ],
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await GET(new Request('http://localhost/api/notifications'));

    const json = await res.json();
    expect(json.hasMore).toBe(false);
    expect(json.notifications).toHaveLength(20);
  });

  it('con cursor ?before=: sigue funcionando normalmente', async () => {
    const supabase = mockSupabase({
      user: { id: 'user-1' },
      results: [
        { data: makeNotifications(3) },
        { count: 1 },
      ],
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await GET(new Request('http://localhost/api/notifications?before=2026-01-01T00:00:00.000Z'));

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.notifications).toHaveLength(3);
    expect(json.unreadCount).toBe(1);
  });
});
