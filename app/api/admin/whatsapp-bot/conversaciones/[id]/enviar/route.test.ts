import { describe, it, expect, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }));
vi.mock('@/lib/supabase/require-project-access', () => ({ requireProjectAccess: vi.fn() }));

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireProjectAccess } from '@/lib/supabase/require-project-access';
import { mockSupabase } from '@/lib/test-helpers/supabase-mock';
import { POST } from './route';

const conv = { id: 'c1', project_id: 'p1', bot_id: 'b1', contacto_wid: null, contacto_numero: '5491155551234' };
const call = () =>
  POST(new Request('http://x', { method: 'POST', body: JSON.stringify({ texto: 'hola' }) }), {
    params: Promise.resolve({ id: 'c1' }),
  });

describe('POST /conversaciones/[id]/enviar', () => {
  it('si falla el update de modo, igual responde 201 con la salida', async () => {
    vi.mocked(createClient).mockResolvedValue(mockSupabase({ results: [{ data: conv }] }) as never);
    vi.mocked(createAdminClient).mockReturnValue(mockSupabase({ results: [{ data: { estado: 'conectado' } }] }) as never);
    const supabase = mockSupabase({
      results: [{ data: { id: 's1' } }, { error: { message: 'boom' } }],
    });
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'u1' }, role: 'gestor' } as never);
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await call();
    expect(res.status).toBe(201);
    expect((await res.json()).salida.id).toBe('s1');
  });

  it('exige gestor en adelante y lee el estado del bot atado al proyecto de la conversación', async () => {
    vi.mocked(createClient).mockResolvedValue(mockSupabase({ results: [{ data: conv }] }) as never);
    const admin = mockSupabase({ results: [{ data: { estado: 'conectado' } }] });
    vi.mocked(createAdminClient).mockReturnValue(admin as never);
    const supabase = mockSupabase({ results: [{ data: { id: 's1' } }, { data: conv }] });
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'u1' }, role: 'gestor' } as never);

    expect((await call()).status).toBe(201);
    expect(requireProjectAccess).toHaveBeenLastCalledWith('p1', { minRole: 'gestor' });
    expect(admin.from).toHaveBeenCalledWith('wa_bots');
    const q = admin.from.mock.results[0].value;
    expect(q.eq).toHaveBeenCalledWith('id', 'b1');
    expect(q.eq).toHaveBeenCalledWith('project_id', 'p1');
  });

  it('sin el rol mínimo: 401 y no encola nada', async () => {
    vi.mocked(createClient).mockResolvedValue(mockSupabase({ results: [{ data: conv }] }) as never);
    vi.mocked(requireProjectAccess).mockResolvedValue(null);
    expect((await call()).status).toBe(401);
  });

  it('bot no conectado: 409', async () => {
    vi.mocked(createClient).mockResolvedValue(mockSupabase({ results: [{ data: conv }] }) as never);
    vi.mocked(createAdminClient).mockReturnValue(mockSupabase({ results: [{ data: { estado: 'desconectado' } }] }) as never);
    const supabase = mockSupabase({ results: [] });
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'u1' }, role: 'gestor' } as never);
    expect((await call()).status).toBe(409);
  });
});
