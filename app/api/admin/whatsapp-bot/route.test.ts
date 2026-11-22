import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/whatsapp-bot/host-default', () => ({ asignarHostPorDefecto: vi.fn(async () => null) }));
vi.mock('@/lib/supabase/require-project-access', () => ({
  requireProjectAccess: vi.fn(),
  resolveRequestedProjectId: vi.fn(),
}));

import { requireProjectAccess, resolveRequestedProjectId } from '@/lib/supabase/require-project-access';
import { asignarHostPorDefecto } from '@/lib/whatsapp-bot/host-default';
import { mockSupabase } from '@/lib/test-helpers/supabase-mock';
import { GET, PATCH } from './route';

const req = (body?: unknown) =>
  new Request('http://localhost/api/admin/whatsapp-bot', {
    method: body ? 'PATCH' : 'GET',
    body: body ? JSON.stringify(body) : undefined,
  });

describe('/api/admin/whatsapp-bot', () => {
  beforeEach(() => {
    vi.mocked(resolveRequestedProjectId).mockResolvedValue('p1');
  });

  it('GET sin bot: bot null', async () => {
    const supabase = mockSupabase({ results: [{ data: null }] });
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'u1' }, role: 'administrador' } as never);
    expect(await (await GET(req())).json()).toEqual({ bot: null, puenteVivo: false });
  });

  it('GET: puenteVivo por heartbeat y omite qr si no espera QR', async () => {
    const bot = { id: 'b', estado: 'conectado', qr: 'xxx', heartbeat_at: new Date().toISOString() };
    const supabase = mockSupabase({ results: [{ data: bot }] });
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'u1' }, role: 'administrador' } as never);
    const json = await (await GET(req())).json();
    expect(json.puenteVivo).toBe(true);
    expect(json.bot.qr).toBeNull();
  });

  it('PATCH inválido: 400 con campos', async () => {
    const supabase = mockSupabase({ results: [] });
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'u1' }, role: 'administrador' } as never);
    const res = await PATCH(req({ vendedor_whatsapp: 'abc' }));
    expect(res.status).toBe(400);
    expect((await res.json()).campos.vendedor_whatsapp).toBeTruthy();
  });

  it('PATCH igual al número del bot: 400', async () => {
    const supabase = mockSupabase({ results: [{ data: { id: 'b', numero: '5491155551234' } }] });
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'u1' }, role: 'administrador' } as never);
    const res = await PATCH(req({ vendedor_whatsapp: '011 15 5555-1234' }));
    expect(res.status).toBe(400);
  });

  it('GET y PATCH exigen administrador en adelante (configuración y QR)', async () => {
    vi.mocked(requireProjectAccess).mockResolvedValue(null);
    expect((await GET(req())).status).toBe(401);
    expect(requireProjectAccess).toHaveBeenLastCalledWith('p1', { minRole: 'administrador' });
    expect((await PATCH(req({ activo: true }))).status).toBe(401);
    expect(requireProjectAccess).toHaveBeenLastCalledWith('p1', { minRole: 'administrador' });
  });

  it('PATCH sin fila: la crea con vendedor_user_id = quien configura', async () => {
    const supabase = mockSupabase({ results: [{ data: null }, { data: { id: 'b', estado: 'desconectado', qr: null } }] });
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'admin1' }, role: 'administrador' } as never);
    const res = await PATCH(req({ activo: true }));
    expect(res.status).toBe(200);
    const ins = supabase.from.mock.results[1].value;
    expect(ins.insert).toHaveBeenCalledWith(expect.objectContaining({ project_id: 'p1', vendedor_user_id: 'admin1' }));
  });

  it('PATCH crea un bot sin máquina: le asigna la del deploy y la devuelve', async () => {
    vi.mocked(asignarHostPorDefecto).mockResolvedValueOnce('mac-pruebas');
    const supabase = mockSupabase({
      results: [{ data: null }, { data: { id: 'b', estado: 'desconectado', qr: null, host_permitido: null } }],
    });
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'u1' }, role: 'administrador' } as never);
    const json = await (await PATCH(req({ activo: true }))).json();
    expect(asignarHostPorDefecto).toHaveBeenCalledWith('b');
    expect(json.host_permitido).toBe('mac-pruebas');
  });

  it('PATCH sobre bot que ya tiene máquina: no la toca', async () => {
    vi.mocked(asignarHostPorDefecto).mockClear();
    const supabase = mockSupabase({
      results: [{ data: { id: 'b', host_permitido: 'srv1' } }, { data: { id: 'b', estado: 'conectado', host_permitido: 'srv1' } }],
    });
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'u1' }, role: 'administrador' } as never);
    const json = await (await PATCH(req({ activo: true }))).json();
    expect(asignarHostPorDefecto).not.toHaveBeenCalled();
    expect(json.host_permitido).toBe('srv1');
  });

  it('PATCH con config vacía sobre fila existente: devuelve la fila sin update', async () => {
    const supabase = mockSupabase({ results: [{ data: { id: 'b', estado: 'conectado', qr: 'x' } }] });
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'u1' }, role: 'administrador' } as never);
    const res = await PATCH(req({}));
    expect(res.status).toBe(200);
    expect((await res.json()).id).toBe('b');
    expect(supabase.from).toHaveBeenCalledTimes(1);
  });
});
