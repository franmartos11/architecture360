import { describe, it, expect, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/require-project-access', () => ({
  requireProjectAccess: vi.fn(),
  resolveRequestedProjectId: vi.fn(async () => 'p1'),
}));

import { requireProjectAccess } from '@/lib/supabase/require-project-access';
import { mockSupabase } from '@/lib/test-helpers/supabase-mock';
import { GET } from './route';

describe('GET /api/admin/whatsapp-bot/metricas', () => {
  it('las métricas del bot son de WhatsApp y el chat del sitio va aparte', async () => {
    const supabase = mockSupabase({
      results: [
        { data: [{ created_at: new Date().toISOString() }] }, // conversaciones de WhatsApp
        { count: 10 }, // mensajes de clientes
        { count: 12 }, // respuestas del bot
        { data: [] }, // leads del bot
        { count: 0 }, // leads calientes
        { count: 0 }, // visitas agendadas
        { count: 0 }, // visitas realizadas
        { count: 0 }, // preguntas pendientes
        { data: [{ origen: 'web', conversacion_id: 'w1', modelo: 'claude-opus-5-5', input_tokens: 0, output_tokens: 1_000_000, cache_read_tokens: 0, cache_write_tokens: 0 }] },
        { count: 4 }, // charlas web
        { count: 2 }, // leads del chat web
      ],
    });
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'u' }, role: 'administrador' } as never);
    const json = await (await GET(new Request('http://x/api/admin/whatsapp-bot/metricas?dias=30'))).json();

    const llamada = (i: number) => supabase.from.mock.results[i].value;
    expect(llamada(0).eq).toHaveBeenCalledWith('canal', 'whatsapp');
    expect(llamada(1).eq).toHaveBeenCalledWith('wa_conversaciones.canal', 'whatsapp');
    expect(llamada(2).eq).toHaveBeenCalledWith('wa_conversaciones.canal', 'whatsapp');
    expect(llamada(9).eq).toHaveBeenCalledWith('canal', 'web');
    expect(llamada(10).eq).toHaveBeenCalledWith('source', 'chat_web');

    expect(json.web).toEqual({ charlas: 4, contactos: 2, costoUsd: 20 });
    expect(json.costoIa.turnos).toBe(0);
  });
});
