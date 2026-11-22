import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockSupabase } from '@/lib/test-helpers/supabase-mock';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/require-project-access', () => ({ requireProjectAccess: vi.fn() }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }));
vi.mock('@/lib/rate-limit', () => ({ rateLimitOrRespond: vi.fn().mockResolvedValue(null) }));
vi.mock('@/lib/vercel-domains', () => ({
  vercelDomainsConfigured: vi.fn(),
  getDomainState: vi.fn(),
  requestVerification: vi.fn(),
  removeDomain: vi.fn(),
}));

import { requireProjectAccess } from '@/lib/supabase/require-project-access';
import { createAdminClient } from '@/lib/supabase/admin';
import { getDomainState, removeDomain, requestVerification, vercelDomainsConfigured } from '@/lib/vercel-domains';
import { POST, DELETE } from './route';

const DOMAIN_ID = '8c9a3c1e-0b1f-4a52-9d8e-2f6f5b7a1c11';
const ctx = { params: Promise.resolve({ id: 'proj-1', domainId: DOMAIN_ID }) };
const req = (method: string) => new Request('http://x', { method });
const ROW = { id: DOMAIN_ID, hostname: 'www.torre.com', status: 'pending' };

function asOwner(domain: unknown = ROW) {
  const supabase = mockSupabase({ results: [{ data: domain }] });
  vi.mocked(requireProjectAccess).mockResolvedValue({ user: { id: 'u1' }, supabase } as never);
  return supabase;
}
const state = (verified: boolean, misconfigured: boolean) => ({ verified, verification: [], misconfigured });

beforeEach(() => {
  vi.mocked(requireProjectAccess).mockReset();
  vi.mocked(createAdminClient).mockReset();
  vi.mocked(vercelDomainsConfigured).mockReset().mockReturnValue(true);
  vi.mocked(getDomainState).mockReset();
  vi.mocked(requestVerification).mockReset().mockResolvedValue(undefined);
  vi.mocked(removeDomain).mockReset().mockResolvedValue(undefined);
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('POST .../domains/[domainId] (verificar)', () => {
  it('401 si no es el dueño', async () => {
    vi.mocked(requireProjectAccess).mockResolvedValue(null);
    expect((await POST(req('POST'), ctx)).status).toBe(401);
  });

  it('404 si el dominio no es de este proyecto', async () => {
    asOwner(null);
    expect((await POST(req('POST'), ctx)).status).toBe(404);
    expect(getDomainState).not.toHaveBeenCalled();
  });

  it('404 con un id que no es uuid, sin consultar la base', async () => {
    const supabase = asOwner();
    const res = await POST(req('POST'), { params: Promise.resolve({ id: 'proj-1', domainId: 'x' }) });
    expect(res.status).toBe(404);
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('pasa a active cuando Vercel verificó y el DNS ya apunta bien', async () => {
    asOwner();
    const admin = mockSupabase({ results: [{ error: null }] });
    vi.mocked(createAdminClient).mockReturnValue(admin as never);
    vi.mocked(getDomainState).mockResolvedValue(state(true, false));

    const res = await POST(req('POST'), ctx);

    expect((await res.json()).status).toBe('active');
    expect(admin.from.mock.results[0].value.update.mock.calls[0][0].status).toBe('active');
  });

  it('verified si el dominio es suyo pero el DNS todavía no apunta a Vercel', async () => {
    asOwner();
    vi.mocked(createAdminClient).mockReturnValue(mockSupabase({ results: [{ error: null }] }) as never);
    vi.mocked(getDomainState).mockResolvedValue(state(true, true));
    expect((await (await POST(req('POST'), ctx)).json()).status).toBe('verified');
  });

  it('pending si no verificó: reintenta la verificación una vez y vuelve a preguntar', async () => {
    asOwner();
    vi.mocked(createAdminClient).mockReturnValue(mockSupabase({ results: [{ error: null }] }) as never);
    vi.mocked(getDomainState).mockResolvedValue(state(false, true));

    const res = await POST(req('POST'), ctx);

    expect((await res.json()).status).toBe('pending');
    expect(requestVerification).toHaveBeenCalledWith('www.torre.com');
    expect(getDomainState).toHaveBeenCalledTimes(2);
  });

  it('502 si Vercel falla, y no toca la base', async () => {
    asOwner();
    vi.mocked(getDomainState).mockRejectedValue(new Error('vercel down'));
    const res = await POST(req('POST'), ctx);
    expect(res.status).toBe(502);
    expect(createAdminClient).not.toHaveBeenCalled();
  });
});

describe('DELETE .../domains/[domainId]', () => {
  it('lo quita de Vercel y después de la base', async () => {
    asOwner();
    const admin = mockSupabase({ results: [{ error: null }] });
    vi.mocked(createAdminClient).mockReturnValue(admin as never);

    const res = await DELETE(req('DELETE'), ctx);

    expect(res.status).toBe(200);
    expect(removeDomain).toHaveBeenCalledWith('www.torre.com');
    expect(admin.from.mock.results[0].value.delete).toHaveBeenCalled();
  });

  it('si Vercel falla, NO borra la fila (queda para reintentar)', async () => {
    asOwner();
    vi.mocked(removeDomain).mockRejectedValue(new Error('vercel down'));
    const res = await DELETE(req('DELETE'), ctx);
    expect(res.status).toBe(502);
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  it('404 si el dominio es de otro proyecto', async () => {
    asOwner(null);
    expect((await DELETE(req('DELETE'), ctx)).status).toBe(404);
    expect(removeDomain).not.toHaveBeenCalled();
  });
});
