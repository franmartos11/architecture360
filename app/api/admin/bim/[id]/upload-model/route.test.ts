import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }));
vi.mock('@/data/bim-repository', () => ({ mapBimModelRow: vi.fn((row: { id: string }) => ({ id: row.id })) }));
vi.mock('@/lib/supabase/require-project-access', () => ({
  resolveProjectIdFromBimModel: vi.fn(),
  requireProjectAccess: vi.fn(),
}));

import { createAdminClient } from '@/lib/supabase/admin';
import { resolveProjectIdFromBimModel, requireProjectAccess } from '@/lib/supabase/require-project-access';
import { mockSupabase, jsonRequest } from '@/lib/test-helpers/supabase-mock';
import { POST } from './route';

const ctx = { params: Promise.resolve({ id: 'model-1' }) };
const post = (body: unknown) => POST(jsonRequest('http://localhost/api/admin/bim/model-1/upload-model', body), ctx);

function adminStorage(overrides: Record<string, unknown> = {}) {
  const storage = {
    from: vi.fn(() => ({
      createSignedUploadUrl: vi.fn().mockResolvedValue({ data: { signedUrl: 'https://signed.example/up?token=t', path: 'model-1/model.glb' }, error: null }),
      getPublicUrl: vi.fn((path: string) => ({ data: { publicUrl: `https://x.supabase.co/storage/v1/object/public/bim-models/${path}` } })),
      remove: vi.fn().mockResolvedValue({ error: null }),
      ...overrides,
    })),
  };
  vi.mocked(createAdminClient).mockReturnValue({ storage } as never);
  return storage;
}

function asOwner(results: { data?: unknown; error?: unknown }[] = []) {
  vi.mocked(resolveProjectIdFromBimModel).mockResolvedValue('project-1');
  const supabase = mockSupabase({ results });
  vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'user-1' } } as never);
  return supabase;
}

beforeEach(() => {
  vi.mocked(resolveProjectIdFromBimModel).mockReset();
  vi.mocked(requireProjectAccess).mockReset();
  vi.mocked(createAdminClient).mockReset();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('POST /api/admin/bim/[id]/upload-model', () => {
  it('pieza inexistente: 404', async () => {
    vi.mocked(resolveProjectIdFromBimModel).mockResolvedValue(null);
    expect((await post({ action: 'get-url', ext: 'glb' })).status).toBe(404);
  });

  it('sin acceso al proyecto: 401', async () => {
    vi.mocked(resolveProjectIdFromBimModel).mockResolvedValue('project-1');
    vi.mocked(requireProjectAccess).mockResolvedValue(null);
    expect((await post({ action: 'get-url', ext: 'glb' })).status).toBe(401);
  });

  it('un body que no es JSON o no es un objeto: 400 (antes era un 500)', async () => {
    asOwner();
    expect((await POST(new Request('http://localhost/x', { method: 'POST', body: '{roto' }), ctx)).status).toBe(400);
    expect((await post([1, 2])).status).toBe(400);
  });

  describe('get-url', () => {
    it('extensión válida: devuelve la URL firmada de subida', async () => {
      asOwner([{ data: null }]); // bim_models actual (sin modelo previo)
      adminStorage();
      const res = await post({ action: 'get-url', ext: 'glb' });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ signedUrl: 'https://signed.example/up?token=t', path: 'model-1/model.glb' });
    });

    it.each(['exe', 'glb/../../otro', '', 'GLB'])('extensión %j: 400', async ext => {
      asOwner();
      const res = await post({ action: 'get-url', ext });
      expect(res.status).toBe(400);
    });

    it('ext que no es texto: 400', async () => {
      asOwner();
      expect((await post({ action: 'get-url', ext: { x: 1 } })).status).toBe(400);
      expect((await post({ action: 'get-url' })).status).toBe(400);
    });

    it('si el storage falla: 500 genérico, sin filtrar el mensaje', async () => {
      asOwner([{ data: null }]);
      adminStorage({ createSignedUploadUrl: vi.fn().mockResolvedValue({ data: null, error: { message: 'bucket "bim-models" policy violation' } }) });
      const res = await post({ action: 'get-url', ext: 'glb' });
      expect(res.status).toBe(500);
      expect(JSON.stringify(await res.json())).not.toMatch(/bucket|policy/);
    });
  });

  describe('complete', () => {
    it('extensión válida: guarda la URL pública y devuelve la pieza', async () => {
      const supabase = asOwner([{ data: { id: 'model-1' } }]);
      adminStorage();
      const res = await post({ action: 'complete', ext: 'glb' });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ model: { id: 'model-1' } });
      const update = supabase.from.mock.results[0].value.update.mock.calls[0][0];
      expect(update.geometry_url).toBe('https://x.supabase.co/storage/v1/object/public/bim-models/model-1/model.glb');
      expect(update.status).toBe('ready');
    });

    it.each(['exe', '../../otra-pieza/model.glb', '', undefined])('extensión %j: 400 y no toca la base (antes armaba la ruta con cualquier texto)', async ext => {
      const supabase = asOwner();
      adminStorage();
      const res = await post({ action: 'complete', ext });
      expect(res.status).toBe(400);
      expect(supabase.from).not.toHaveBeenCalled();
    });
  });

  it('acción inválida: 400', async () => {
    asOwner();
    adminStorage();
    expect((await post({ action: 'borrar-todo', ext: 'glb' })).status).toBe(400);
  });
});
