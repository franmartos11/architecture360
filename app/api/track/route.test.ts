import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }));
vi.mock('@/lib/rate-limit', () => ({ rateLimitOrRespond: vi.fn().mockResolvedValue(null) }));

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { rateLimitOrRespond } from '@/lib/rate-limit';
import { mockSupabase, jsonRequest } from '@/lib/test-helpers/supabase-mock';
import { POST } from './route';

const CHROME = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1';

const EVENT_ID = '11111111-1111-4111-8111-111111111111';
const VISITOR = '22222222-2222-4222-8222-222222222222';
const SESSION = '33333333-3333-4333-8333-333333333333';
const UNIT = '44444444-4444-4444-8444-444444444444';

const PAGE = { id: EVENT_ID, projectSlug: 'torre', visitorId: VISITOR, sessionId: SESSION, type: 'page', path: '/' };

function req(body: unknown, ua = CHROME, ip = '1.2.3.4') {
  return jsonRequest('http://localhost/api/track', body, { headers: { 'user-agent': ua, 'x-forwarded-for': ip } });
}

const proyecto = (data: unknown = { id: 'project-1' }) => mockSupabase({ results: [{ data }] });

describe('POST /api/track', () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset();
    vi.mocked(createAdminClient).mockReset();
    vi.mocked(rateLimitOrRespond).mockReset().mockResolvedValue(null);
  });

  it('payload inválido: 400 sin tocar la base', async () => {
    const res = await POST(req({ ...PAGE, type: 'otro' }));
    expect(res.status).toBe(400);
    expect(createClient).not.toHaveBeenCalled();
  });

  it('evento page válido: 204 e insert con device, ref en minúsculas y sin IP', async () => {
    vi.mocked(createClient).mockResolvedValue(proyecto() as never);
    const admin = mockSupabase({ results: [{ error: null }] });
    vi.mocked(createAdminClient).mockReturnValue(admin as never);

    const res = await POST(req({ ...PAGE, ref: 'Pérez_Props', referrerHost: 'google.com' }, IPHONE));

    expect(res.status).toBe(204);
    const row = admin.from.mock.results[0].value.insert.mock.calls[0][0];
    expect(row).toMatchObject({
      id: EVENT_ID, project_id: 'project-1', visitor_id: VISITOR, session_id: SESSION,
      type: 'page', path: '/', ref: 'perez-props', referrer_host: 'google.com', device: 'mobile', unit_id: null,
    });
    expect(JSON.stringify(row)).not.toContain('1.2.3.4');
  });

  it('user agent de bot: 204 sin insertar', async () => {
    const res = await POST(req(PAGE, 'Mozilla/5.0 (compatible; Googlebot/2.1)'));
    expect(res.status).toBe(204);
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  it('proyecto inexistente: 204 sin insertar', async () => {
    vi.mocked(createClient).mockResolvedValue(proyecto(null) as never);
    const res = await POST(req(PAGE));
    expect(res.status).toBe(204);
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  it('rate limit alcanzado: devuelve su respuesta sin insertar', async () => {
    const { NextResponse } = await import('next/server');
    vi.mocked(rateLimitOrRespond).mockResolvedValue(NextResponse.json({}, { status: 429 }));
    const res = await POST(req(PAGE));
    expect(res.status).toBe(429);
    expect(rateLimitOrRespond).toHaveBeenCalledWith(expect.objectContaining({ key: 'track:ip:1.2.3.4', windowSeconds: 600, max: 300 }), expect.any(String));
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  it('unitId que no es del proyecto: inserta con unit_id null', async () => {
    vi.mocked(createClient).mockResolvedValue(proyecto() as never);
    const admin = mockSupabase({ results: [{ data: null }, { error: null }] });
    vi.mocked(createAdminClient).mockReturnValue(admin as never);

    const res = await POST(req({ ...PAGE, type: 'unit', unitId: UNIT }));

    expect(res.status).toBe(204);
    const i = admin.from.mock.calls.findIndex(c => c[0] === 'site_events');
    expect(admin.from.mock.results[i].value.insert.mock.calls[0][0].unit_id).toBeNull();
  });

  it('unitId del proyecto: inserta con unit_id', async () => {
    vi.mocked(createClient).mockResolvedValue(proyecto() as never);
    const admin = mockSupabase({ results: [{ data: { id: UNIT } }, { error: null }] });
    vi.mocked(createAdminClient).mockReturnValue(admin as never);

    await POST(req({ ...PAGE, type: 'unit', unitId: UNIT }));

    const i = admin.from.mock.calls.findIndex(c => c[0] === 'site_events');
    expect(admin.from.mock.results[i].value.insert.mock.calls[0][0].unit_id).toBe(UNIT);
  });

  it('durationSeconds: solo update con tope 1800, filtrado por id, proyecto, tipo unit y duración vacía', async () => {
    vi.mocked(createClient).mockResolvedValue(proyecto() as never);
    const admin = mockSupabase({ results: [{ error: null }] });
    vi.mocked(createAdminClient).mockReturnValue(admin as never);

    const res = await POST(req({ ...PAGE, type: 'unit', durationSeconds: 5000 }));

    expect(res.status).toBe(204);
    expect(admin.from).toHaveBeenCalledTimes(1);
    const q = admin.from.mock.results[0].value;
    expect(q.insert).not.toHaveBeenCalled();
    expect(q.update).toHaveBeenCalledWith({ duration_seconds: 1800 });
    expect(q.eq).toHaveBeenCalledWith('id', EVENT_ID);
    expect(q.eq).toHaveBeenCalledWith('project_id', 'project-1');
    expect(q.eq).toHaveBeenCalledWith('type', 'unit');
    expect(q.is).toHaveBeenCalledWith('duration_seconds', null);
  });

  it('error de la base al insertar: igual 204 (el sitio nunca se entera)', async () => {
    vi.mocked(createClient).mockResolvedValue(proyecto() as never);
    vi.mocked(createAdminClient).mockReturnValue(mockSupabase({ results: [{ error: { message: 'relation does not exist' } }] }) as never);
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await POST(req(PAGE));
    expect(res.status).toBe(204);
  });
});
