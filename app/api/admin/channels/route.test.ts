import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/require-project-access', () => ({
  requireProjectAccess: vi.fn(),
  resolveRequestedProjectId: vi.fn(),
}));

import { requireProjectAccess, resolveRequestedProjectId } from '@/lib/supabase/require-project-access';
import { mockSupabase, jsonRequest } from '@/lib/test-helpers/supabase-mock';
import { GET, POST } from './route';
import { PATCH } from './[id]/route';

const URL_BASE = 'http://localhost/api/admin/channels';
const CH = { id: 'ch-1', project_id: 'p1', name: 'Pérez', slug: 'perez', kind: 'inmobiliaria', archived_at: null, created_at: '2026-11-24T00:00:00Z' };

function access(supabase: unknown) {
  vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'u1' } } as never);
}
const patch = (body: unknown) => PATCH(jsonRequest(`${URL_BASE}/ch-1`, body, { method: 'PATCH' }), { params: Promise.resolve({ id: 'ch-1' }) });

describe('/api/admin/channels', () => {
  beforeEach(() => {
    vi.mocked(requireProjectAccess).mockReset();
    vi.mocked(resolveRequestedProjectId).mockReset().mockResolvedValue('p1');
  });

  it('sin rol de gestor: 401', async () => {
    vi.mocked(requireProjectAccess).mockResolvedValue(null);
    const res = await GET(new Request(URL_BASE));
    expect(res.status).toBe(401);
    expect(requireProjectAccess).toHaveBeenCalledWith('p1', { minRole: 'gestor' });
  });

  it('GET: lista con has_traffic', async () => {
    access(mockSupabase({ results: [{ data: [CH, { ...CH, id: 'ch-2', slug: 'garcia' }] }], rpc: [{ data: ['perez'] }] }));
    const res = await GET(new Request(URL_BASE));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.map((c: { slug: string; has_traffic: boolean }) => [c.slug, c.has_traffic])).toEqual([['perez', true], ['garcia', false]]);
  });

  it('POST: crea con slug sacado del nombre', async () => {
    const sb = mockSupabase({ results: [{ data: { ...CH, name: 'Inmobiliaria Pérez', slug: 'inmobiliaria-perez' } }] });
    access(sb);
    const res = await POST(jsonRequest(URL_BASE, { name: 'Inmobiliaria Pérez', kind: 'inmobiliaria' }));
    expect(res.status).toBe(201);
    expect(sb.from.mock.results[0].value.insert.mock.calls[0][0]).toMatchObject({ project_id: 'p1', name: 'Inmobiliaria Pérez', slug: 'inmobiliaria-perez', kind: 'inmobiliaria' });
  });

  it('POST: slug ya usado en el proyecto → 409', async () => {
    access(mockSupabase({ results: [{ data: null, error: { code: '23505', message: 'duplicate key' } }] }));
    const res = await POST(jsonRequest(URL_BASE, { name: 'Pérez', kind: 'inmobiliaria' }));
    expect(res.status).toBe(409);
  });

  it('POST: nombre sin letras ni números → 400', async () => {
    access(mockSupabase({ results: [] }));
    const res = await POST(jsonRequest(URL_BASE, { name: '¡¡¡', kind: 'inmobiliaria' }));
    expect(res.status).toBe(400);
  });

  it('PATCH: cambiar el slug de un canal con tráfico → 409 sin update', async () => {
    const sb = mockSupabase({ results: [{ data: CH }], rpc: [{ data: ['perez'] }] });
    access(sb);
    const res = await patch({ slug: 'perez-nuevo' });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('Este link ya tiene visitas: no se puede cambiar.');
    expect(sb.from).toHaveBeenCalledTimes(1);
  });

  it('PATCH: cambiar el nombre de un canal con tráfico → 200', async () => {
    const sb = mockSupabase({ results: [{ data: CH }, { data: { ...CH, name: 'Pérez Propiedades' } }], rpc: [{ data: ['perez'] }] });
    access(sb);
    const res = await patch({ name: 'Pérez Propiedades' });
    expect(res.status).toBe(200);
    expect(sb.from.mock.results[1].value.update.mock.calls[0][0]).toEqual({ name: 'Pérez Propiedades' });
  });

  it('PATCH: cambiar el slug sin tráfico → 200 normalizado', async () => {
    const sb = mockSupabase({ results: [{ data: CH }, { data: { ...CH, slug: 'perez-nuevo' } }], rpc: [{ data: [] }] });
    access(sb);
    const res = await patch({ slug: 'Pérez Nuevo' });
    expect(res.status).toBe(200);
    expect(sb.from.mock.results[1].value.update.mock.calls[0][0]).toEqual({ slug: 'perez-nuevo' });
  });

  it('PATCH: archivar', async () => {
    const sb = mockSupabase({ results: [{ data: CH }, { data: { ...CH, archived_at: 'x' } }], rpc: [{ data: [] }] });
    access(sb);
    const res = await patch({ archived: true });
    expect(res.status).toBe(200);
    expect(sb.from.mock.results[1].value.update.mock.calls[0][0].archived_at).toEqual(expect.any(String));
  });

  it('PATCH: canal de otro proyecto → 404', async () => {
    access(mockSupabase({ results: [{ data: null }] }));
    const res = await patch({ name: 'x' });
    expect(res.status).toBe(404);
  });
});
