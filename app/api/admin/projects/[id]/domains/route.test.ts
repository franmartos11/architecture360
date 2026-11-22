import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockSupabase } from '@/lib/test-helpers/supabase-mock';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/require-project-access', () => ({ requireProjectAccess: vi.fn() }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }));
vi.mock('@/lib/rate-limit', () => ({ rateLimitOrRespond: vi.fn().mockResolvedValue(null) }));
vi.mock('@/lib/vercel-domains', () => ({
  vercelDomainsConfigured: vi.fn(),
  addDomain: vi.fn(),
  getDomainState: vi.fn(),
}));

import { requireProjectAccess } from '@/lib/supabase/require-project-access';
import { createAdminClient } from '@/lib/supabase/admin';
import { addDomain, getDomainState, vercelDomainsConfigured } from '@/lib/vercel-domains';
import { GET, POST } from './route';

const ctx = { params: Promise.resolve({ id: 'proj-1' }) };
const post = (body: unknown) =>
  POST(new Request('http://x/api', { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }), ctx);
const ROW = { id: 'dom-1', hostname: 'www.torre.com', status: 'pending', vercel_verification: null, created_at: 'now' };

function asOwner(results: { data?: unknown; error?: unknown; count?: number | null }[] = []) {
  const supabase = mockSupabase({ results });
  vi.mocked(requireProjectAccess).mockResolvedValue({ user: { id: 'u1' }, supabase } as never);
  return supabase;
}

beforeEach(() => {
  vi.mocked(requireProjectAccess).mockReset();
  vi.mocked(createAdminClient).mockReset();
  vi.mocked(vercelDomainsConfigured).mockReset().mockReturnValue(true);
  vi.mocked(addDomain).mockReset().mockResolvedValue(undefined);
  vi.mocked(getDomainState).mockReset().mockResolvedValue({ verified: false, verification: [], misconfigured: true });
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('GET /api/admin/projects/[id]/domains', () => {
  it('401 si no es el dueño', async () => {
    vi.mocked(requireProjectAccess).mockResolvedValue(null);
    expect((await GET(new Request('http://x'), ctx)).status).toBe(401);
  });

  it('lista los dominios del proyecto e informa si el alta es automática', async () => {
    asOwner([{ data: [ROW] }]);
    const res = await GET(new Request('http://x'), ctx);
    expect(await res.json()).toEqual({ domains: [ROW], automatic: true });
  });
});

describe('POST /api/admin/projects/[id]/domains', () => {
  it('401 si no es el dueño del proyecto', async () => {
    vi.mocked(requireProjectAccess).mockResolvedValue(null);
    expect((await post({ hostname: 'www.torre.com' })).status).toBe(401);
  });

  it('503 si Vercel no está configurado', async () => {
    asOwner();
    vi.mocked(vercelDomainsConfigured).mockReturnValue(false);
    expect((await post({ hostname: 'www.torre.com' })).status).toBe(503);
  });

  it('400 con un hostname inválido, sin tocar la base', async () => {
    const supabase = asOwner();
    const res = await post({ hostname: 'sin punto' });
    expect(res.status).toBe(400);
    expect(supabase.from).not.toHaveBeenCalled();
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  it('400 si el proyecto ya tiene el máximo de dominios', async () => {
    asOwner([{ count: 5 }]);
    const res = await post({ hostname: 'www.torre.com' });
    expect(res.status).toBe(400);
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  it('409 si el dominio es de otro proyecto, y no llama a Vercel', async () => {
    asOwner([{ count: 0 }]);
    vi.mocked(createAdminClient).mockReturnValue(mockSupabase({ results: [{ error: { code: '23505', message: 'dup' } }] }) as never);
    const res = await post({ hostname: 'www.torre.com' });
    expect(res.status).toBe(409);
    expect(addDomain).not.toHaveBeenCalled();
  });

  it('201: reserva la fila, lo agrega en Vercel y guarda los registros DNS', async () => {
    asOwner([{ count: 0 }]);
    const admin = mockSupabase({ results: [{ data: ROW }, { error: null }] });
    vi.mocked(createAdminClient).mockReturnValue(admin as never);
    vi.mocked(getDomainState).mockResolvedValue({
      verified: false,
      verification: [{ type: 'TXT', domain: '_vercel.torre.com', value: 'vc-domain-verify=x', reason: 'pending_domain_verification' }],
      misconfigured: true,
    });

    const res = await post({ hostname: 'HTTPS://WWW.Torre.com/' });

    expect(res.status).toBe(201);
    expect(addDomain).toHaveBeenCalledWith('www.torre.com');
    const inserted = admin.from.mock.results[0].value.insert.mock.calls[0][0];
    expect(inserted).toEqual({ project_id: 'proj-1', hostname: 'www.torre.com' });
    const body = await res.json();
    expect(body.domain.vercel_verification.records).toHaveLength(1);
    expect(body.domain.status).toBe('pending');
  });

  it('502 y deshace la reserva si Vercel falla', async () => {
    asOwner([{ count: 0 }]);
    const admin = mockSupabase({ results: [{ data: ROW }, { error: null }] });
    vi.mocked(createAdminClient).mockReturnValue(admin as never);
    vi.mocked(addDomain).mockRejectedValue(new Error('vercel down'));

    const res = await post({ hostname: 'www.torre.com' });

    expect(res.status).toBe(502);
    expect(admin.from).toHaveBeenCalledTimes(2);
    expect(admin.from.mock.results[1].value.delete).toHaveBeenCalled();
  });
});
