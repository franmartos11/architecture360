import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/require-admin', () => ({ requireAdminUser: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }));
vi.mock('@/lib/supabase/delete-bim-storage', () => ({ deleteBimStorageFiles: vi.fn() }));
vi.mock('@/lib/supabase/require-project-access', () => ({ requireProjectAccess: vi.fn() }));

import { requireAdminUser } from '@/lib/supabase/require-admin';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { deleteBimStorageFiles } from '@/lib/supabase/delete-bim-storage';
import { requireProjectAccess } from '@/lib/supabase/require-project-access';
import { mockSupabase, jsonRequest } from '@/lib/test-helpers/supabase-mock';
import { PATCH, DELETE } from './route';

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

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

const URL_ = 'http://localhost/api/admin/bim/bim-1';

/**
 * Cliente que devuelve `current` en la primera llamada a `.from()` (la
 * lectura de loadOwn) y, en la segunda, ECOA lo que la ruta pasó a
 * `.update(...)` fusionado sobre `current` — así los asserts de status/
 * cover_image (finding item 5) chequean lo que la ruta CALCULÓ de
 * verdad, no un valor canned que el mock fue instruido a devolver.
 */
function echoUpdateClient(current: Record<string, unknown>) {
  let payload: Record<string, unknown> = {};
  let call = 0;
  const from = vi.fn(() => {
    const thisCall = call++;
    const proxy: unknown = new Proxy(() => {}, {
      get(_t, prop) {
        if (prop === 'update') {
          return (p: unknown) => {
            payload = p as Record<string, unknown>;
            return proxy;
          };
        }
        if (prop === 'single' || prop === 'maybeSingle') {
          return () =>
            Promise.resolve(
              thisCall === 0 ? { data: current, error: null } : { data: { ...current, ...payload }, error: null }
            );
        }
        if (prop === 'then') {
          return (resolve: (r: unknown) => void) =>
            resolve(thisCall === 0 ? { data: current, error: null } : { data: { ...current, ...payload }, error: null });
        }
        return (..._args: unknown[]) => proxy;
      },
    });
    return proxy;
  });
  return { from, capturedPayload: () => payload };
}

describe('PATCH /api/admin/bim/[id]', () => {
  beforeEach(() => {
    vi.mocked(requireAdminUser).mockReset();
    vi.mocked(createClient).mockReset();
    vi.mocked(requireProjectAccess).mockReset();
  });

  it('sin sesión: 401', async () => {
    vi.mocked(requireAdminUser).mockResolvedValue(null as never);
    const res = await PATCH(jsonRequest(URL_, { title: 'X' }, { method: 'PATCH' }), params('bim-1'));
    expect(res.status).toBe(401);
  });

  it('pieza de otro autor (RLS la oculta): 404', async () => {
    vi.mocked(requireAdminUser).mockResolvedValue({ id: 'user-1' } as never);
    vi.mocked(createClient).mockResolvedValue(mockSupabase({ results: [{ data: null }] }) as never);
    const res = await PATCH(jsonRequest(URL_, { title: 'X' }, { method: 'PATCH' }), params('bim-1'));
    expect(res.status).toBe(404);
  });

  // Finding 1: bim_models tiene una política RLS de lectura PÚBLICA
  // (is_public=true, status='ready'), así que una pieza ajena YA
  // PUBLICADA sigue siendo visible para el cliente de sesión de
  // cualquier usuario logueado. loadOwn ahora filtra por author_id
  // además del id, así que este caso (que antes se colaba) también da
  // 404 — y, crucialmente, no debe llegar a tocar storage.
  it('pieza ajena PERO pública y ready (visible por RLS): 404 igual, por author_id', async () => {
    vi.mocked(requireAdminUser).mockResolvedValue({ id: 'user-1' } as never);
    // El mock representa lo que devuelve .eq('id', id).eq('author_id', 'user-1'):
    // null, porque la fila real es de 'otro-user' aunque sea pública/ready.
    vi.mocked(createClient).mockResolvedValue(mockSupabase({ results: [{ data: null }] }) as never);
    const res = await PATCH(jsonRequest(URL_, { title: 'Hackeada' }, { method: 'PATCH' }), params('bim-1'));
    expect(res.status).toBe(404);
  });

  it('agregar la primera imagen a una pieza vacía la pasa a ready y le pone portada (chequeando el update real)', async () => {
    vi.mocked(requireAdminUser).mockResolvedValue({ id: 'user-1' } as never);
    const supabase = echoUpdateClient(row());
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await PATCH(
      jsonRequest(URL_, { galleryImages: ['https://x/1.png'] }, { method: 'PATCH' }),
      params('bim-1')
    );
    expect(res.status).toBe(200);
    expect(supabase.capturedPayload().status).toBe('ready');
    expect(supabase.capturedPayload().cover_image).toBe('https://x/1.png');
    const { model } = await res.json();
    expect(model.status).toBe('ready');
    expect(model.coverImage).toBe('https://x/1.png');
  });

  it('sacar la última imagen de una pieza sin modelo la devuelve a processing (chequeando el update real)', async () => {
    vi.mocked(requireAdminUser).mockResolvedValue({ id: 'user-1' } as never);
    const supabase = echoUpdateClient(
      row({ status: 'ready', gallery_images: ['https://x/1.png'], cover_image: 'https://x/1.png' })
    );
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await PATCH(jsonRequest(URL_, { galleryImages: [] }, { method: 'PATCH' }), params('bim-1'));
    expect(supabase.capturedPayload().status).toBe('processing');
    expect((await res.json()).model.status).toBe('processing');
  });

  it('con modelo cargado, sacar todas las imágenes NO la saca de ready (chequeando el update real)', async () => {
    vi.mocked(requireAdminUser).mockResolvedValue({ id: 'user-1' } as never);
    const withModel = row({ status: 'ready', geometry_url: 'https://x/m.frag', gallery_images: ['https://x/1.png'] });
    const supabase = echoUpdateClient(withModel);
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await PATCH(jsonRequest(URL_, { galleryImages: [] }, { method: 'PATCH' }), params('bim-1'));
    expect(supabase.capturedPayload().status).toBe('ready');
    expect((await res.json()).model.status).toBe('ready');
  });

  // Finding 5(d): una pieza fallida no debe volver a 'ready'/'processing'
  // por el solo hecho de editarle la galería — eso lo resuelve reintentar
  // la conversión (Fase 2), no un PATCH cualquiera.
  it('pieza failed: una edición de galería no le cambia el status (chequeando el update real)', async () => {
    vi.mocked(requireAdminUser).mockResolvedValue({ id: 'user-1' } as never);
    const failed = row({ status: 'failed', gallery_images: [], cover_image: null });
    const supabase = echoUpdateClient(failed);
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await PATCH(
      jsonRequest(URL_, { galleryImages: ['https://x/1.png'] }, { method: 'PATCH' }),
      params('bim-1')
    );
    expect(supabase.capturedPayload().status).toBe('failed');
    expect((await res.json()).model.status).toBe('failed');
  });

  it('projectId de un proyecto ajeno: 400, no llega a actualizar', async () => {
    vi.mocked(requireAdminUser).mockResolvedValue({ id: 'user-1' } as never);
    vi.mocked(requireProjectAccess).mockResolvedValue(null);
    const supabase = mockSupabase({ results: [{ data: row() }] }); // solo la lectura de loadOwn
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await PATCH(
      jsonRequest(URL_, { projectId: '11111111-1111-4111-8111-111111111111' }, { method: 'PATCH' }),
      params('bim-1')
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('No tenés acceso a ese proyecto.');
  });

  it('projectId de un proyecto propio: se actualiza normalmente', async () => {
    vi.mocked(requireAdminUser).mockResolvedValue({ id: 'user-1' } as never);
    vi.mocked(requireProjectAccess).mockResolvedValue({ user: { id: 'user-1' }, supabase: {} } as never);
    const projectId = '11111111-1111-4111-8111-111111111111';
    const supabase = echoUpdateClient(row());
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await PATCH(jsonRequest(URL_, { projectId }, { method: 'PATCH' }), params('bim-1'));
    expect(res.status).toBe(200);
    expect(supabase.capturedPayload().project_id).toBe(projectId);
    expect(requireProjectAccess).toHaveBeenCalledWith(projectId);
  });

  it('projectId: null no dispara el chequeo de acceso (es desvincular, no asociar)', async () => {
    vi.mocked(requireAdminUser).mockResolvedValue({ id: 'user-1' } as never);
    const supabase = echoUpdateClient(row({ project_id: 'algun-proyecto' }));
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await PATCH(jsonRequest(URL_, { projectId: null }, { method: 'PATCH' }), params('bim-1'));
    expect(res.status).toBe(200);
    expect(requireProjectAccess).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/admin/bim/[id]', () => {
  beforeEach(() => {
    vi.mocked(requireAdminUser).mockReset();
    vi.mocked(createClient).mockReset();
    vi.mocked(createAdminClient).mockReset();
    vi.mocked(deleteBimStorageFiles).mockReset().mockResolvedValue(undefined);
  });

  it('borra los archivos ANTES que la fila', async () => {
    vi.mocked(requireAdminUser).mockResolvedValue({ id: 'user-1' } as never);
    const supabase = mockSupabase({
      results: [{ data: row({ gallery_images: ['https://x/1.png'] }) }, { error: null }],
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);
    const admin = mockSupabase({});
    vi.mocked(createAdminClient).mockReturnValue(admin as never);

    const res = await DELETE(new Request(URL_, { method: 'DELETE' }), params('bim-1'));
    expect(res.status).toBe(200);
    expect(deleteBimStorageFiles).toHaveBeenCalledTimes(1);
  });

  it('pieza inexistente o ajena: 404, no borra archivos', async () => {
    vi.mocked(requireAdminUser).mockResolvedValue({ id: 'user-1' } as never);
    vi.mocked(createClient).mockResolvedValue(mockSupabase({ results: [{ data: null }] }) as never);
    const res = await DELETE(new Request(URL_, { method: 'DELETE' }), params('bim-1'));
    expect(res.status).toBe(404);
    expect(deleteBimStorageFiles).not.toHaveBeenCalled();
  });

  // Finding 1 (el caso crítico): sin el fix, loadOwn habría devuelto esta
  // fila (pública, ready, de otro autor — visible para cualquiera vía la
  // política RLS de lectura pública) como si fuera propia, y DELETE
  // habría llamado a deleteBimStorageFiles con el cliente ADMIN (que
  // bypassea RLS) antes de que el borrado de la fila fallara en
  // silencio por la política de escritura. Con el fix, loadOwn filtra
  // por author_id y esta pieza directamente no aparece.
  it('pieza ajena PERO pública y ready (visible por RLS): 404, y sobre todo NO borra sus archivos', async () => {
    vi.mocked(requireAdminUser).mockResolvedValue({ id: 'user-1' } as never);
    // Representa lo que devuelve .eq('id', id).eq('author_id', 'user-1')
    // para una fila real de 'otro-user': null, aunque sea pública/ready.
    vi.mocked(createClient).mockResolvedValue(mockSupabase({ results: [{ data: null }] }) as never);
    const res = await DELETE(new Request(URL_, { method: 'DELETE' }), params('bim-1'));
    expect(res.status).toBe(404);
    expect(deleteBimStorageFiles).not.toHaveBeenCalled();
    expect(createAdminClient).not.toHaveBeenCalled();
  });
});
