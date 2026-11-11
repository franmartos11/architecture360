import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }));
vi.mock('@/lib/email', () => ({ sendEmail: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/rate-limit', () => ({ rateLimitOrRespond: vi.fn().mockResolvedValue(null) }));

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendEmail } from '@/lib/email';
import { rateLimitOrRespond } from '@/lib/rate-limit';
import { mockSupabase, jsonRequest } from '@/lib/test-helpers/supabase-mock';
import { POST } from './route';

const VALID_BODY = { name: 'Ana Pérez', email: 'ana@example.com', phone: '+54 351 555 0000' };

function req(body: unknown, headers: Record<string, string> = {}) {
  return jsonRequest('http://localhost/api/leads', body, { headers });
}

describe('POST /api/leads', () => {
  beforeEach(() => {
    vi.mocked(rateLimitOrRespond).mockReset().mockResolvedValue(null);
    vi.mocked(sendEmail).mockReset().mockResolvedValue(undefined);
    vi.mocked(createClient).mockReset();
    vi.mocked(createAdminClient).mockReset();
  });

  it('body inválido: 400 antes de tocar la base', async () => {
    const supabase = mockSupabase({ results: [] });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await POST(req({ name: '', email: 'no-es-email', phone: '' }));
    expect(res.status).toBe(400);
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('lead válido, proyecto con dueño: inserta y notifica por email', async () => {
    const supabase = mockSupabase({
      results: [
        { data: { id: 'project-1', name: 'Torre del Mar', owner_id: 'owner-1' } }, // .from('projects')...maybeSingle()
      ],
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);
    const admin = { ...mockSupabase({ results: [{ error: null }] }), auth: { admin: { getUserById: vi.fn().mockResolvedValue({ data: { user: { email: 'dueño@example.com' } } }) } } };
    vi.mocked(createAdminClient).mockReturnValue(admin as never);

    const res = await POST(req(VALID_BODY, { 'x-forwarded-for': '1.2.3.4' }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: 'dueño@example.com', subject: expect.stringContaining('Torre del Mar') }));
  });

  it.each([
    ['sin casilla: wants_updates false', {}, false],
    ['casilla marcada: wants_updates true', { wantsUpdates: true }, true],
    ['casilla desmarcada: wants_updates false', { wantsUpdates: false }, false],
  ])('opt-in de novedades — %s', async (_n, extra, expected) => {
    vi.mocked(createClient).mockResolvedValue(mockSupabase({ results: [{ data: null }] }) as never);
    const admin = mockSupabase({ results: [{ error: null }] });
    vi.mocked(createAdminClient).mockReturnValue(admin as never);

    const res = await POST(req({ ...VALID_BODY, ...extra }));

    expect(res.status).toBe(200);
    expect(admin.from.mock.results[0].value.insert.mock.calls[0][0].wants_updates).toBe(expected);
  });

  it('rate-limit alcanzado: devuelve el 429 tal cual, sin insertar', async () => {
    const supabase = mockSupabase({ results: [] });
    vi.mocked(createClient).mockResolvedValue(supabase as never);
    const { NextResponse } = await import('next/server');
    const limited = NextResponse.json({ error: 'Demasiados envíos' }, { status: 429 });
    vi.mocked(rateLimitOrRespond).mockResolvedValue(limited);

    const res = await POST(req(VALID_BODY, { 'x-forwarded-for': '1.2.3.4' }));

    expect(res.status).toBe(429);
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('sin IP en la request: no rate-limitea y sigue el flujo normal', async () => {
    const supabase = mockSupabase({ results: [{ data: null }] });
    vi.mocked(createClient).mockResolvedValue(supabase as never);
    vi.mocked(createAdminClient).mockReturnValue(mockSupabase({ results: [{ error: null }] }) as never);

    const res = await POST(req(VALID_BODY));

    expect(res.status).toBe(200);
    expect(rateLimitOrRespond).not.toHaveBeenCalled();
  });

  it('proyecto no encontrado: igual inserta el lead (project_id null), sin intentar notificar', async () => {
    const supabase = mockSupabase({ results: [{ data: null }] });
    vi.mocked(createClient).mockResolvedValue(supabase as never);
    const admin = mockSupabase({ results: [{ error: null }] });
    vi.mocked(createAdminClient).mockReturnValue(admin as never);

    const res = await POST(req(VALID_BODY, { 'x-forwarded-for': '1.2.3.4' }));

    expect(res.status).toBe(200);
    expect(sendEmail).not.toHaveBeenCalled();
    expect(admin.from).toHaveBeenCalledTimes(1); // solo el insert; no se busca al dueño
  });

  it('error de la base al insertar: 500 con mensaje genérico (no filtra el de la base)', async () => {
    const supabase = mockSupabase({ results: [{ data: null }] });
    vi.mocked(createClient).mockResolvedValue(supabase as never);
    vi.mocked(createAdminClient).mockReturnValue(mockSupabase({ results: [{ error: { message: 'insert failed' } }] }) as never);
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await POST(req(VALID_BODY, { 'x-forwarded-for': '1.2.3.4' }));

    expect(res.status).toBe(500);
    const { error } = await res.json();
    expect(error).not.toContain('insert failed');
    expect(error).toMatch(/No pudimos/);
  });

  it('si falla el envío de email, la respuesta sigue siendo success (best-effort)', async () => {
    const supabase = mockSupabase({
      results: [{ data: { id: 'project-1', name: 'Torre del Mar', owner_id: 'owner-1' } }],
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);
    const insertOnly = mockSupabase({ results: [{ error: null }] });
    const admin = { ...insertOnly, auth: { admin: { getUserById: vi.fn().mockRejectedValue(new Error('supabase admin down')) } } };
    vi.mocked(createAdminClient).mockReturnValue(admin as never);

    const res = await POST(req(VALID_BODY, { 'x-forwarded-for': '1.2.3.4' }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
  });
});
