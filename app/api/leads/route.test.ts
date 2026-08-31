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
        { error: null }, // .from('leads').insert(...)
      ],
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);
    const admin = { auth: { admin: { getUserById: vi.fn().mockResolvedValue({ data: { user: { email: 'dueño@example.com' } } }) } } };
    vi.mocked(createAdminClient).mockReturnValue(admin as never);

    const res = await POST(req(VALID_BODY, { 'x-forwarded-for': '1.2.3.4' }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: 'dueño@example.com', subject: expect.stringContaining('Torre del Mar') }));
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
    const supabase = mockSupabase({ results: [{ data: null }, { error: null }] });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await POST(req(VALID_BODY));

    expect(res.status).toBe(200);
    expect(rateLimitOrRespond).not.toHaveBeenCalled();
  });

  it('proyecto no encontrado: igual inserta el lead (project_id null), sin intentar notificar', async () => {
    const supabase = mockSupabase({ results: [{ data: null }, { error: null }] });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await POST(req(VALID_BODY, { 'x-forwarded-for': '1.2.3.4' }));

    expect(res.status).toBe(200);
    expect(sendEmail).not.toHaveBeenCalled();
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  it('error de la base al insertar: 500 con el mensaje', async () => {
    const supabase = mockSupabase({
      results: [{ data: null }, { error: { message: 'insert failed' } }],
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await POST(req(VALID_BODY, { 'x-forwarded-for': '1.2.3.4' }));

    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe('insert failed');
  });

  it('si falla el envío de email, la respuesta sigue siendo success (best-effort)', async () => {
    const supabase = mockSupabase({
      results: [{ data: { id: 'project-1', name: 'Torre del Mar', owner_id: 'owner-1' } }, { error: null }],
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);
    vi.mocked(createAdminClient).mockImplementation(() => {
      throw new Error('supabase admin down');
    });

    const res = await POST(req(VALID_BODY, { 'x-forwarded-for': '1.2.3.4' }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
  });
});
