import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockSupabase } from '@/lib/test-helpers/supabase-mock';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/require-project-access', () => ({ requireProjectAccess: vi.fn() }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }));
vi.mock('@/lib/rate-limit', () => ({ rateLimitOrRespond: vi.fn().mockResolvedValue(null) }));
vi.mock('@/lib/vercel-domains', async () => {
  const actual = await vi.importActual<typeof import('@/lib/vercel-domains')>('@/lib/vercel-domains');
  return {
    VercelDomainError: actual.VercelDomainError,
    DOMAIN_TAKEN_CODES: actual.DOMAIN_TAKEN_CODES,
    vercelDomainsConfigured: vi.fn(),
    addDomain: vi.fn(),
    getDomainState: vi.fn(),
    removeDomain: vi.fn(),
  };
});

import { requireProjectAccess } from '@/lib/supabase/require-project-access';
import { createAdminClient } from '@/lib/supabase/admin';
import { addDomain, getDomainState, removeDomain, vercelDomainsConfigured, VercelDomainError } from '@/lib/vercel-domains';
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
  vi.mocked(removeDomain).mockReset().mockResolvedValue(undefined);
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

  it('409 si el dominio es de otro proyecto (activo o pendiente reciente), y no llama a Vercel', async () => {
    for (const previo of [
      { id: 'otro', status: 'active', created_at: '2020-01-01T00:00:00Z' },
      { id: 'otro', status: 'pending', created_at: new Date(Date.now() - 2 * 86_400_000).toISOString() },
    ]) {
      asOwner([{ count: 0 }]);
      vi.mocked(createAdminClient).mockReturnValue(
        mockSupabase({ results: [{ error: { code: '23505', message: 'dup' } }, { data: previo }] }) as never,
      );
      const res = await post({ hostname: 'www.torre.com' });
      expect(res.status).toBe(409);
      expect(addDomain).not.toHaveBeenCalled();
      expect(removeDomain).not.toHaveBeenCalled();
    }
  });

  it('reserva pendiente de otro vencida (más de 7 días): la libera (Vercel y base) y reserva para este proyecto', async () => {
    asOwner([{ count: 0 }]);
    const vieja = { id: 'vieja', status: 'pending', created_at: new Date(Date.now() - 8 * 86_400_000).toISOString() };
    const admin = mockSupabase({
      results: [
        { error: { code: '23505', message: 'dup' } }, // insert
        { data: vieja }, // la reserva que tomó el hostname
        { error: null }, // delete de la vencida
        { data: ROW }, // insert de nuevo
        { error: null }, // update con los registros DNS
      ],
    });
    vi.mocked(createAdminClient).mockReturnValue(admin as never);

    const res = await post({ hostname: 'www.torre.com' });

    expect(res.status).toBe(201);
    expect(removeDomain).toHaveBeenCalledWith('www.torre.com');
    expect(admin.from.mock.results[2].value.delete).toHaveBeenCalled();
    expect(addDomain).toHaveBeenCalledWith('www.torre.com');
  });

  it('si no puede quitar de Vercel la reserva vencida, no la borra: 409', async () => {
    asOwner([{ count: 0 }]);
    const vieja = { id: 'vieja', status: 'pending', created_at: '2020-01-01T00:00:00Z' };
    const admin = mockSupabase({ results: [{ error: { code: '23505', message: 'dup' } }, { data: vieja }] });
    vi.mocked(createAdminClient).mockReturnValue(admin as never);
    vi.mocked(removeDomain).mockRejectedValueOnce(new Error('vercel down'));

    const res = await post({ hostname: 'www.torre.com' });

    expect(res.status).toBe(409);
    expect(admin.from).toHaveBeenCalledTimes(2); // insert y lectura: nada de delete
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
    expect(removeDomain).not.toHaveBeenCalled(); // Vercel no lo llegó a agregar
  });

  it.each(['domain_on_platform', 'domain_already_in_use'])(
    '409 si Vercel ya tiene el dominio (%s): deshace la reserva y NO lo quita de Vercel',
    async code => {
      asOwner([{ count: 0 }]);
      const admin = mockSupabase({ results: [{ data: ROW }, { error: null }] });
      vi.mocked(createAdminClient).mockReturnValue(admin as never);
      vi.mocked(addDomain).mockRejectedValue(new VercelDomainError('tomado', 409, code));

      const res = await post({ hostname: 'www.torre.com' });

      expect(res.status).toBe(409);
      expect(admin.from.mock.results[1].value.delete).toHaveBeenCalled();
      // Quitarlo tiraría el sitio que lo usa (la plataforma u otro cliente).
      expect(removeDomain).not.toHaveBeenCalled();
    }
  );

  it('si falla después de que Vercel lo aceptó: lo quita de Vercel además de deshacer la reserva', async () => {
    asOwner([{ count: 0 }]);
    const admin = mockSupabase({ results: [{ data: ROW }, { error: null }] });
    vi.mocked(createAdminClient).mockReturnValue(admin as never);
    vi.mocked(getDomainState).mockRejectedValue(new Error('timeout'));

    const res = await post({ hostname: 'www.torre.com' });

    expect(res.status).toBe(502);
    expect(admin.from.mock.results[1].value.delete).toHaveBeenCalled();
    expect(removeDomain).toHaveBeenCalledWith('www.torre.com');
  });
});
