import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));

import { createClient } from '@/lib/supabase/server';
import { mockSupabase } from '@/lib/test-helpers/supabase-mock';
import { GET } from './route';

const FULL_PROFILE = {
  handle: 'ana-perez',
  display_name: 'Ana Pérez',
  account_type: 'person',
  headline: 'Arquitecta · Vivienda',
  license: 'CAC 12.345',
  availability: 'open',
  location: 'Córdoba, Argentina',
  bio: 'Arquitecta con base en Córdoba.',
  specialties: ['Vivienda unifamiliar'],
  languages: ['Español'],
  skills: [{ label: 'Revit', level: 3 }],
  experiences: [{ company: 'Estudio X', role: 'Arquitecta', startYear: '2021', endYear: '', description: '' }],
  education: [{ institution: 'FAPyD', career: 'Arquitectura', startYear: '2014', endYear: '2020' }],
  certifications: [],
  awards: [],
};

describe('GET /api/admin/profile/cv', () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset();
  });

  it('sin sesión: 401', async () => {
    const supabase = mockSupabase({ user: null, results: [] });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await GET();
    expect(res.status).toBe(401);
  });

  it('sin perfil creado: 400', async () => {
    const supabase = mockSupabase({ user: { id: 'user-1' }, results: [{ data: null }] });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await GET();
    expect(res.status).toBe(400);
  });

  it('feliz: devuelve un PDF descargable', async () => {
    const supabase = mockSupabase({
      user: { id: 'user-1' },
      results: [
        { data: FULL_PROFILE }, // .from('profiles')...maybeSingle()
        { data: [{ name: 'Torre Aldea' }] }, // .from('projects')
      ],
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/pdf');
    expect(res.headers.get('content-disposition')).toContain('ana-perez-cv.pdf');
    const buf = await res.arrayBuffer();
    // Encabezado estándar de PDF ("%PDF-") — alcanza para confirmar que
    // react-pdf realmente generó un documento y no un buffer vacío/roto.
    expect(Buffer.from(buf.slice(0, 5)).toString('ascii')).toBe('%PDF-');
  }, 15000);

  it('cuenta de estudio (sin experiencia/educación): igual genera el PDF', async () => {
    const supabase = mockSupabase({
      user: { id: 'user-1' },
      results: [
        { data: { ...FULL_PROFILE, account_type: 'company', experiences: [], education: [] } },
        { data: [] },
      ],
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await GET();
    expect(res.status).toBe(200);
  }, 15000);
});
