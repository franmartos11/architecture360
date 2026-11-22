import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));
vi.mock('@/lib/supabase/require-project-access', () => ({ requireProjectAccess: vi.fn() }));

import { createClient } from '@/lib/supabase/server';
import { requireProjectAccess } from '@/lib/supabase/require-project-access';
import { mockSupabase } from '@/lib/test-helpers/supabase-mock';
import { DELETE, PATCH } from './route';

const ctx = { params: Promise.resolve({ id: 'q1' }) };
const patch = (body: unknown) => new Request('http://localhost/x', { method: 'PATCH', body: JSON.stringify(body) });

describe('/api/admin/whatsapp-bot/preguntas/[id]', () => {
  beforeEach(() => {
    vi.mocked(createClient).mockResolvedValue(mockSupabase({ results: [{ data: { id: 'q1', project_id: 'p1' } }] }) as never);
  });

  it('pregunta ajena o inexistente: 404', async () => {
    vi.mocked(createClient).mockResolvedValue(mockSupabase({ results: [{ data: null }] }) as never);
    expect((await PATCH(patch({ estado: 'descartada' }), ctx)).status).toBe(404);
  });

  it('sin rol de administrador: 404', async () => {
    vi.mocked(requireProjectAccess).mockResolvedValue(null);
    expect((await PATCH(patch({ estado: 'descartada' }), ctx)).status).toBe(404);
    expect(requireProjectAccess).toHaveBeenLastCalledWith('p1', { minRole: 'administrador' });
  });

  it('responder sin texto: 400', async () => {
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase: mockSupabase({ results: [] }) } as never);
    const res = await PATCH(patch({ estado: 'respondida', respuesta: '  ' }), ctx);
    expect(res.status).toBe(400);
    expect((await res.json()).campos.respuesta).toBeTruthy();
  });

  it('responder: guarda respuesta, estado y fecha, acotado al proyecto', async () => {
    const supabase = mockSupabase({ results: [{ data: { id: 'q1', estado: 'respondida' } }] });
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase } as never);
    const res = await PATCH(patch({ estado: 'respondida', respuesta: ' Sí, hasta 2 mascotas. ' }), ctx);
    expect(res.status).toBe(200);
    const q = supabase.from.mock.results[0].value;
    const cambios = q.update.mock.calls[0][0];
    expect(cambios).toMatchObject({ estado: 'respondida', respuesta: 'Sí, hasta 2 mascotas.' });
    expect(cambios.respondida_at).toBeTruthy();
    expect(q.eq).toHaveBeenCalledWith('project_id', 'p1');
  });

  it('borrar', async () => {
    const supabase = mockSupabase({ results: [{ error: null }] });
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase } as never);
    expect((await DELETE(new Request('http://localhost/x'), ctx)).status).toBe(200);
    expect(supabase.from.mock.results[0].value.delete).toHaveBeenCalled();
  });
});
