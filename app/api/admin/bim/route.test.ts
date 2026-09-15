import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/require-project-access', () => ({
  resolveRequestedProjectId: vi.fn(),
  requireProjectAccess: vi.fn(),
}));

import { resolveRequestedProjectId, requireProjectAccess } from '@/lib/supabase/require-project-access';
import { mockSupabase, jsonRequest } from '@/lib/test-helpers/supabase-mock';
import { GET, POST } from './route';

const URL_ = 'http://localhost/api/admin/bim';

function row(over: Record<string, unknown> = {}) {
  return {
    id: 'bim-1', project_id: 'project-1', title: 'Casa Patio',
    description: null, source_format: null, source_url: null, geometry_url: null,
    properties_url: null, gallery_images: [], cover_image: null, stats: null,
    status: 'processing', error_message: null, is_public: true,
    created_at: '2026-09-14T10:00:00Z', updated_at: '2026-09-14T10:00:00Z',
    ...over,
  };
}

/**
 * Cliente que ECOA lo que la ruta realmente pasó a `.insert(...)`
 * fusionado sobre una fila base — para verificar lo que la ruta CALCULÓ
 * (status/cover_image), no lo que un mock canned devolvería igual.
 */
function echoInsertClient(base: Record<string, unknown>) {
  let payload: Record<string, unknown> = {};
  const from = vi.fn(() => {
    const proxy: unknown = new Proxy(() => {}, {
      get(_t, prop) {
        if (prop === 'insert') {
          return (p: unknown) => { payload = p as Record<string, unknown>; return proxy; };
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

describe('GET /api/admin/bim', () => {
  beforeEach(() => {
    vi.mocked(resolveRequestedProjectId).mockReset();
    vi.mocked(requireProjectAccess).mockReset();
  });

  it('sin proyecto activo: 404', async () => {
    vi.mocked(resolveRequestedProjectId).mockResolvedValue(null);
    const res = await GET(new Request(URL_));
    expect(res.status).toBe(404);
    expect(requireProjectAccess).not.toHaveBeenCalled();
  });

  it('proyecto ajeno: 401', async () => {
    vi.mocked(resolveRequestedProjectId).mockResolvedValue('project-1');
    vi.mocked(requireProjectAccess).mockResolvedValue(null);
    const res = await GET(new Request(URL_));
    expect(res.status).toBe(401);
  });

  it('lista las piezas del proyecto activo', async () => {
    vi.mocked(resolveRequestedProjectId).mockResolvedValue('project-1');
    vi.mocked(requireProjectAccess).mockResolvedValue({ user: { id: 'user-1' }, supabase: mockSupabase({ results: [{ data: [row()] }] }) } as never);
    const res = await GET(new Request(URL_));
    expect(res.status).toBe(200);
    const { models } = await res.json();
    expect(models).toHaveLength(1);
    expect(models[0].projectId).toBe('project-1');
  });
});

describe('POST /api/admin/bim', () => {
  beforeEach(() => {
    vi.mocked(resolveRequestedProjectId).mockReset();
    vi.mocked(requireProjectAccess).mockReset();
  });

  it('sin proyecto activo: 404', async () => {
    vi.mocked(resolveRequestedProjectId).mockResolvedValue(null);
    const res = await POST(jsonRequest(URL_, { title: 'Casa Patio' }));
    expect(res.status).toBe(404);
  });

  it('proyecto ajeno: 401', async () => {
    vi.mocked(resolveRequestedProjectId).mockResolvedValue('project-1');
    vi.mocked(requireProjectAccess).mockResolvedValue(null);
    const res = await POST(jsonRequest(URL_, { title: 'Casa Patio' }));
    expect(res.status).toBe(401);
  });

  it('sin título: 400', async () => {
    vi.mocked(resolveRequestedProjectId).mockResolvedValue('project-1');
    vi.mocked(requireProjectAccess).mockResolvedValue({ user: { id: 'user-1' }, supabase: {} } as never);
    const res = await POST(jsonRequest(URL_, { title: '   ' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Falta el título.');
  });

  it('más imágenes que el tope: 400 con el número concreto', async () => {
    vi.mocked(resolveRequestedProjectId).mockResolvedValue('project-1');
    vi.mocked(requireProjectAccess).mockResolvedValue({ user: { id: 'user-1' }, supabase: {} } as never);
    const galleryImages = Array.from({ length: 31 }, (_, i) => `https://x/${i}.png`);
    const res = await POST(jsonRequest(URL_, { title: 'Casa', galleryImages }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain('30');
  });

  it('pieza vacía: se crea en processing, asociada al proyecto activo', async () => {
    vi.mocked(resolveRequestedProjectId).mockResolvedValue('project-1');
    const supabase = echoInsertClient(row());
    vi.mocked(requireProjectAccess).mockResolvedValue({ user: { id: 'user-1' }, supabase } as never);

    const res = await POST(jsonRequest(URL_, { title: 'Casa Patio' }));
    expect(res.status).toBe(201);
    expect(supabase.capturedPayload().project_id).toBe('project-1');
    expect(supabase.capturedPayload().status).toBe('processing');
    expect(supabase.capturedPayload()).not.toHaveProperty('author_id');
  });

  it('con imágenes: se crea directamente en ready', async () => {
    vi.mocked(resolveRequestedProjectId).mockResolvedValue('project-1');
    const supabase = echoInsertClient(row());
    vi.mocked(requireProjectAccess).mockResolvedValue({ user: { id: 'user-1' }, supabase } as never);

    const res = await POST(jsonRequest(URL_, { title: 'Casa Patio', galleryImages: ['https://x/1.png'] }));
    expect(res.status).toBe(201);
    expect(supabase.capturedPayload().status).toBe('ready');
  });
});
