import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/require-project-access', () => ({
  requireProjectAccess: vi.fn(),
  resolveRequestedProjectId: vi.fn(),
}));
vi.mock('@/data/project-repository', () => ({ getProjectBySlug: vi.fn() }));
vi.mock('@/lib/revalidate-project', () => ({ revalidateProjectBySlug: vi.fn(), revalidateProjectById: vi.fn() }));

import { requireProjectAccess, resolveRequestedProjectId } from '@/lib/supabase/require-project-access';
import { getProjectBySlug } from '@/data/project-repository';
import { revalidateProjectBySlug } from '@/lib/revalidate-project';
import { mockSupabase, jsonRequest } from '@/lib/test-helpers/supabase-mock';
import { GET, PATCH } from './route';

function get(url: string) {
  return new Request(url);
}

describe('GET /api/admin/project', () => {
  beforeEach(() => {
    vi.mocked(requireProjectAccess).mockReset();
    vi.mocked(resolveRequestedProjectId).mockReset();
  });

  it('sin proyecto activo: 404', async () => {
    vi.mocked(resolveRequestedProjectId).mockResolvedValue(null);

    const res = await GET(get('http://localhost/api/admin/project'));
    expect(res.status).toBe(404);
    expect(requireProjectAccess).not.toHaveBeenCalled();
  });

  it('sin acceso al proyecto: 401', async () => {
    vi.mocked(resolveRequestedProjectId).mockResolvedValue('project-1');
    vi.mocked(requireProjectAccess).mockResolvedValue(null);

    const res = await GET(get('http://localhost/api/admin/project'));
    expect(res.status).toBe(401);
  });

  it('error al buscar el proyecto: 500', async () => {
    vi.mocked(resolveRequestedProjectId).mockResolvedValue('project-1');
    const supabase = mockSupabase({ results: [{ error: { message: 'db down' } }] });
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'user-1' } } as never);

    const res = await GET(get('http://localhost/api/admin/project'));
    expect(res.status).toBe(500);
  });

  it('proyecto activo ya no existe: 404, sin disparar el resto de los queries', async () => {
    vi.mocked(resolveRequestedProjectId).mockResolvedValue('project-1');
    const supabase = mockSupabase({ results: [{ data: null }] });
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'user-1' } } as never);

    const res = await GET(get('http://localhost/api/admin/project'));
    expect(res.status).toBe(404);
    expect(supabase.from).toHaveBeenCalledTimes(1);
  });

  it('camino feliz sin vistas aéreas ni comentarios: junta todas las secciones del proyecto', async () => {
    vi.mocked(resolveRequestedProjectId).mockResolvedValue('project-1');
    const supabase = mockSupabase({
      results: [
        { data: { id: 'project-1', slug: 'torre-del-mar', name: 'Torre del Mar' } }, // .from('projects')...maybeSingle()
        { data: [{ id: 'building-1' }] }, // .from('buildings')
        { data: [] }, // .from('aerial_slides')
        { data: [{ id: 'amenity-1' }] }, // .from('amenities')
        { data: [{ id: 'poi-1' }] }, // .from('points_of_interest')
        { data: [{ id: 'collab-1' }] }, // .from('project_collaborators')
        { data: [] }, // .from('project_comments')
        { count: 2 }, // .from('units') total (conteo head)
        { count: 1 }, // .from('units') con precio
      ],
    });
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'user-1' } } as never);

    const res = await GET(get('http://localhost/api/admin/project'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      project: { id: 'project-1', slug: 'torre-del-mar', name: 'Torre del Mar' },
      buildings: [{ id: 'building-1' }],
      slides: [],
      hotspots: [],
      amenities: [{ id: 'amenity-1' }],
      pointsOfInterest: [{ id: 'poi-1' }],
      collaborators: [{ id: 'collab-1' }],
      comments: [],
      unitPrices: { total: 2, priced: 1 },
    });
  });

  it('con vistas aéreas: trae también los hotspots de esas vistas', async () => {
    vi.mocked(resolveRequestedProjectId).mockResolvedValue('project-1');
    const supabase = mockSupabase({
      results: [
        { data: { id: 'project-1', slug: 'torre-del-mar' } },
        { data: [] }, // buildings
        { data: [{ id: 'slide-1' }] }, // aerial_slides
        { data: [] }, // amenities
        { data: [] }, // points_of_interest
        { data: [] }, // project_collaborators
        { data: [] }, // project_comments (vacío, sin autores que buscar)
        { count: 0 }, // units total
        { count: 0 }, // units con precio (ambos .from() son síncronos dentro del Promise.all: van antes que los hotspots)
        { data: [{ id: 'hotspot-1', slide_id: 'slide-1' }] }, // aerial_hotspots
      ],
    });
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'user-1' } } as never);

    const res = await GET(get('http://localhost/api/admin/project'));
    const body = await res.json();
    expect(body.slides).toEqual([{ id: 'slide-1' }]);
    expect(body.hotspots).toEqual([{ id: 'hotspot-1', slide_id: 'slide-1' }]);
  });

  it('con comentarios: arma el autor de cada uno a mano (sin FK real a profiles)', async () => {
    vi.mocked(resolveRequestedProjectId).mockResolvedValue('project-1');
    const supabase = mockSupabase({
      results: [
        { data: { id: 'project-1', slug: 'torre-del-mar' } },
        { data: [] }, // buildings
        { data: [] }, // aerial_slides (vacío, sin hotspots que buscar)
        { data: [] }, // amenities
        { data: [] }, // points_of_interest
        { data: [] }, // project_collaborators
        { data: [{ id: 'comment-1', author_id: 'user-2', body: 'Hola' }] }, // project_comments
        { count: 0 }, // units total
        { count: 0 }, // units con precio (antes que profiles: los .from() son síncronos dentro del Promise.all)
        { data: [{ id: 'user-2', handle: 'ana', display_name: 'Ana' }] }, // profiles
      ],
    });
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'user-1' } } as never);

    const res = await GET(get('http://localhost/api/admin/project'));
    const body = await res.json();
    expect(body.comments).toEqual([
      { id: 'comment-1', author_id: 'user-2', body: 'Hola', author: { id: 'user-2', handle: 'ana', display_name: 'Ana' } },
    ]);
  });
});

describe('GET /api/admin/project: conteo de precios con error', () => {
  it('si falla un conteo de unidades: 200 igual, con unitPrices en cero', async () => {
    vi.mocked(resolveRequestedProjectId).mockResolvedValue('project-1');
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const supabase = mockSupabase({
      results: [
        { data: { id: 'project-1', slug: 'torre-del-mar' } },
        { data: [] }, // buildings
        { data: [] }, // aerial_slides
        { data: [] }, // amenities
        { data: [] }, // points_of_interest
        { data: [] }, // project_collaborators
        { data: [] }, // project_comments
        { count: 5 }, // units total
        { error: { message: 'boom' } }, // units con precio
      ],
    });
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'user-1' } } as never);

    const res = await GET(get('http://localhost/api/admin/project'));
    expect(res.status).toBe(200);
    expect((await res.json()).unitPrices).toEqual({ total: 0, priced: 0 });
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe('PATCH /api/admin/project', () => {
  beforeEach(() => {
    vi.mocked(requireProjectAccess).mockReset();
    vi.mocked(resolveRequestedProjectId).mockReset();
  });

  it('sin proyecto activo: 404', async () => {
    vi.mocked(resolveRequestedProjectId).mockResolvedValue(null);

    const res = await PATCH(jsonRequest('http://localhost/api/admin/project', { name: 'Nuevo nombre' }));
    expect(res.status).toBe(404);
  });

  it('sin acceso al proyecto: 401', async () => {
    vi.mocked(resolveRequestedProjectId).mockResolvedValue('project-1');
    vi.mocked(requireProjectAccess).mockResolvedValue(null);

    const res = await PATCH(jsonRequest('http://localhost/api/admin/project', { name: 'Nuevo nombre' }));
    expect(res.status).toBe(401);
  });

  it('saleMode fuera del enum aceptado: 400 antes de tocar la base', async () => {
    vi.mocked(resolveRequestedProjectId).mockResolvedValue('project-1');
    const supabase = mockSupabase({ results: [] });
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'user-1' } } as never);

    const res = await PATCH(jsonRequest('http://localhost/api/admin/project', { saleMode: 'alquiler' }));
    expect(res.status).toBe(400);
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('nuevo saleMode incompatible con la forma ya guardada: 400, no actualiza', async () => {
    vi.mocked(resolveRequestedProjectId).mockResolvedValue('project-1');
    const supabase = mockSupabase({ results: [{ data: { project_type: 'unico' } }] }); // 'unico' solo admite 'showcase'
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'user-1' } } as never);

    const res = await PATCH(jsonRequest('http://localhost/api/admin/project', { saleMode: 'venta' }));
    expect(res.status).toBe(400);
    expect(supabase.from).toHaveBeenCalledTimes(1);
  });

  it('actualización simple (sin cambiar saleMode): no consulta project_type, solo actualiza', async () => {
    vi.mocked(resolveRequestedProjectId).mockResolvedValue('project-1');
    const supabase = mockSupabase({ results: [{ data: { id: 'project-1', name: 'Nuevo nombre' }, error: null }] });
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'user-1' } } as never);

    const res = await PATCH(jsonRequest('http://localhost/api/admin/project', { name: 'Nuevo nombre' }));
    expect(res.status).toBe(200);
    expect(supabase.from).toHaveBeenCalledTimes(1);
  });

  it('slug: se normaliza y, si está libre, se guarda', async () => {
    vi.mocked(resolveRequestedProjectId).mockResolvedValue('project-1');
    const supabase = mockSupabase({ results: [
      { data: null },                                   // ¿lo usa otro proyecto?
      { data: { slug: 'viejo-link' } },                 // slug anterior
      { data: { id: 'project-1', slug: 'torre-del-mar' }, error: null },
    ] });
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'user-1' } } as never);

    const res = await PATCH(jsonRequest('http://localhost/api/admin/project', { slug: '  Torre del Mar! ' }));
    expect(res.status).toBe(200);
    const update = supabase.from.mock.results[2].value.update.mock.calls[0][0];
    expect(update.slug).toBe('torre-del-mar');
    // El link viejo deja de servirse desde la caché.
    expect(vi.mocked(revalidateProjectBySlug)).toHaveBeenCalledWith('viejo-link');
  });

  it('slug largo: se corta a 63 (etiqueta DNS) sin guion final', async () => {
    vi.mocked(resolveRequestedProjectId).mockResolvedValue('project-1');
    const supabase = mockSupabase({ results: [{ data: null }, { data: { slug: 'x' } }, { data: { id: 'project-1' }, error: null }] });
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'user-1' } } as never);

    const res = await PATCH(jsonRequest('http://localhost/api/admin/project', { slug: `${'a'.repeat(62)} b` }));
    expect(res.status).toBe(200);
    const update = supabase.from.mock.results[2].value.update.mock.calls[0][0];
    expect(update.slug).toBe('a'.repeat(62));
  });

  it('23505 sin cambio de slug: no se informa como conflicto de link', async () => {
    vi.mocked(resolveRequestedProjectId).mockResolvedValue('project-1');
    const supabase = mockSupabase({ results: [{ data: null, error: { code: '23505', message: 'duplicate' } }] });
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'user-1' } } as never);

    const res = await PATCH(jsonRequest('http://localhost/api/admin/project', { name: 'Otro nombre' }));
    expect(res.status).toBe(500);
  });

  it('slug que ya usa otro proyecto: 409, no actualiza', async () => {
    vi.mocked(resolveRequestedProjectId).mockResolvedValue('project-1');
    const supabase = mockSupabase({ results: [{ data: { id: 'project-2' } }] });
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'user-1' } } as never);

    const res = await PATCH(jsonRequest('http://localhost/api/admin/project', { slug: 'torre-del-mar' }));
    expect(res.status).toBe(409);
    expect(supabase.from).toHaveBeenCalledTimes(1);
  });

  it('slug sin letras ni números: 400', async () => {
    vi.mocked(resolveRequestedProjectId).mockResolvedValue('project-1');
    const supabase = mockSupabase({ results: [] });
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'user-1' } } as never);

    const res = await PATCH(jsonRequest('http://localhost/api/admin/project', { slug: '!!!' }));
    expect(res.status).toBe(400);
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('carrera con otro proyecto al guardar el slug: 409 por la constraint unique', async () => {
    vi.mocked(resolveRequestedProjectId).mockResolvedValue('project-1');
    const supabase = mockSupabase({ results: [{ data: null }, { data: { slug: 'viejo' } }, { data: null, error: { code: '23505', message: 'duplicate' } }] });
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'user-1' } } as never);

    const res = await PATCH(jsonRequest('http://localhost/api/admin/project', { slug: 'torre-del-mar' }));
    expect(res.status).toBe(409);
  });

  it('constructionProgress: se guarda saneado (sin HTML, sin fotos que no sean http, sin etapas huérfanas)', async () => {
    vi.mocked(resolveRequestedProjectId).mockResolvedValue('project-1');
    const supabase = mockSupabase({ results: [{ data: { id: 'project-1' }, error: null }] });
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'user-1' } } as never);

    const res = await PATCH(jsonRequest('http://localhost/api/admin/project', {
      constructionProgress: {
        stages: [{ id: 's1', label: '<script>x</script>Estructura' }],
        currentStageId: 'otra',
        percent: 55,
        updates: [{ id: 'u1', date: '2026-03-01', stageId: 's1', title: 'Losa', images: ['https://a.supabase.co/1.jpg', 'data:image/png;base64,AAA'] }],
      },
    }));
    expect(res.status).toBe(200);
    const payload = supabase.from.mock.results[0].value.update.mock.calls[0][0];
    expect(payload.construction_progress).toEqual({
      stages: [{ id: 's1', label: 'Estructura' }],
      percent: 55,
      updates: [{ id: 'u1', date: '2026-03-01', stageId: 's1', title: 'Losa', images: ['https://a.supabase.co/1.jpg'] }],
      // La marca de guardado la pone el servidor.
      updatedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
    });
  });

  it('constructionProgress con forma inválida (fecha que no es yyyy-mm-dd, demasiadas entradas): 400 antes de tocar la base', async () => {
    vi.mocked(resolveRequestedProjectId).mockResolvedValue('project-1');
    const supabase = mockSupabase({ results: [] });
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'user-1' } } as never);

    const badDate = await PATCH(jsonRequest('http://localhost/api/admin/project', {
      constructionProgress: { stages: [], updates: [{ date: '01/03/2026', title: 'x', images: [] }] },
    }));
    expect(badDate.status).toBe(400);
    const tooMany = await PATCH(jsonRequest('http://localhost/api/admin/project', {
      constructionProgress: { stages: [], updates: Array.from({ length: 301 }, () => ({ date: '2026-03-01', title: 'x', images: [] })) },
    }));
    expect(tooMany.status).toBe(400);
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('constructionProgressBase igual a lo guardado: guarda y pisa la marca con una nueva', async () => {
    vi.mocked(resolveRequestedProjectId).mockResolvedValue('project-1');
    const supabase = mockSupabase({ results: [
      { data: { construction_progress: { stages: [], updates: [], percent: 10, updatedAt: '2026-11-10T10:00:00.000Z' } } }, // lo guardado
      { data: { id: 'project-1' }, error: null }, // update
    ] });
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'user-1' } } as never);

    const res = await PATCH(jsonRequest('http://localhost/api/admin/project', {
      constructionProgress: { stages: [], updates: [], percent: 20, updatedAt: '2026-11-10T10:00:00.000Z' },
      constructionProgressBase: '2026-11-10T10:00:00.000Z',
    }));
    expect(res.status).toBe(200);
    const payload = supabase.from.mock.results[1].value.update.mock.calls[0][0];
    expect(payload.construction_progress.percent).toBe(20);
    expect(payload.construction_progress.updatedAt).not.toBe('2026-11-10T10:00:00.000Z');
  });

  it('constructionProgressBase distinto de lo guardado (otra persona guardó en el medio): 409 y no escribe', async () => {
    vi.mocked(resolveRequestedProjectId).mockResolvedValue('project-1');
    const supabase = mockSupabase({ results: [
      { data: { construction_progress: { stages: [], updates: [], percent: 10, updatedAt: '2026-11-10T11:00:00.000Z' } } },
    ] });
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'user-1' } } as never);

    const res = await PATCH(jsonRequest('http://localhost/api/admin/project', {
      constructionProgress: { stages: [], updates: [], percent: 20 },
      constructionProgressBase: '2026-11-10T10:00:00.000Z',
    }));
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('construction_progress_conflict');
    expect(supabase.from.mock.results[0].value.update).not.toHaveBeenCalled();
  });

  it('constructionProgressBase null con nada guardado (primera carga): guarda', async () => {
    vi.mocked(resolveRequestedProjectId).mockResolvedValue('project-1');
    const supabase = mockSupabase({ results: [
      { data: { construction_progress: null } },
      { data: { id: 'project-1' }, error: null },
    ] });
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'user-1' } } as never);

    const res = await PATCH(jsonRequest('http://localhost/api/admin/project', {
      constructionProgress: { stages: [], updates: [], percent: 1 },
      constructionProgressBase: null,
    }));
    expect(res.status).toBe(200);
  });

  it('constructionProgress vacío: guarda null', async () => {
    vi.mocked(resolveRequestedProjectId).mockResolvedValue('project-1');
    const supabase = mockSupabase({ results: [{ data: { id: 'project-1' }, error: null }] });
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'user-1' } } as never);

    await PATCH(jsonRequest('http://localhost/api/admin/project', { constructionProgress: { stages: [], updates: [] } }));
    expect(supabase.from.mock.results[0].value.update.mock.calls[0][0].construction_progress).toBeNull();
  });

  it('cambio de saleMode compatible: valida el combo y actualiza', async () => {
    vi.mocked(resolveRequestedProjectId).mockResolvedValue('project-1');
    const supabase = mockSupabase({
      results: [
        { data: { project_type: 'edificio' } }, // edificio admite venta y showcase
        { data: { id: 'project-1', sale_mode: 'showcase' }, error: null },
      ],
    });
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'user-1' } } as never);

    const res = await PATCH(jsonRequest('http://localhost/api/admin/project', { saleMode: 'showcase' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: 'project-1', sale_mode: 'showcase' });
  });

  it('error de la base al actualizar: 500 con el mensaje', async () => {
    vi.mocked(resolveRequestedProjectId).mockResolvedValue('project-1');
    const supabase = mockSupabase({ results: [{ error: { message: 'update failed' } }] });
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'user-1' } } as never);

    const res = await PATCH(jsonRequest('http://localhost/api/admin/project', { name: 'X' }));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe('No se pudo completar la operación. Probá de nuevo en un rato.'); // no filtra el mensaje de la base
  });
});

describe('PATCH /api/admin/project: publicar exige el mínimo', () => {
  const loteo = (over: Record<string, unknown> = {}) => ({
    name: 'Loteo Norte', projectType: 'loteo', saleMode: 'venta',
    masterplanImage: 'https://x/plano.jpg', aerialSlides: [], buildings: [{ id: 'b1' }], units: [{ id: 'u1' }],
    ...over,
  });

  beforeEach(() => {
    vi.mocked(requireProjectAccess).mockReset();
    vi.mocked(resolveRequestedProjectId).mockReset().mockResolvedValue('project-1');
    vi.mocked(getProjectBySlug).mockReset();
  });

  it('loteo sin lotes ni imagen: 422 con lo que falta, no actualiza', async () => {
    const supabase = mockSupabase({ results: [{ data: { slug: 'loteo-norte' } }] });
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'user-1' } } as never);
    vi.mocked(getProjectBySlug).mockResolvedValue(loteo({ masterplanImage: undefined, units: [] }) as never);

    const res = await PATCH(jsonRequest('http://localhost/api/admin/project', { published: true }));
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.missing).toHaveLength(2);
    expect(supabase.from).toHaveBeenCalledTimes(1);
  });

  it('con el mínimo cargado: publica', async () => {
    const supabase = mockSupabase({ results: [{ data: { slug: 'loteo-norte' } }, { data: { id: 'project-1', published: true }, error: null }] });
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'user-1' } } as never);
    vi.mocked(getProjectBySlug).mockResolvedValue(loteo() as never);

    const res = await PATCH(jsonRequest('http://localhost/api/admin/project', { published: true }));
    expect(res.status).toBe(200);
    expect(supabase.from.mock.results[1].value.update.mock.calls[0][0].published).toBe(true);
  });

  it('despublicar no valida nada', async () => {
    const supabase = mockSupabase({ results: [{ data: { id: 'project-1', published: false }, error: null }] });
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'user-1' } } as never);

    const res = await PATCH(jsonRequest('http://localhost/api/admin/project', { published: false }));
    expect(res.status).toBe(200);
    expect(getProjectBySlug).not.toHaveBeenCalled();
  });
});

describe('PATCH /api/admin/project: validación de los blobs JSON', () => {
  beforeEach(() => {
    vi.mocked(requireProjectAccess).mockReset();
    vi.mocked(resolveRequestedProjectId).mockReset();
  });

  it.each([
    ['tema con un color que no es hex', { themeConfig: { customColors: { bg: 'url(https://evil.com/x.png)' } } }],
    ['tema con fondo que rompe el url()', { themeConfig: { backgroundImageUrl: "https://a.com/x.jpg');background:url('//evil" } }],
    ['tema con radio inválido', { themeConfig: { radius: '10vw' } }],
    ['secciones que no son un array', { sectionConfig: { key: 'about' } }],
    ['galería de proceso con javascript:', { processGallery: ['javascript:alert(1)'] }],
    ['antes/después con una imagen peligrosa', { beforeAfter: [{ label: 'x', beforeImage: 'javascript:alert(1)', afterImage: 'https://a.com/b.jpg' }] }],
    ['recorrido demasiado grande', { commonAreasTour: { initialNodeId: 'n', nodes: [{ id: 'n', name: 'x', imageUrl: 'https://a.com/x.jpg', note: 'x'.repeat(600_000) }] } }],
    ['foto del masterplan con javascript:', { masterplanImage: 'javascript:alert(1)' }],
  ])('400 con %s, sin tocar la base', async (_n, body) => {
    vi.mocked(resolveRequestedProjectId).mockResolvedValue('project-1');
    const supabase = mockSupabase({ results: [] });
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'user-1' } } as never);

    const res = await PATCH(jsonRequest('http://localhost/api/admin/project', body, { method: 'PATCH' }));
    expect(res.status).toBe(400);
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('un tema válido llega al update tal cual (con las claves de color filtradas)', async () => {
    vi.mocked(resolveRequestedProjectId).mockResolvedValue('project-1');
    const supabase = mockSupabase({ results: [{ data: { id: 'project-1' } }] });
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'user-1' } } as never);

    const res = await PATCH(jsonRequest('http://localhost/api/admin/project', {
      themeConfig: { presetKey: 'natural', customColors: { bg: '#fafafa', spacing: '999rem' } },
    }, { method: 'PATCH' }));

    expect(res.status).toBe(200);
    const sent = supabase.from.mock.results[0].value.update.mock.calls[0][0];
    expect(sent.theme_config).toEqual({ presetKey: 'natural', customColors: { bg: '#fafafa' } });
  });
});
