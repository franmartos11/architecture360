import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }));

import { createAdminClient } from '@/lib/supabase/admin';
import { mockSupabase } from '@/lib/test-helpers/supabase-mock';
import { unsubscribeToken } from '@/lib/unsubscribe-token';
import { GET } from './route';

const ID = '11111111-1111-4111-8111-111111111111';
const url = (lead: string, t: string) => new Request(`http://localhost/api/leads/unsubscribe?lead=${lead}&t=${t}`);

describe('GET /api/leads/unsubscribe', () => {
  beforeEach(() => {
    process.env.LEADS_UNSUBSCRIBE_SECRET = 'test-secret';
    vi.mocked(createAdminClient).mockReset();
  });

  it('token válido: marca la baja de ese lead y responde la página', async () => {
    const admin = mockSupabase({ results: [{ error: null }] });
    vi.mocked(createAdminClient).mockReturnValue(admin as never);

    const res = await GET(url(ID, unsubscribeToken(ID)));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    expect(await res.text()).toContain('Listo. No te mandamos más novedades de esta obra.');
    expect(admin.from).toHaveBeenCalledWith('leads');
    const q = admin.from.mock.results[0].value;
    expect(q.update.mock.calls[0][0]).toEqual({ updates_unsubscribed_at: expect.any(String) });
    expect(q.eq).toHaveBeenCalledWith('id', ID);
  });

  it('token inválido: 400 sin tocar la base', async () => {
    const admin = mockSupabase({ results: [] });
    vi.mocked(createAdminClient).mockReturnValue(admin as never);

    expect((await GET(url(ID, 'a'.repeat(64)))).status).toBe(400);
    expect(admin.from).not.toHaveBeenCalled();
  });

  it('token de otro lead: 400', async () => {
    const admin = mockSupabase({ results: [] });
    vi.mocked(createAdminClient).mockReturnValue(admin as never);
    const other = '22222222-2222-4222-8222-222222222222';
    expect((await GET(url(other, unsubscribeToken(ID)))).status).toBe(400);
    expect(admin.from).not.toHaveBeenCalled();
  });

  it('id que no es uuid o parámetros faltantes: 400', async () => {
    expect((await GET(url('no-uuid', 'x'))).status).toBe(400);
    expect((await GET(new Request('http://localhost/api/leads/unsubscribe'))).status).toBe(400);
  });
});
