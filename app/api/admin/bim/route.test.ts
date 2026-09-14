import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/require-admin', () => ({ requireAdminUser: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));
vi.mock('@/lib/supabase/require-project-access', () => ({ requireProjectAccess: vi.fn() }));

import { requireAdminUser } from '@/lib/supabase/require-admin';
import { createClient } from '@/lib/supabase/server';
import { requireProjectAccess } from '@/lib/supabase/require-project-access';
import { mockSupabase, jsonRequest } from '@/lib/test-helpers/supabase-mock';
import { POST } from './route';

const URL_ = 'http://localhost/api/admin/bim';

function row(over: Record<string, unknown> = {}) {
  return {
    id: 'bim-1', author_id: 'user-1', project_id: null, title: 'Casa Patio',
    description: null, source_format: null, source_url: null, geometry_url: null,
    properties_url: null, gallery_images: [], cover_image: null, stats: null,
    status: 'processing', error_message: null, is_public: true,
    created_at: '2026-09-14T10:00:00Z', updated_at: '2026-09-14T10:00:00Z',
    ...over,
  };
}

/**
 * Cliente que, en vez de devolver un resultado fijo canned como
 * mockSupabase(), ECOA lo que la ruta realmente pasó a `.insert(...)`
 * fusionado sobre una fila base. Así los tests de status/cover_image
 * (findings item 5) verifican lo que la ruta CALCULÓ, no lo que el mock
 * fue instruido a devolver — con mockSupabase() común esos tests pasarían
 * igual aunque se borrara la lógica de cálculo de status.
 */
function echoInsertClient(base: Record<string, unknown>) {
  let payload: Record<string, unknown> = {};
  const from = vi.fn(() => {
    const proxy: unknown = new Proxy(() => {}, {
      get(_t, prop) {
        if (prop === 'insert') {
          return (p: unknown) => {
            payload = p as Record<string, unknown>;
            return proxy;
          };
        }
        if (prop === 'single' || prop === 'maybeSingle') {
          return () => Promise.resolve({ data: { ...base, ...payload }, error: null });
        }
        if (prop === 'then') {
          return (resolve: (r: unknown) => void) => resolve({ data: { ...base, ...payload }, error: null });
        }
        return (..._args: unknown[]) => proxy;
      },
    });
    return proxy;
  });
  return { from, capturedPayload: () => payload };
}

describe('POST /api/admin/bim', () => {
  beforeEach(() => {
    vi.mocked(requireAdminUser).mockReset();
    vi.mocked(createClient).mockReset();
    vi.mocked(requireProjectAccess).mockReset();
  });

  it('sin sesión: 401', async () => {
    vi.mocked(requireAdminUser).mockResolvedValue(null as never);
    const res = await POST(jsonRequest(URL_, { title: 'Casa Patio' }));
    expect(res.status).toBe(401);
    expect(createClient).not.toHaveBeenCalled();
  });

  it('sin título: 400', async () => {
    vi.mocked(requireAdminUser).mockResolvedValue({ id: 'user-1' } as never);
    const res = await POST(jsonRequest(URL_, { title: '   ' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Falta el título.');
  });

  it('más imágenes que el tope: 400 con el número concreto', async () => {
    vi.mocked(requireAdminUser).mockResolvedValue({ id: 'user-1' } as never);
    const galleryImages = Array.from({ length: 31 }, (_, i) => `https://x/${i}.png`);
    const res = await POST(jsonRequest(URL_, { title: 'Casa', galleryImages }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain('30');
  });

  it('pieza vacía: se crea en processing, no en ready (chequeando lo que se insertó de verdad)', async () => {
    vi.mocked(requireAdminUser).mockResolvedValue({ id: 'user-1' } as never);
    const supabase = echoInsertClient(row());
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await POST(jsonRequest(URL_, { title: 'Casa Patio' }));
    expect(res.status).toBe(201);
    expect(supabase.capturedPayload().status).toBe('processing');
    expect((await res.json()).model.status).toBe('processing');
  });

  it('con imágenes: se crea directamente en ready (chequeando lo que se insertó de verdad)', async () => {
    vi.mocked(requireAdminUser).mockResolvedValue({ id: 'user-1' } as never);
    const supabase = echoInsertClient(row());
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await POST(jsonRequest(URL_, { title: 'Casa Patio', galleryImages: ['https://x/1.png'] }));
    expect(res.status).toBe(201);
    expect(supabase.capturedPayload().status).toBe('ready');
    expect((await res.json()).model.status).toBe('ready');
    expect(supabase.from).toHaveBeenCalledWith('bim_models');
  });

  it('error de la base: 500 con el mensaje', async () => {
    vi.mocked(requireAdminUser).mockResolvedValue({ id: 'user-1' } as never);
    vi.mocked(createClient).mockResolvedValue(
      mockSupabase({ results: [{ data: null, error: { message: 'insert failed' } }] }) as never
    );
    const res = await POST(jsonRequest(URL_, { title: 'Casa Patio' }));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe('insert failed');
  });

  it('projectId de un proyecto ajeno: 400, no llega a insertar', async () => {
    vi.mocked(requireAdminUser).mockResolvedValue({ id: 'user-1' } as never);
    vi.mocked(requireProjectAccess).mockResolvedValue(null);
    const res = await POST(
      jsonRequest(URL_, { title: 'Casa Patio', projectId: '11111111-1111-4111-8111-111111111111' })
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('No tenés acceso a ese proyecto.');
    expect(createClient).not.toHaveBeenCalled();
  });

  it('projectId de un proyecto propio: se crea normalmente', async () => {
    vi.mocked(requireAdminUser).mockResolvedValue({ id: 'user-1' } as never);
    vi.mocked(requireProjectAccess).mockResolvedValue({ user: { id: 'user-1' }, supabase: {} } as never);
    const projectId = '11111111-1111-4111-8111-111111111111';
    const supabase = echoInsertClient(row());
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await POST(jsonRequest(URL_, { title: 'Casa Patio', projectId }));
    expect(res.status).toBe(201);
    expect(supabase.capturedPayload().project_id).toBe(projectId);
    expect(requireProjectAccess).toHaveBeenCalledWith(projectId);
  });
});
