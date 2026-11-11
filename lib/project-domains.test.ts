import { describe, it, expect, vi } from 'vitest';
import { mockSupabase } from '@/lib/test-helpers/supabase-mock';

vi.mock('server-only', () => ({}));

import { getActiveDomains } from './project-domains';

describe('getActiveDomains', () => {
  it('sin proyectos no consulta nada', async () => {
    const supabase = mockSupabase({ results: [] });
    expect((await getActiveDomains(supabase as never, [])).size).toBe(0);
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('pide solo los activos, por proyecto y de más antiguo a más nuevo', async () => {
    const supabase = mockSupabase({ results: [{ data: [] }] });
    await getActiveDomains(supabase as never, ['p1', 'p2']);
    const chain = supabase.from.mock.results[0].value;
    expect(supabase.from).toHaveBeenCalledWith('project_domains');
    expect(chain.in).toHaveBeenCalledWith('project_id', ['p1', 'p2']);
    expect(chain.eq).toHaveBeenCalledWith('status', 'active');
    expect(chain.order).toHaveBeenCalledWith('created_at', { ascending: true });
  });

  it('un dominio por proyecto: el más antiguo', async () => {
    const supabase = mockSupabase({ results: [{ data: [
      { project_id: 'p1', hostname: 'www.torre.com' },
      { project_id: 'p1', hostname: 'torre.com' },
      { project_id: 'p2', hostname: 'casa.com' },
    ] }] });
    const map = await getActiveDomains(supabase as never, ['p1', 'p2']);
    expect(map.get('p1')).toBe('www.torre.com');
    expect(map.get('p2')).toBe('casa.com');
  });

  it('si la consulta falla (tabla todavía sin crear): mapa vacío, no tira', async () => {
    const supabase = mockSupabase({ results: [{ data: null, error: { message: "Could not find the table 'public.project_domains'" } }] });
    expect((await getActiveDomains(supabase as never, ['p1'])).size).toBe(0);
  });
});
