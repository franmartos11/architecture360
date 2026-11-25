import { describe, it, expect, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }));
vi.mock('@/lib/supabase/require-project-access', () => ({ requireProjectAccess: vi.fn() }));

import { createClient } from '@/lib/supabase/server';
import { requireProjectAccess } from '@/lib/supabase/require-project-access';
import { mockSupabase } from '@/lib/test-helpers/supabase-mock';
import { GET, PATCH } from './route';

describe('GET /conversaciones/[id]', () => {
  it('ordena por enviado_at desc en la consulta y devuelve ascendente por orden_at ?? enviado_at', async () => {
    vi.mocked(createClient).mockResolvedValue(
      mockSupabase({ results: [{ data: { id: 'c1', project_id: 'p1' } }] }) as never
    );
    const supabase = mockSupabase({
      results: [
        {
          data: [
            { id: 'm3', enviado_at: '2026-01-01T10:03:00Z', orden_at: null, media_path: null, salida_id: null },
            { id: 'm2', enviado_at: '2026-01-01T10:05:00Z', orden_at: '2026-01-01T10:02:00Z', media_path: null, salida_id: null },
            { id: 'm1', enviado_at: '2026-01-01T10:01:00Z', orden_at: null, media_path: null, salida_id: null },
          ],
        },
        { data: [{ id: 's1', estado: 'error', error: 'x', cuerpo: 'hola', created_at: '2026-01-01T10:06:00Z' }] },
      ],
    });
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'u' }, role: 'gestor' } as never);

    const res = await GET(new Request('http://x'), { params: Promise.resolve({ id: 'c1' }) });
    const json = await res.json();
    expect(json.mensajes.map((m: { id: string }) => m.id)).toEqual(['m1', 'm2', 'm3']);

    expect(json.salidas).toEqual([{ id: 's1', estado: 'error', error: 'x', cuerpo: 'hola', created_at: '2026-01-01T10:06:00Z' }]);
    const qs = supabase.from.mock.results[1].value;
    expect(supabase.from.mock.calls[1][0]).toBe('wa_salida');
    expect(qs.eq).toHaveBeenCalledWith('origen', 'vendedor');
    expect(qs.neq).toHaveBeenCalledWith('estado', 'enviado');

    expect(requireProjectAccess).toHaveBeenLastCalledWith('p1', { minRole: 'gestor' });

    const q = supabase.from.mock.results[0].value;
    expect(q.order).toHaveBeenCalledTimes(1);
    expect(q.order).toHaveBeenCalledWith('enviado_at', { ascending: false });
    expect(q.limit).toHaveBeenCalledWith(200);
  });

  it('charla del sitio: las imágenes que mostró el bot se ven (la URL está en el cuerpo)', async () => {
    vi.mocked(createClient).mockResolvedValue(
      mockSupabase({ results: [{ data: { id: 'c1', project_id: 'p1', canal: 'web' } }] }) as never
    );
    const supabase = mockSupabase({
      results: [
        { data: [{ id: 'm1', tipo: 'imagen', autor: 'bot', cuerpo: 'https://x/f.jpg', enviado_at: '2026-01-01T10:01:00Z', orden_at: null, media_path: null, salida_id: null }] },
        { data: [] },
      ],
    });
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'u' }, role: 'gestor' } as never);
    const json = await (await GET(new Request('http://x'), { params: Promise.resolve({ id: 'c1' }) })).json();
    expect(json.mensajes[0]).toMatchObject({ media_url: 'https://x/f.jpg', cuerpo: null });
  });

  it('PATCH (tomar/devolver/leído) exige gestor en adelante', async () => {
    vi.mocked(createClient).mockResolvedValue(
      mockSupabase({ results: [{ data: { id: 'c1', project_id: 'p1' } }] }) as never
    );
    vi.mocked(requireProjectAccess).mockResolvedValue(null);
    const res = await PATCH(
      new Request('http://x', { method: 'PATCH', body: JSON.stringify({ accion: 'tomar' }) }),
      { params: Promise.resolve({ id: 'c1' }) }
    );
    expect(res.status).toBe(401);
    expect(requireProjectAccess).toHaveBeenLastCalledWith('p1', { minRole: 'gestor' });
  });

  it('PATCH tomar/devolver sobre una charla del sitio: 409 (leído sí se puede)', async () => {
    const pedir = (accion: string) => PATCH(
      new Request('http://x', { method: 'PATCH', body: JSON.stringify({ accion }) }),
      { params: Promise.resolve({ id: 'c1' }) }
    );
    for (const accion of ['tomar', 'devolver']) {
      vi.mocked(createClient).mockResolvedValue(mockSupabase({ results: [{ data: { id: 'c1', project_id: 'p1', canal: 'web' } }] }) as never);
      vi.mocked(requireProjectAccess).mockResolvedValue({ supabase: mockSupabase({ results: [] }), user: { id: 'u' }, role: 'gestor' } as never);
      expect((await pedir(accion)).status).toBe(409);
    }
    vi.mocked(createClient).mockResolvedValue(mockSupabase({ results: [{ data: { id: 'c1', project_id: 'p1', canal: 'web' } }] }) as never);
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase: mockSupabase({ results: [{ data: { id: 'c1' } }] }), user: { id: 'u' }, role: 'gestor' } as never);
    expect((await pedir('leido')).status).toBe(200);
  });
});
