import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));

import { createClient } from '@/lib/supabase/server';
import { mockSupabase, jsonRequest } from '@/lib/test-helpers/supabase-mock';
import { GET, POST } from './route';

describe('GET /api/events', () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset();
  });

  it('sin eventos próximos: event null', async () => {
    const supabase = mockSupabase({ user: null, results: [{ data: null }] });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ event: null });
  });

  it('con evento próximo y sesión: incluye attendeeCount y attendingByMe', async () => {
    const supabase = mockSupabase({
      user: { id: 'user-1' },
      results: [
        { data: { id: 'event-1', title: 'Bienal', description: null, location: 'Rosario', starts_at: '2026-09-11T18:30:00Z' } },
        { count: 14 }, // event_rsvps count
        { data: { id: 'rsvp-1' } }, // mi rsvp
      ],
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.event).toMatchObject({ id: 'event-1', attendeeCount: 14, attendingByMe: true });
  });
});

describe('POST /api/events', () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset();
  });

  function req(body: unknown) {
    return jsonRequest('http://localhost/api/events', body);
  }

  it('sin sesión: 401', async () => {
    const supabase = mockSupabase({ user: null, results: [] });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await POST(req({ title: 'Evento', startsAt: '2026-12-01T00:00:00Z' }));
    expect(res.status).toBe(401);
  });

  it('sin portfolio/perfil creado: 400', async () => {
    const supabase = mockSupabase({ user: { id: 'user-1' }, results: [{ data: null }] });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await POST(req({ title: 'Evento', startsAt: '2026-12-01T00:00:00Z' }));
    expect(res.status).toBe(400);
  });

  it('body inválido (sin título): 400', async () => {
    const supabase = mockSupabase({ user: { id: 'user-1' }, results: [{ data: { id: 'user-1' } }] });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await POST(req({ startsAt: '2026-12-01T00:00:00Z' }));
    expect(res.status).toBe(400);
  });

  it('feliz: crea el evento', async () => {
    const supabase = mockSupabase({
      user: { id: 'user-1' },
      results: [
        { data: { id: 'user-1' } }, // profile check
        { data: { id: 'event-1', title: 'Bienal', description: null, location: null, starts_at: '2026-12-01T00:00:00Z' } }, // insert
      ],
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await POST(req({ title: 'Bienal', startsAt: '2026-12-01T00:00:00Z' }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toMatchObject({ id: 'event-1', attendeeCount: 0, attendingByMe: false });
  });
});
