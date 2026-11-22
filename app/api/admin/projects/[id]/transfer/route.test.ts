import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/require-project-access', () => ({ requireProjectAccess: vi.fn() }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }));
vi.mock('@/lib/email', () => ({ sendEmail: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/notify', () => ({ notify: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/rate-limit', () => ({ rateLimitOrRespond: vi.fn().mockResolvedValue(null) }));

import { requireProjectAccess } from '@/lib/supabase/require-project-access';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendEmail } from '@/lib/email';
import { notify } from '@/lib/notify';
import { rateLimitOrRespond } from '@/lib/rate-limit';
import { mockSupabase, jsonRequest } from '@/lib/test-helpers/supabase-mock';
import { GET, POST, DELETE } from './route';

const ctx = { params: Promise.resolve({ id: 'project-1' }) };
const URL = 'http://localhost/api/admin/projects/project-1/transfer';

function access(results: NonNullable<Parameters<typeof mockSupabase>[0]>['results']) {
  const supabase = mockSupabase({ results });
  vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'owner-1' } } as never);
  return supabase;
}

// Orden de .from() en POST: projects, profiles (dueño), profiles (destino), transfers pendientes, insert.
const okLookups = (over: Record<number, unknown> = {}) => [
  over[0] ?? { data: { name: 'Torre del Mar' } },
  over[1] ?? { data: { handle: 'duena' } },
  over[2] ?? { data: { id: 'target-1' } },
  over[3] ?? { data: null },
];

describe('/api/admin/projects/[id]/transfer', () => {
  beforeEach(() => {
    vi.mocked(requireProjectAccess).mockReset();
    vi.mocked(createAdminClient).mockReset();
    vi.mocked(sendEmail).mockReset().mockResolvedValue(undefined);
    vi.mocked(notify).mockReset().mockResolvedValue(undefined);
    vi.mocked(rateLimitOrRespond).mockReset().mockResolvedValue(null);
  });

  it('pide rol dueño', async () => {
    vi.mocked(requireProjectAccess).mockResolvedValue(null);
    await GET(jsonRequest(URL), ctx);
    await POST(jsonRequest(URL, { handle: 'ana' }), ctx);
    await DELETE(new Request(URL, { method: 'DELETE' }), ctx);
    expect(requireProjectAccess).toHaveBeenCalledTimes(3);
    for (const call of vi.mocked(requireProjectAccess).mock.calls) {
      expect(call).toEqual(['project-1', expect.objectContaining({ minRole: 'dueño' })]);
    }
  });

  it('sin acceso: 401', async () => {
    vi.mocked(requireProjectAccess).mockResolvedValue(null);
    const res = await POST(jsonRequest(URL, { handle: 'ana' }), ctx);
    expect(res.status).toBe(401);
  });

  it('body sin handle: 400', async () => {
    const res = await POST(jsonRequest(URL, {}), ctx);
    expect(res.status).toBe(400);
  });

  it('transferir a uno mismo: 400', async () => {
    access(okLookups({ 2: { data: { id: 'owner-1' } } }));
    const res = await POST(jsonRequest(URL, { handle: 'duena' }), ctx);
    expect(res.status).toBe(400);
    expect(notify).not.toHaveBeenCalled();
  });

  it('handle inexistente: 404', async () => {
    access(okLookups({ 2: { data: null } }));
    const res = await POST(jsonRequest(URL, { handle: 'nadie' }), ctx);
    expect(res.status).toBe(404);
  });

  it('ya hay una pendiente: 409', async () => {
    access(okLookups({ 3: { data: { id: 'transfer-0' } } }));
    const res = await POST(jsonRequest(URL, { handle: 'ana' }), ctx);
    expect(res.status).toBe(409);
  });

  it('23505 por carrera: 409', async () => {
    access([...okLookups(), { error: { code: '23505', message: 'duplicate' } }]);
    const res = await POST(jsonRequest(URL, { handle: 'ana' }), ctx);
    expect(res.status).toBe(409);
    expect(notify).not.toHaveBeenCalled();
  });

  it('falla la lectura del perfil destino: 500, no un 404 engañoso', async () => {
    access(okLookups({ 2: { data: null, error: { message: 'boom' } } }));
    const res = await POST(jsonRequest(URL, { handle: 'ana' }), ctx);
    expect(res.status).toBe(500);
  });

  it('falla la lectura de pendientes: 500, no se trata como "ninguna"', async () => {
    access(okLookups({ 3: { data: null, error: { message: 'boom' } } }));
    const res = await POST(jsonRequest(URL, { handle: 'ana' }), ctx);
    expect(res.status).toBe(500);
  });

  it('rate-limit alcanzado: devuelve el 429 sin tocar la base', async () => {
    const supabase = access([]);
    const { NextResponse } = await import('next/server');
    vi.mocked(rateLimitOrRespond).mockResolvedValue(NextResponse.json({ error: 'x' }, { status: 429 }));
    const res = await POST(jsonRequest(URL, { handle: 'ana' }), ctx);
    expect(res.status).toBe(429);
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('crea, notifica ownership_transfer y manda email con el nombre escapado', async () => {
    access([
      ...okLookups({ 0: { data: { name: 'Torre <b>Mar</b>' } } }),
      { data: { id: 'transfer-1', created_at: '2026-11-16T00:00:00Z' } },
    ]);
    const admin = { auth: { admin: { getUserById: vi.fn().mockResolvedValue({ data: { user: { email: 'ana@example.com' } } }) } } };
    vi.mocked(createAdminClient).mockReturnValue(admin as never);

    const res = await POST(jsonRequest(URL, { handle: 'ana' }), ctx);

    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ pending: { id: 'transfer-1', created_at: '2026-11-16T00:00:00Z' } });
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({
      recipientId: 'target-1', actorId: 'owner-1', type: 'ownership_transfer', entityId: 'project-1',
    }));
    const email = vi.mocked(sendEmail).mock.calls[0][0];
    expect(email.to).toBe('ana@example.com');
    expect(email.html).toContain('Torre &lt;b&gt;Mar&lt;/b&gt;');
    expect(email.html).not.toContain('<b>Mar</b>');
  });

  it('si falla el email, igual responde 201', async () => {
    access([...okLookups(), { data: { id: 'transfer-1', created_at: 'x' } }]);
    vi.mocked(createAdminClient).mockImplementation(() => { throw new Error('down'); });
    const res = await POST(jsonRequest(URL, { handle: 'ana' }), ctx);
    expect(res.status).toBe(201);
  });

  it('GET: devuelve la pendiente con el destinatario', async () => {
    access([{ data: { id: 't1', created_at: 'c', to: [{ handle: 'ana', display_name: 'Ana' }] } }]);
    const res = await GET(jsonRequest(URL), ctx);
    expect(await res.json()).toEqual({ pending: { id: 't1', to: { handle: 'ana', display_name: 'Ana' }, created_at: 'c' } });
  });

  it('GET: sin pendiente devuelve null', async () => {
    access([{ data: null }]);
    const res = await GET(jsonRequest(URL), ctx);
    expect(await res.json()).toEqual({ pending: null });
  });

  it('DELETE cancela la pendiente', async () => {
    access([{ data: [{ id: 't1' }] }]);
    const res = await DELETE(new Request(URL, { method: 'DELETE' }), ctx);
    expect(res.status).toBe(200);
  });

  it('DELETE sin pendiente: 404', async () => {
    access([{ data: [] }]);
    const res = await DELETE(new Request(URL, { method: 'DELETE' }), ctx);
    expect(res.status).toBe(404);
  });
});
