import { describe, it, expect, vi, beforeAll } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));

import { createClient } from '@/lib/supabase/server';
import { mockSupabase } from '@/lib/test-helpers/supabase-mock';
import type { BimModel } from '@/types';
import type { BimModelRow } from '@/types/database';

// Set env vars before dynamically importing the module under test
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';

// Dynamic import to ensure SUPABASE_CONFIGURED is evaluated with env vars set
let mapBimModelRow: (row: BimModelRow) => BimModel;
let getBimModelsByAuthor: (authorId: string) => Promise<BimModel[]>;
let getBimModelById: (id: string) => Promise<BimModel | undefined>;

beforeAll(async () => {
  const bimRepository = await import('./bim-repository');
  mapBimModelRow = bimRepository.mapBimModelRow;
  getBimModelsByAuthor = bimRepository.getBimModelsByAuthor;
  getBimModelById = bimRepository.getBimModelById;
});

const row: BimModelRow = {
  id: 'bim-1',
  author_id: 'user-1',
  project_id: null,
  title: 'Casa Patio',
  description: null,
  source_format: null,
  source_url: null,
  geometry_url: null,
  properties_url: null,
  gallery_images: ['https://x/1.png'],
  cover_image: null,
  stats: null,
  status: 'ready',
  error_message: null,
  is_public: true,
  created_at: '2026-09-14T10:00:00Z',
  updated_at: '2026-09-14T10:00:00Z',
};

describe('mapBimModelRow', () => {
  it('pasa snake_case a camelCase y normaliza los nulos de texto a string vacío', () => {
    const model = mapBimModelRow(row);
    expect(model.id).toBe('bim-1');
    expect(model.authorId).toBe('user-1');
    expect(model.projectId).toBeNull();
    expect(model.description).toBe('');
    expect(model.galleryImages).toEqual(['https://x/1.png']);
    expect(model.isPublic).toBe(true);
  });

  it('conserva los nulos de las columnas de archivo — distinguir "no hay modelo" de "" importa para canPublishBimModel', () => {
    const model = mapBimModelRow(row);
    expect(model.geometryUrl).toBeNull();
    expect(model.coverImage).toBeNull();
  });
});

describe('getBimModelsByAuthor', () => {
  beforeAll(() => {
    vi.mocked(createClient).mockReset();
  });

  it('devuelve las piezas mapeadas', async () => {
    vi.mocked(createClient).mockResolvedValue(mockSupabase({ results: [{ data: [row] }] }) as never);
    const models = await getBimModelsByAuthor('user-1');
    expect(models).toHaveLength(1);
    expect(models[0].title).toBe('Casa Patio');
  });

  it('sin filas: array vacío, no undefined', async () => {
    vi.mocked(createClient).mockResolvedValue(mockSupabase({ results: [{ data: null }] }) as never);
    expect(await getBimModelsByAuthor('user-1')).toEqual([]);
  });
});

describe('getBimModelById', () => {
  beforeAll(() => {
    vi.mocked(createClient).mockReset();
  });

  it('pieza inexistente (o que RLS oculta): undefined', async () => {
    vi.mocked(createClient).mockResolvedValue(mockSupabase({ results: [{ data: null }] }) as never);
    expect(await getBimModelById('bim-404')).toBeUndefined();
  });

  it('pieza visible: la devuelve mapeada', async () => {
    vi.mocked(createClient).mockResolvedValue(mockSupabase({ results: [{ data: row }] }) as never);
    expect((await getBimModelById('bim-1'))?.title).toBe('Casa Patio');
  });
});
