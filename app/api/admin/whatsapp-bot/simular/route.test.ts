import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/require-project-access', () => ({
  requireProjectAccess: vi.fn(),
  resolveRequestedProjectId: vi.fn(),
}));
vi.mock('@/lib/rate-limit', () => ({ rateLimitOrRespond: vi.fn(async () => null) }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn(() => ({})) }));
vi.mock('@/lib/whatsapp-bot/datos', () => ({ cargarDatosProyecto: vi.fn() }));
vi.mock('@/lib/whatsapp-bot/simulador', () => ({ simularTurno: vi.fn() }));
vi.mock('@/lib/whatsapp-bot/repo', () => ({ visitasActivas: vi.fn(async () => []) }));

import { requireProjectAccess, resolveRequestedProjectId } from '@/lib/supabase/require-project-access';
import { rateLimitOrRespond } from '@/lib/rate-limit';
import { cargarDatosProyecto } from '@/lib/whatsapp-bot/datos';
import { simularTurno } from '@/lib/whatsapp-bot/simulador';
import { mockSupabase } from '@/lib/test-helpers/supabase-mock';
import { POST } from './route';

const req = (body: unknown) =>
  new Request('http://localhost:3000/api/admin/whatsapp-bot/simular', { method: 'POST', body: JSON.stringify(body) });
const valido = { mensajes: [{ rol: 'cliente', texto: 'Hola' }] };

describe('POST /api/admin/whatsapp-bot/simular', () => {
  beforeEach(() => {
    vi.mocked(resolveRequestedProjectId).mockResolvedValue('p1');
    vi.stubEnv('ANTHROPIC_API_KEY', 'test');
    vi.mocked(simularTurno).mockReset();
  });
  afterEach(() => vi.unstubAllEnvs());

  it('exige administrador', async () => {
    vi.mocked(requireProjectAccess).mockResolvedValue(null);
    expect((await POST(req(valido))).status).toBe(401);
    expect(requireProjectAccess).toHaveBeenLastCalledWith('p1', { minRole: 'administrador' });
  });

  it('sin ANTHROPIC_API_KEY: 503 con mensaje claro', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', '');
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase: mockSupabase({ results: [] }), user: { id: 'u1' } } as never);
    const res = await POST(req(valido));
    expect(res.status).toBe(503);
    expect((await res.json()).error).toContain('ANTHROPIC_API_KEY');
  });

  it('charla que no termina en el cliente: 400', async () => {
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase: mockSupabase({ results: [] }), user: { id: 'u1' } } as never);
    const res = await POST(req({ mensajes: [{ rol: 'cliente', texto: 'Hola' }, { rol: 'bot', texto: 'Hola!' }] }));
    expect(res.status).toBe(400);
    expect(simularTurno).not.toHaveBeenCalled();
  });

  it('rate limit: devuelve el 429 sin llamar a la IA', async () => {
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase: mockSupabase({ results: [] }), user: { id: 'u1' } } as never);
    vi.mocked(rateLimitOrRespond).mockResolvedValueOnce(new Response(null, { status: 429 }) as never);
    expect((await POST(req(valido))).status).toBe(429);
    expect(simularTurno).not.toHaveBeenCalled();
  });

  it('corre con la config guardada y el sitio solo si está publicado', async () => {
    const supabase = mockSupabase({ results: [{ data: { nombre_bot: 'Sofía', criterio_aviso: null, conocimiento: 'X' } }] });
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'u1' } } as never);
    vi.mocked(cargarDatosProyecto).mockResolvedValue({ proyecto: { slug: 'torre', published: true } } as never);
    vi.mocked(simularTurno).mockResolvedValue({ partes: ['Hola!'], imagenes: [], aviso: null, preguntas: [], visita: null });
    const res = await POST(req(valido));
    expect(res.status).toBe(200);
    expect((await res.json()).partes).toEqual(['Hola!']);
    const arg = vi.mocked(simularTurno).mock.calls[0][0];
    expect(arg.bot.nombre_bot).toBe('Sofía');
    expect(arg.sitio).toContain('/proyecto/torre');
    expect(arg.yaAvisado).toBe(false);
  });
});
