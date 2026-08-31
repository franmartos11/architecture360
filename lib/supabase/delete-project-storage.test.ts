import { describe, it, expect, vi } from 'vitest';
import { deleteProjectStorageFiles } from './delete-project-storage';

vi.mock('server-only', () => ({}));

// Fake query builder encadenable y thenable (select/eq/in, y maybeSingle
// como terminal alternativo) — cubre tanto la fila única de "projects"
// como las listas del resto de las tablas.
function makeBuilder(result: { data: unknown }) {
  const builder = {
    select: () => builder,
    eq: () => builder,
    in: () => builder,
    maybeSingle: () => Promise.resolve(result),
    then: (resolve: (r: typeof result) => void) => resolve(result),
  };
  return builder;
}

interface Tables {
  projects?: Record<string, unknown> | null;
  buildings?: Record<string, unknown>[];
  floors?: Record<string, unknown>[];
  units?: Record<string, unknown>[];
  aerial_slides?: Record<string, unknown>[];
  amenities?: Record<string, unknown>[];
  points_of_interest?: Record<string, unknown>[];
}

function mockSupabase(tables: Tables) {
  const fromSpy = vi.fn((table: keyof Tables) => {
    const data = table === 'projects' ? (tables.projects ?? null) : (tables[table] ?? []);
    return makeBuilder({ data });
  });
  const remove = vi.fn().mockResolvedValue({ data: null, error: null });
  return {
    from: fromSpy,
    storage: { from: () => ({ remove }) },
    _remove: remove,
  };
}

const BASE_URL = 'https://xxx.supabase.co/storage/v1/object/public/project-media';

describe('deleteProjectStorageFiles', () => {
  it('junta URLs de todas las tablas, extrae la key relativa al bucket, dedupea, y las borra', async () => {
    const supabase = mockSupabase({
      projects: {
        masterplan_image: `${BASE_URL}/proj/master.png`,
        process_gallery: [`${BASE_URL}/proj/g1.png`],
        before_after: [{ beforeImage: `${BASE_URL}/proj/before.png`, afterImage: null }],
        theme_config: { backgroundImageUrl: `${BASE_URL}/proj/bg.png` },
        common_areas_tour: { nodes: [{ imageUrl: `${BASE_URL}/proj/tour1.png` }] },
      },
      buildings: [{ id: 'b1', cover_image: `${BASE_URL}/b1/cover.png`, amenities_tour: null }],
      floors: [{ id: 'f1', plan_image: `${BASE_URL}/f1/plan.png` }],
      units: [
        {
          interior_image_url: `${BASE_URL}/u1/interior.png`,
          gallery_images: [`${BASE_URL}/u1/g1.png`, `${BASE_URL}/u1/g1.png`], // duplicada a propósito
          floor_plan_3d_url: null,
          plan_3d_url: null,
          technical_plan_url: null,
          room_plan_image: null,
          tour_image_url: null,
          tour_data: null,
          levels: [],
        },
      ],
      aerial_slides: [{ image_url: `${BASE_URL}/slides/1.png`, video_url: null }],
      amenities: [{ images: [`${BASE_URL}/amenities/pool.png`] }],
      points_of_interest: [{ image: `${BASE_URL}/poi/school.png`, image_ignored: 'https://otro-host.com/no-es-nuestro-bucket/x.png' }],
    });

    await deleteProjectStorageFiles(supabase as never, 'project-1');

    expect(supabase._remove).toHaveBeenCalledTimes(1);
    const removedKeys = supabase._remove.mock.calls[0][0] as string[];
    expect(new Set(removedKeys)).toEqual(
      new Set([
        'proj/master.png',
        'proj/g1.png',
        'proj/before.png',
        'proj/bg.png',
        'proj/tour1.png',
        'b1/cover.png',
        'f1/plan.png',
        'u1/interior.png',
        'u1/g1.png', // solo una vez pese a estar duplicada
        'slides/1.png',
        'amenities/pool.png',
        'poi/school.png',
      ])
    );
  });

  it('sin edificios, no consulta floors ni units (corta el .in([]) innecesario)', async () => {
    const supabase = mockSupabase({ projects: null, buildings: [] });
    await deleteProjectStorageFiles(supabase as never, 'project-1');
    const queriedTables = supabase.from.mock.calls.map(c => c[0]);
    expect(queriedTables).not.toContain('floors');
    expect(queriedTables).not.toContain('units');
  });

  it('proyecto no encontrado: no tira, sigue con el resto de las tablas', async () => {
    const supabase = mockSupabase({
      projects: null,
      buildings: [],
      aerial_slides: [{ image_url: `${BASE_URL}/slides/1.png` }],
    });
    await expect(deleteProjectStorageFiles(supabase as never, 'project-1')).resolves.toBeUndefined();
    expect(supabase._remove).toHaveBeenCalledWith(['slides/1.png']);
  });

  it('sin ningún archivo, no llama a storage.remove()', async () => {
    const supabase = mockSupabase({ projects: null, buildings: [] });
    await deleteProjectStorageFiles(supabase as never, 'project-1');
    expect(supabase._remove).not.toHaveBeenCalled();
  });

  it('borra en tandas de 100 cuando hay más archivos que eso', async () => {
    const manyUnits = Array.from({ length: 150 }, (_, i) => ({
      interior_image_url: `${BASE_URL}/u/${i}.png`,
      gallery_images: [],
      floor_plan_3d_url: null,
      plan_3d_url: null,
      technical_plan_url: null,
      room_plan_image: null,
      tour_image_url: null,
      tour_data: null,
      levels: [],
    }));
    const supabase = mockSupabase({
      projects: null,
      buildings: [{ id: 'b1', cover_image: null, amenities_tour: null }],
      floors: [{ id: 'f1', plan_image: null }],
      units: manyUnits,
    });
    await deleteProjectStorageFiles(supabase as never, 'project-1');
    expect(supabase._remove).toHaveBeenCalledTimes(2);
    expect((supabase._remove.mock.calls[0][0] as string[]).length).toBe(100);
    expect((supabase._remove.mock.calls[1][0] as string[]).length).toBe(50);
  });
});
