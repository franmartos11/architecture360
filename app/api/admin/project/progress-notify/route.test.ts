import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/require-project-access', () => ({
  requireProjectAccess: vi.fn(),
  resolveRequestedProjectId: vi.fn().mockResolvedValue('project-1'),
}));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }));
vi.mock('@/lib/email', () => ({ sendEmail: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/rate-limit', () => ({ rateLimitOrRespond: vi.fn().mockResolvedValue(null) }));
vi.mock('@/lib/revalidate-project', () => ({ revalidateProjectById: vi.fn().mockResolvedValue(undefined) }));

import { requireProjectAccess } from '@/lib/supabase/require-project-access';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendEmail } from '@/lib/email';
import { rateLimitOrRespond } from '@/lib/rate-limit';
import { revalidateProjectById } from '@/lib/revalidate-project';
import { mockSupabase, jsonRequest, splitClients, type MockResult } from '@/lib/test-helpers/supabase-mock';
import { verifyUnsubscribeToken } from '@/lib/unsubscribe-token';
import { GET, POST } from './route';

const blob = (extra: Record<string, unknown> = {}) => ({
  stages: [],
  percent: 55,
  deliveryEstimate: 'Dic 2027',
  updates: [
    { id: 'pub1', date: '2026-10-01', title: 'Losa terminada', body: 'Hormigonamos.', images: ['https://x.com/a.jpg'], ...extra },
    { id: 'borr', date: '2026-10-02', title: 'Borrador', images: ['https://x.com/b.jpg'], draft: true },
  ],
});
const projectRow = (progress: unknown): MockResult => ({
  data: { name: 'Torre & Mar', slug: 'torre', construction_progress: progress, updated_at: '2026-10-01T00:00:00.000Z' },
});

function setup(results: MockResult[]) {
  const { session, admin } = splitClients(mockSupabase({ user: { id: 'owner-1' }, results }));
  vi.mocked(requireProjectAccess).mockResolvedValue({ user: { id: 'owner-1' }, supabase: session } as never);
  vi.mocked(createAdminClient).mockReturnValue(admin as never);
  return { session, admin };
}

const post = (body: unknown) => jsonRequest('http://localhost/api/admin/project/progress-notify', body);

describe('/api/admin/project/progress-notify', () => {
  beforeEach(() => {
    process.env.LEADS_UNSUBSCRIBE_SECRET = 'test-secret';
    vi.mocked(requireProjectAccess).mockReset();
    vi.mocked(createAdminClient).mockReset();
    vi.mocked(sendEmail).mockReset().mockResolvedValue(undefined);
    vi.mocked(rateLimitOrRespond).mockReset().mockResolvedValue(null);
    vi.mocked(revalidateProjectById).mockClear();
  });

  it('POST sin acceso al proyecto: 401, no toca nada', async () => {
    vi.mocked(requireProjectAccess).mockResolvedValue(null);
    const res = await POST(post({ updateId: 'pub1' }));
    expect(res.status).toBe(401);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('GET sin acceso: 401', async () => {
    vi.mocked(requireProjectAccess).mockResolvedValue(null);
    const res = await GET(new Request('http://localhost/api/admin/project/progress-notify?updateId=pub1'));
    expect(res.status).toBe(401);
  });

  it('entrada en borrador o inexistente: 400', async () => {
    for (const updateId of ['borr', 'nope']) {
      setup([projectRow(blob())]);
      const res = await POST(post({ updateId }));
      expect(res.status).toBe(400);
    }
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('entrada ya notificada: 409 y no manda', async () => {
    const { admin } = setup([projectRow(blob({ notifiedAt: '2026-10-05T10:00:00.000Z' }))]);
    const res = await POST(post({ updateId: 'pub1' }));
    expect(res.status).toBe(409);
    expect(sendEmail).not.toHaveBeenCalled();
    expect(admin.from).not.toHaveBeenCalled();
  });

  it('rate limit: devuelve el 429 sin mandar', async () => {
    setup([projectRow(blob())]);
    vi.mocked(rateLimitOrRespond).mockResolvedValueOnce(new Response('{}', { status: 429 }) as never);
    const res = await POST(post({ updateId: 'pub1' }));
    expect(res.status).toBe(429);
    expect(rateLimitOrRespond).toHaveBeenCalledWith(expect.objectContaining({ key: 'progress-notify:project:project-1', windowSeconds: 3600, max: 5 }), expect.any(String));
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('feliz: manda a los que optaron (uno por email), con baja firmada, y marca notifiedAt', async () => {
    const { session, admin } = setup([
      projectRow(blob()), // session: projects select
      { data: [
        { id: 'l1', email: 'ana@example.com' },
        { id: 'l2', email: 'ANA@example.com' }, // misma persona, otro contacto
        { id: 'l3', email: 'beto@example.com' },
        { id: 'l4', email: null },
      ] }, // admin: leads
      { data: [{ id: 'project-1' }] }, // session: projects update (claim)
      { data: { hostname: 'www.torre.com' } }, // admin: project_domains
    ]);

    const res = await POST(post({ updateId: 'pub1' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ sent: 2, skipped: 0, notifiedAt: expect.stringMatching(/^\d{4}-/), updatedAt: expect.stringMatching(/^\d{4}-/) });

    // El filtro de opt-in y baja viaja en la consulta, no se filtra en memoria.
    const leadsQuery = admin.from.mock.results[0].value;
    expect(admin.from.mock.calls[0][0]).toBe('leads');
    expect(leadsQuery.eq).toHaveBeenCalledWith('wants_updates', true);
    expect(leadsQuery.is).toHaveBeenCalledWith('updates_unsubscribed_at', null);
    expect(leadsQuery.eq).toHaveBeenCalledWith('project_id', 'project-1');

    expect(sendEmail).toHaveBeenCalledTimes(2);
    const first = vi.mocked(sendEmail).mock.calls[0][0];
    expect(first.to).toBe('ana@example.com');
    expect(first.subject).toBe('Novedades de la obra · Torre & Mar');
    expect(first.html).toContain('Losa terminada');
    expect(first.html).toContain('https://www.torre.com#avance-pub1');
    expect(first.html).toContain('55%');
    const unsub = first.html.match(/href="([^"]*\/api\/leads\/unsubscribe[^"]*)"/)![1].replace(/&amp;/g, '&');
    const u = new URL(unsub);
    expect(u.searchParams.get('lead')).toBe('l1');
    expect(verifyUnsubscribeToken('l1', u.searchParams.get('t')!)).toBe(true);

    // Marca la entrada (y solo esa) y revalida.
    const saved = session.from.mock.results[1].value.update.mock.calls[0][0].construction_progress;
    expect(saved.updates.find((x: { id: string }) => x.id === 'pub1').notifiedAt).toEqual(expect.any(String));
    expect(saved.updates.find((x: { id: string }) => x.id === 'borr').notifiedAt).toBeUndefined();
    expect(saved.updatedAt).toEqual(expect.any(String));
    expect(revalidateProjectById).toHaveBeenCalledWith('project-1');
  });

  it('sin interesados: manda 0 y NO marca la entrada', async () => {
    const { session } = setup([projectRow(blob()), { data: [] }]);
    const res = await POST(post({ updateId: 'pub1' }));
    expect(await res.json()).toEqual({ sent: 0, skipped: 0 });
    expect(session.from).toHaveBeenCalledTimes(1); // solo la lectura, ningún update
  });

  it('otro envío se adelantó (el update no matchea): 409 y no manda', async () => {
    setup([projectRow(blob()), { data: [{ id: 'l1', email: 'ana@example.com' }] }, { data: [] }]);
    const res = await POST(post({ updateId: 'pub1' }));
    expect(res.status).toBe(409);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('GET devuelve cuántos recibirían y si ya se envió', async () => {
    setup([projectRow(blob({ notifiedAt: '2026-10-05T10:00:00.000Z' })), { data: [{ id: 'l1', email: 'a@x.com' }, { id: 'l2', email: 'b@x.com' }] }]);
    const res = await GET(new Request('http://localhost/api/admin/project/progress-notify?updateId=pub1'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ recipients: 2, notifiedAt: '2026-10-05T10:00:00.000Z' });
  });
});
