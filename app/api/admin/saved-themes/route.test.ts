import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/require-admin', () => ({ requireAdminUser: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));

import { requireAdminUser } from '@/lib/supabase/require-admin';
import { createClient } from '@/lib/supabase/server';
import { mockSupabase, jsonRequest } from '@/lib/test-helpers/supabase-mock';
import { GET, POST } from './route';

describe('GET /api/admin/saved-themes', () => {
  beforeEach(() => {
    vi.mocked(requireAdminUser).mockReset();
    vi.mocked(createClient).mockReset();
  });

  it('sin sesión: 401', async () => {
    vi.mocked(requireAdminUser).mockResolvedValue(null as never);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it('devuelve los temas guardados del dueño', async () => {
    vi.mocked(requireAdminUser).mockResolvedValue({ id: 'user-1' } as never);
    const supabase = mockSupabase({ results: [{ data: [{ id: 'theme-1', name: 'Oscuro' }] }] });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ themes: [{ id: 'theme-1', name: 'Oscuro' }] });
  });

  it('sin temas: [] en vez de null', async () => {
    vi.mocked(requireAdminUser).mockResolvedValue({ id: 'user-1' } as never);
    const supabase = mockSupabase({ results: [{ data: null }] });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await GET();
    expect(await res.json()).toEqual({ themes: [] });
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

describe('POST /api/admin/saved-themes', () => {
  beforeEach(() => {
    vi.mocked(requireAdminUser).mockReset();
    vi.mocked(createClient).mockReset();
  });

  it('sin sesión: 401', async () => {
    vi.mocked(requireAdminUser).mockResolvedValue(null as never);
    const res = await POST(jsonRequest('http://localhost/api/admin/saved-themes', { name: 'Oscuro', config: { preset: 'dark' } }));
    expect(res.status).toBe(401);
  });

  it('falta el nombre: 400 antes de tocar la base', async () => {
    vi.mocked(requireAdminUser).mockResolvedValue({ id: 'user-1' } as never);
    const supabase = mockSupabase({ results: [] });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await POST(jsonRequest('http://localhost/api/admin/saved-themes', { name: '', config: { preset: 'dark' } }));
    expect(res.status).toBe(400);
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('falta la config: 400', async () => {
    vi.mocked(requireAdminUser).mockResolvedValue({ id: 'user-1' } as never);
    const res = await POST(jsonRequest('http://localhost/api/admin/saved-themes', { name: 'Oscuro' }));
    expect(res.status).toBe(400);
  });

  it('config no es un objeto: 400', async () => {
    vi.mocked(requireAdminUser).mockResolvedValue({ id: 'user-1' } as never);
    const res = await POST(jsonRequest('http://localhost/api/admin/saved-themes', { name: 'Oscuro', config: 'dark' }));
    expect(res.status).toBe(400);
  });

  it('error de la base al insertar: 500', async () => {
    vi.mocked(requireAdminUser).mockResolvedValue({ id: 'user-1' } as never);
    const supabase = mockSupabase({ results: [{ data: null, error: { message: 'insert failed' } }] });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await POST(jsonRequest('http://localhost/api/admin/saved-themes', { name: 'Oscuro', config: { preset: 'dark' } }));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe('insert failed');
  });

  it('alta válida: inserta y devuelve el tema creado', async () => {
    vi.mocked(requireAdminUser).mockResolvedValue({ id: 'user-1' } as never);
    const supabase = mockSupabase({ results: [{ data: { id: 'theme-1', name: 'Oscuro', config: { preset: 'dark' } } }] });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await POST(jsonRequest('http://localhost/api/admin/saved-themes', { name: 'Oscuro', config: { preset: 'dark' } }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ theme: { id: 'theme-1', name: 'Oscuro', config: { preset: 'dark' } } });
  });
});
