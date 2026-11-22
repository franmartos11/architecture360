import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/require-project-access', () => ({
  requireProjectAccess: vi.fn(),
  resolveRequestedProjectId: vi.fn(),
}));

import { requireProjectAccess, resolveRequestedProjectId } from '@/lib/supabase/require-project-access';
import { mockSupabase } from '@/lib/test-helpers/supabase-mock';
import { GET } from './route';

const req = () => new Request('http://localhost/api/admin/whatsapp-bot/preguntas');

describe('GET /api/admin/whatsapp-bot/preguntas', () => {
  beforeEach(() => vi.mocked(resolveRequestedProjectId).mockResolvedValue('p1'));

  it('exige administrador', async () => {
    vi.mocked(requireProjectAccess).mockResolvedValue(null);
    expect((await GET(req())).status).toBe(401);
    expect(requireProjectAccess).toHaveBeenLastCalledWith('p1', { minRole: 'administrador' });
  });

  it('lista las del proyecto sin las descartadas', async () => {
    const supabase = mockSupabase({ results: [{ data: [{ id: 'q1' }] }] });
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase } as never);
    expect(await (await GET(req())).json()).toEqual({ preguntas: [{ id: 'q1' }] });
    const q = supabase.from.mock.results[0].value;
    expect(q.eq).toHaveBeenCalledWith('project_id', 'p1');
    expect(q.neq).toHaveBeenCalledWith('estado', 'descartada');
  });

  it('tabla sin crear: avisa en vez de 500', async () => {
    const supabase = mockSupabase({ results: [{ error: { code: '42P01', message: 'relation "wa_preguntas" does not exist' } }] });
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase } as never);
    expect(await (await GET(req())).json()).toEqual({ preguntas: [], faltaTabla: true });
  });
});
