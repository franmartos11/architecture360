import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/require-project-access', () => ({
  requireProjectAccess: vi.fn(),
  resolveRequestedProjectId: vi.fn(),
}));

import { requireProjectAccess, resolveRequestedProjectId } from '@/lib/supabase/require-project-access';
import { mockSupabase } from '@/lib/test-helpers/supabase-mock';
import { GET } from './route';

describe('GET /api/admin/whatsapp-bot/conversaciones', () => {
  beforeEach(() => {
    vi.mocked(resolveRequestedProjectId).mockReset().mockResolvedValue('project-1');
    vi.mocked(requireProjectAccess).mockReset();
  });

  it('pide el rol mínimo gestor', async () => {
    vi.mocked(requireProjectAccess).mockResolvedValue(null);
    const res = await GET(new Request('http://localhost/api/admin/whatsapp-bot/conversaciones?resumen=1'));
    expect(res.status).toBe(401);
    expect(requireProjectAccess).toHaveBeenCalledWith('project-1', expect.objectContaining({ minRole: 'gestor' }));
  });

  it('?resumen=1: solo la suma de no leídos, pidiendo una sola columna', async () => {
    const supabase = mockSupabase({ results: [{ data: [{ no_leidos: 2 }, { no_leidos: 3 }] }] });
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase } as never);

    const res = await GET(new Request('http://localhost/api/admin/whatsapp-bot/conversaciones?resumen=1'));

    expect(await res.json()).toEqual({ noLeidos: 5 });
    const consulta = supabase.from.mock.results[0].value;
    expect(consulta.select).toHaveBeenCalledWith('no_leidos');
    expect(consulta.gt).toHaveBeenCalledWith('no_leidos', 0);
  });

  it('sin resumen: la lista de conversaciones, como antes', async () => {
    const filas = [{ id: 'c1', no_leidos: 1 }];
    const supabase = mockSupabase({ results: [{ data: filas }] });
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase } as never);

    const res = await GET(new Request('http://localhost/api/admin/whatsapp-bot/conversaciones'));
    expect(await res.json()).toEqual(filas);
  });
});
