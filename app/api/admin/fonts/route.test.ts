import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/require-admin', () => ({ requireAdminUser: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }));

import { requireAdminUser } from '@/lib/supabase/require-admin';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { mockSupabase } from '@/lib/test-helpers/supabase-mock';
import { GET, POST } from './route';

function postRequest(fields: Record<string, string | File>) {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return new Request('http://localhost/api/admin/fonts', { method: 'POST', body: fd });
}

describe('GET /api/admin/fonts', () => {
  beforeEach(() => {
    vi.mocked(requireAdminUser).mockReset();
    vi.mocked(createClient).mockReset();
  });

  it('sin sesión: 401', async () => {
    vi.mocked(requireAdminUser).mockResolvedValue(null as never);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it('devuelve las fuentes del dueño', async () => {
    vi.mocked(requireAdminUser).mockResolvedValue({ id: 'user-1' } as never);
    const supabase = mockSupabase({ results: [{ data: [{ id: 'font-1', name: 'Mi Fuente' }] }] });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ fonts: [{ id: 'font-1', name: 'Mi Fuente' }] });
  });

  it('sin fuentes: [] en vez de null', async () => {
    vi.mocked(requireAdminUser).mockResolvedValue({ id: 'user-1' } as never);
    const supabase = mockSupabase({ results: [{ data: null }] });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await GET();
    expect(await res.json()).toEqual({ fonts: [] });
  });

  it('error de la base: 500', async () => {
    vi.mocked(requireAdminUser).mockResolvedValue({ id: 'user-1' } as never);
    const supabase = mockSupabase({ results: [{ data: null, error: { message: 'db down' } }] });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await GET();
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe('db down');
  });
});

describe('POST /api/admin/fonts', () => {
  beforeEach(() => {
    vi.mocked(requireAdminUser).mockReset();
    vi.mocked(createClient).mockReset();
    vi.mocked(createAdminClient).mockReset();
  });

  it('sin sesión: 401', async () => {
    vi.mocked(requireAdminUser).mockResolvedValue(null as never);
    const res = await POST(postRequest({ name: 'Mi Fuente' }));
    expect(res.status).toBe(401);
  });

  it('falta el archivo: 400', async () => {
    vi.mocked(requireAdminUser).mockResolvedValue({ id: 'user-1' } as never);
    const res = await POST(postRequest({ name: 'Mi Fuente' }));
    expect(res.status).toBe(400);
  });

  it('falta el nombre: 400', async () => {
    vi.mocked(requireAdminUser).mockResolvedValue({ id: 'user-1' } as never);
    const file = new File(['abc'], 'font.woff2', { type: 'font/woff2' });
    const res = await POST(postRequest({ file, name: '' }));
    expect(res.status).toBe(400);
  });

  it('tipo de archivo no permitido: 400', async () => {
    vi.mocked(requireAdminUser).mockResolvedValue({ id: 'user-1' } as never);
    const file = new File(['abc'], 'font.txt', { type: 'text/plain' });
    const res = await POST(postRequest({ file, name: 'Mi Fuente' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/no permitido/);
  });

  it('archivo demasiado pesado: 400', async () => {
    vi.mocked(requireAdminUser).mockResolvedValue({ id: 'user-1' } as never);
    // Multipart real: un tamaño simulado con defineProperty no sobrevive el
    // roundtrip por FormData/Request, así que hace falta un buffer de verdad.
    const bigBytes = new Uint8Array(5 * 1024 * 1024 + 1);
    const file = new File([bigBytes], 'font.woff2', { type: 'font/woff2' });
    const res = await POST(postRequest({ file, name: 'Mi Fuente' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/pesa más/);
  });

  it('falla la subida al storage: 500, no llega a insertar', async () => {
    vi.mocked(requireAdminUser).mockResolvedValue({ id: 'user-1' } as never);
    const admin = mockSupabase({ storage: { upload: { error: { message: 'upload failed' } } } });
    vi.mocked(createAdminClient).mockReturnValue(admin as never);
    const supabase = mockSupabase({ results: [] });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const file = new File(['abc'], 'font.woff2', { type: 'font/woff2' });
    const res = await POST(postRequest({ file, name: 'Mi Fuente' }));
    expect(res.status).toBe(500);
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('error de la base al insertar el registro: 500', async () => {
    vi.mocked(requireAdminUser).mockResolvedValue({ id: 'user-1' } as never);
    const admin = mockSupabase({
      storage: { getPublicUrl: { data: { publicUrl: 'https://cdn.test/fonts/font.woff2' } } },
    });
    vi.mocked(createAdminClient).mockReturnValue(admin as never);
    const supabase = mockSupabase({ results: [{ data: null, error: { message: 'insert failed' } }] });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const file = new File(['abc'], 'font.woff2', { type: 'font/woff2' });
    const res = await POST(postRequest({ file, name: 'Mi Fuente' }));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe('insert failed');
  });

  it('alta válida: sube, registra y devuelve la fuente creada', async () => {
    vi.mocked(requireAdminUser).mockResolvedValue({ id: 'user-1' } as never);
    const admin = mockSupabase({
      storage: { getPublicUrl: { data: { publicUrl: 'https://cdn.test/fonts/font.woff2' } } },
    });
    vi.mocked(createAdminClient).mockReturnValue(admin as never);
    const supabase = mockSupabase({
      results: [{ data: { id: 'font-1', name: 'Mi Fuente', file_url: 'https://cdn.test/fonts/font.woff2', format: 'woff2' } }],
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const file = new File(['abc'], 'font.woff2', { type: 'font/woff2' });
    const res = await POST(postRequest({ file, name: 'Mi Fuente' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ font: { id: 'font-1', name: 'Mi Fuente', file_url: 'https://cdn.test/fonts/font.woff2', format: 'woff2' } });
  });
});
