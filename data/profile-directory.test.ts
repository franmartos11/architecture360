import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));

import { createClient } from '@/lib/supabase/server';

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';

type Search = { query?: string; accountType?: 'person' | 'company' };
let searchPortfolioDirectory: (s?: Search) => Promise<{ profiles: unknown[]; hayMas: boolean }>;
let DIRECTORY_PAGE_SIZE: number;

beforeAll(async () => {
  const repo = await import('./profile-repository');
  searchPortfolioDirectory = repo.searchPortfolioDirectory;
  DIRECTORY_PAGE_SIZE = repo.DIRECTORY_PAGE_SIZE;
});

function perfil(i: number) {
  return {
    id: `p${i}`, handle: `h${i}`, display_name: `Perfil ${i}`, account_type: 'person',
    avatar_image: null, bio: null, location: 'CABA', is_indexed: true,
  };
}

/**
 * Registra con qué se llamó cada método del builder, para poder afirmar que
 * el filtrado ocurre en la consulta y no después, en memoria.
 */
function mockDirectoryClient(filas: unknown[]) {
  const llamadas: Record<string, unknown[][]> = { eq: [], or: [], limit: [], order: [] };
  const builder: Record<string, unknown> = {};
  const encadenar = (nombre: string) => (...args: unknown[]) => { llamadas[nombre].push(args); return builder; };

  builder.select = () => builder;
  builder.eq = encadenar('eq');
  builder.or = encadenar('or');
  builder.order = encadenar('order');
  builder.in = () => Promise.resolve({ data: [] });          // conteo de proyectos
  builder.limit = (...args: unknown[]) => { llamadas.limit.push(args); return Promise.resolve({ data: filas }); };

  const from = vi.fn((tabla: string) => {
    if (tabla === 'projects') return { select: () => ({ eq: () => ({ eq: () => ({ in: () => Promise.resolve({ data: [] }) }) }) }) };
    return builder;
  });

  return { client: { from } as never, llamadas };
}

describe('searchPortfolioDirectory', () => {
  beforeEach(() => vi.mocked(createClient).mockReset());

  it('filtra el texto en la consulta, no en memoria', async () => {
    const { client, llamadas } = mockDirectoryClient([perfil(1)]);
    vi.mocked(createClient).mockResolvedValue(client);

    await searchPortfolioDirectory({ query: 'estudio' });

    expect(llamadas.or).toHaveLength(1);
    const filtro = String(llamadas.or[0][0]);
    expect(filtro).toContain('display_name.ilike.%estudio%');
    expect(filtro).toContain('handle.ilike.%estudio%');
    expect(filtro).toContain('location.ilike.%estudio%');
  });

  it('escapa los comodines de LIKE que escriba el usuario', async () => {
    const { client, llamadas } = mockDirectoryClient([]);
    vi.mocked(createClient).mockResolvedValue(client);

    // Sin escapar, un "%" suelto matchea todo y devuelve el directorio entero.
    await searchPortfolioDirectory({ query: '100%' });

    expect(String(llamadas.or[0][0])).toContain('100\\%');
  });

  it('sin término de búsqueda no arma el filtro de texto', async () => {
    const { client, llamadas } = mockDirectoryClient([perfil(1)]);
    vi.mocked(createClient).mockResolvedValue(client);

    await searchPortfolioDirectory({});

    expect(llamadas.or).toHaveLength(0);
  });

  it('un término en blanco cuenta como sin búsqueda', async () => {
    const { client, llamadas } = mockDirectoryClient([perfil(1)]);
    vi.mocked(createClient).mockResolvedValue(client);

    await searchPortfolioDirectory({ query: '   ' });

    expect(llamadas.or).toHaveLength(0);
  });

  it('el tipo de cuenta también se filtra en la consulta', async () => {
    const { client, llamadas } = mockDirectoryClient([perfil(1)]);
    vi.mocked(createClient).mockResolvedValue(client);

    await searchPortfolioDirectory({ accountType: 'company' });

    expect(llamadas.eq).toContainEqual(['account_type', 'company']);
  });

  it('pide una fila de más para saber si hay cola, y no la devuelve', async () => {
    const filas = Array.from({ length: DIRECTORY_PAGE_SIZE + 1 }, (_, i) => perfil(i));
    const { client, llamadas } = mockDirectoryClient(filas);
    vi.mocked(createClient).mockResolvedValue(client);

    const { profiles, hayMas } = await searchPortfolioDirectory({});

    expect(llamadas.limit[0]).toEqual([DIRECTORY_PAGE_SIZE + 1]);
    expect(profiles).toHaveLength(DIRECTORY_PAGE_SIZE);
    expect(hayMas).toBe(true);
  });

  it('si entra todo, hayMas es false', async () => {
    const { client } = mockDirectoryClient([perfil(1), perfil(2)]);
    vi.mocked(createClient).mockResolvedValue(client);

    const { profiles, hayMas } = await searchPortfolioDirectory({});

    expect(profiles).toHaveLength(2);
    expect(hayMas).toBe(false);
  });

  it('sin resultados devuelve vacío sin ir a buscar los conteos', async () => {
    const { client } = mockDirectoryClient([]);
    vi.mocked(createClient).mockResolvedValue(client);

    expect(await searchPortfolioDirectory({ query: 'nadie' })).toEqual({ profiles: [], hayMas: false });
  });
});
