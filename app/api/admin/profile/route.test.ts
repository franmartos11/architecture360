import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));

import { createClient } from '@/lib/supabase/server';
import { mockSupabase, jsonRequest } from '@/lib/test-helpers/supabase-mock';
import { GET, PATCH } from './route';

describe('GET /api/admin/profile', () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset();
  });

  it('sin sesión: 401', async () => {
    const supabase = mockSupabase({ user: null, results: [] });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await GET();
    expect(res.status).toBe(401);
  });

  it('con sesión pero sin perfil creado todavía: { profile: null }', async () => {
    const supabase = mockSupabase({ user: { id: 'user-1' }, results: [{ data: null }] });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ profile: null });
  });

  it('con perfil existente: lo devuelve', async () => {
    const supabase = mockSupabase({
      user: { id: 'user-1' },
      results: [{ data: { id: 'user-1', handle: 'ana' } }],
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ profile: { id: 'user-1', handle: 'ana' } });
  });

  it('error de la base: 500', async () => {
    const supabase = mockSupabase({ user: { id: 'user-1' }, results: [{ error: { message: 'db down' } }] });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await GET();
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe('db down');
  });
});

describe('PATCH /api/admin/profile', () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset();
  });

  it('sin sesión: 401', async () => {
    const supabase = mockSupabase({ user: null, results: [] });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await PATCH(jsonRequest('http://localhost/api/admin/profile', { displayName: 'Ana' }));
    expect(res.status).toBe(401);
  });

  it('email de contacto mal formado: 400 antes de tocar la base', async () => {
    const supabase = mockSupabase({ user: { id: 'user-1' }, results: [] });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await PATCH(jsonRequest('http://localhost/api/admin/profile', { contactEmail: 'no-es-email' }));
    expect(res.status).toBe(400);
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('perfil nuevo: genera un handle único a partir del nombre y lo crea', async () => {
    const supabase = mockSupabase({
      user: { id: 'user-1' },
      results: [
        { data: null }, // .from('profiles').select('handle')...maybeSingle() -> no existe fila
        { data: [] }, // ensureUniqueSlug: .from('profiles').select('handle').like(...) -> sin colisiones
        { data: { id: 'user-1', handle: 'ana-perez', display_name: 'Ana Pérez' }, error: null }, // upsert
      ],
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await PATCH(jsonRequest('http://localhost/api/admin/profile', { displayName: 'Ana Pérez' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ profile: { id: 'user-1', handle: 'ana-perez', display_name: 'Ana Pérez' } });
    expect(supabase.from).toHaveBeenCalledTimes(3);
  });

  it('perfil existente: conserva el handle ya asignado, no genera uno nuevo', async () => {
    const supabase = mockSupabase({
      user: { id: 'user-1' },
      results: [
        { data: { handle: 'ana-perez' } }, // ya tiene handle
        { data: { id: 'user-1', handle: 'ana-perez' }, error: null }, // upsert directo
      ],
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await PATCH(jsonRequest('http://localhost/api/admin/profile', { bio: 'Arquitecta' }));
    expect(res.status).toBe(200);
    expect(supabase.from).toHaveBeenCalledTimes(2);
  });

  it('handle duplicado (23505): 409', async () => {
    const supabase = mockSupabase({
      user: { id: 'user-1' },
      results: [
        { data: { handle: 'ana-perez' } },
        { error: { code: '23505', message: 'duplicate key' } },
      ],
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await PATCH(jsonRequest('http://localhost/api/admin/profile', { bio: 'x' }));
    expect(res.status).toBe(409);
  });

  it('error genérico de la base al guardar: 500', async () => {
    const supabase = mockSupabase({
      user: { id: 'user-1' },
      results: [
        { data: { handle: 'ana-perez' } },
        { error: { message: 'db down' } },
      ],
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await PATCH(jsonRequest('http://localhost/api/admin/profile', { bio: 'x' }));
    expect(res.status).toBe(500);
  });

  it('featuredProjectId ajeno: 403, no llega a guardar', async () => {
    const supabase = mockSupabase({
      user: { id: 'user-1' },
      results: [
        { data: { handle: 'ana-perez' } },
        { data: null }, // .from('projects')...maybeSingle() -> no es dueña
      ],
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await PATCH(jsonRequest('http://localhost/api/admin/profile', { bio: 'x', featuredProjectId: '11111111-1111-4111-8111-111111111111' }));
    expect(res.status).toBe(403);
    expect(supabase.from).toHaveBeenCalledTimes(2);
  });

  it('featuredProjectId propio: lo guarda', async () => {
    const PROJECT_ID = '11111111-1111-4111-8111-111111111111';
    const supabase = mockSupabase({
      user: { id: 'user-1' },
      results: [
        { data: { handle: 'ana-perez' } },
        { data: { id: PROJECT_ID } }, // es dueña
        { data: { id: 'user-1', handle: 'ana-perez', featured_project_id: PROJECT_ID }, error: null },
      ],
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await PATCH(jsonRequest('http://localhost/api/admin/profile', { bio: 'x', featuredProjectId: PROJECT_ID }));
    expect(res.status).toBe(200);
  });

  it('nuevos campos del editor (headline, disponibilidad, especialidades, aptitudes con nivel, premios, visibilidad): no rompen la validación ni el guardado', async () => {
    const supabase = mockSupabase({
      user: { id: 'user-1' },
      results: [
        { data: { handle: 'ana-perez' } },
        { data: { id: 'user-1', handle: 'ana-perez' }, error: null },
      ],
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await PATCH(jsonRequest('http://localhost/api/admin/profile', {
      bio: 'x',
      headline: 'Arquitecto · Vivienda',
      license: 'CAC 12.345',
      availability: 'hiring',
      specialties: ['Vivienda unifamiliar'],
      languages: ['Español', 'Inglés'],
      skills: [{ label: 'Revit', level: 3 }],
      awards: [{ name: 'Mención', year: '2026' }],
      isPublic: false,
      showContact: false,
      isIndexed: false,
    }));
    expect(res.status).toBe(200);
  });

  it('availability inválida: 400', async () => {
    const supabase = mockSupabase({ user: { id: 'user-1' }, results: [] });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await PATCH(jsonRequest('http://localhost/api/admin/profile', { availability: 'de-vacaciones' }));
    expect(res.status).toBe(400);
    expect(supabase.from).not.toHaveBeenCalled();
  });
});
