import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isValidEnum } from '@/lib/validate';
import { PROJECT_STRUCTURES, PROJECT_SALE_MODES, DEFAULT_PROJECT_TYPE, DEFAULT_SALE_MODE, isValidTypeCombo, getProjectTypeConfig } from '@/lib/project-types';
import { SECTION_REGISTRY, isSectionAvailable, computeEmptySectionKeys, type SectionKey } from '@/lib/project-sections';
import { resolveActiveProjectId } from '@/lib/supabase/require-project-access';
import { slugify, ensureUniqueSlug } from '@/lib/slug';
import { sanitizeText } from '@/lib/sanitize';
import { provisionSingleUnitStructure } from '@/lib/provision-structure';

// Secciones "de contenido" — las únicas que computeEmptySectionKeys sabe
// evaluar (calculadora/contacto son toggles de configuración, no algo que
// se "carga", así que no cuentan para el progreso de una tarjeta).
const CONTENT_SECTION_KEYS: SectionKey[] = ['about', 'before_after', 'process', 'team', 'amenities', 'masterplan', 'typologies', 'location'];

const PROJECT_TYPE_KEYS = Object.keys(PROJECT_STRUCTURES) as (keyof typeof PROJECT_STRUCTURES)[];
const SALE_MODE_KEYS = Object.keys(PROJECT_SALE_MODES) as (keyof typeof PROJECT_SALE_MODES)[];

// GET  → los proyectos de la cuenta logueada (para "Mis proyectos"), más
//        cuál está activo — para poder marcarlo en la grilla y no hacer
//        que el usuario adivine en cuál está parado.
// POST → crea un proyecto nuevo con esa cuenta como dueña.
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const { data, error } = await supabase
    .from('projects')
    .select('id, slug, name, description, location, masterplan_image, project_type, sale_mode, show_in_portfolio, published, process_gallery, before_after, created_at, updated_at')
    .eq('owner_id', user.id)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const projectIds = (data ?? []).map(p => p.id);
  const pendingLeadsByProject = new Map<string, number>();
  const commentsByProject = new Map<string, number>();
  // Para el progreso ("N de M secciones listas") de cada tarjeta — mismo
  // criterio que computeEmptySectionKeys ya usa para UN proyecto en
  // /admin/sitio, ahora en lotes agrupados por project_id para no pagar
  // un fetch pesado por cada proyecto de la lista.
  const unitsByProject = new Map<string, number>();
  const amenitiesByProject = new Map<string, number>();
  const aerialByProject = new Map<string, number>();
  const poiWithImageByProject = new Map<string, number>();
  const collaboratorsByProject = new Map<string, number>();

  if (projectIds.length > 0) {
    const [
      { data: pendingLeads },
      { data: comments },
      { data: buildings },
      { data: amenities },
      { data: aerialSlides },
      { data: pois },
      { data: collaborators },
    ] = await Promise.all([
      supabase.from('leads').select('project_id').in('project_id', projectIds).eq('status', 'nuevo'),
      supabase.from('project_comments').select('project_id').in('project_id', projectIds),
      supabase.from('buildings').select('id, project_id').in('project_id', projectIds),
      supabase.from('amenities').select('project_id').in('project_id', projectIds),
      supabase.from('aerial_slides').select('project_id').in('project_id', projectIds),
      supabase.from('points_of_interest').select('project_id, image').in('project_id', projectIds),
      supabase.from('project_collaborators').select('project_id').in('project_id', projectIds).eq('status', 'accepted'),
    ]);

    for (const l of (pendingLeads ?? [])) {
      if (l.project_id) pendingLeadsByProject.set(l.project_id, (pendingLeadsByProject.get(l.project_id) ?? 0) + 1);
    }
    for (const c of (comments ?? [])) {
      commentsByProject.set(c.project_id, (commentsByProject.get(c.project_id) ?? 0) + 1);
    }
    for (const a of (amenities ?? [])) {
      amenitiesByProject.set(a.project_id, (amenitiesByProject.get(a.project_id) ?? 0) + 1);
    }
    for (const s of (aerialSlides ?? [])) {
      aerialByProject.set(s.project_id, (aerialByProject.get(s.project_id) ?? 0) + 1);
    }
    for (const poi of (pois ?? [])) {
      if (poi.image) poiWithImageByProject.set(poi.project_id, (poiWithImageByProject.get(poi.project_id) ?? 0) + 1);
    }
    for (const c of (collaborators ?? [])) {
      collaboratorsByProject.set(c.project_id, (collaboratorsByProject.get(c.project_id) ?? 0) + 1);
    }

    // units cuelga de floors, que cuelga de buildings — la única cadena de
    // dependencia real acá, igual que en data/project-repository.ts.
    const buildingIds = (buildings ?? []).map(b => b.id);
    const projectIdByBuilding = new Map((buildings ?? []).map(b => [b.id, b.project_id as string]));
    if (buildingIds.length > 0) {
      const { data: floors } = await supabase.from('floors').select('id, building_id').in('building_id', buildingIds);
      const floorIds = (floors ?? []).map(f => f.id);
      const buildingIdByFloor = new Map((floors ?? []).map(f => [f.id, f.building_id as string]));
      if (floorIds.length > 0) {
        const { data: units } = await supabase.from('units').select('floor_id').in('floor_id', floorIds);
        for (const u of (units ?? [])) {
          const buildingId = buildingIdByFloor.get(u.floor_id);
          const projectId = buildingId ? projectIdByBuilding.get(buildingId) : undefined;
          if (projectId) unitsByProject.set(projectId, (unitsByProject.get(projectId) ?? 0) + 1);
        }
      }
    }
  }

  const projects = (data ?? []).map(p => {
    const typeConfig = getProjectTypeConfig(p.project_type, p.sale_mode);
    const availableContentKeys = SECTION_REGISTRY
      .map(s => s.key)
      .filter(key => CONTENT_SECTION_KEYS.includes(key) && isSectionAvailable(key, typeConfig));
    const emptyKeys = computeEmptySectionKeys({
      description: p.description ?? '',
      beforeAfter: p.before_after ?? [],
      processGallery: p.process_gallery ?? [],
      collaborators: collaboratorsByProject.has(p.id) ? [{}] : [],
      amenities: amenitiesByProject.has(p.id) ? [{}] : [],
      pointsOfInterest: poiWithImageByProject.has(p.id) ? [{ image: 'x' }] : [],
      units: unitsByProject.has(p.id) ? [{}] : [],
      aerialSlides: aerialByProject.has(p.id) ? [{}] : [],
    });
    const total = availableContentKeys.length;
    const done = total - availableContentKeys.filter(key => emptyKeys.has(key)).length;

    return {
      ...p,
      pendingLeadsCount: pendingLeadsByProject.get(p.id) ?? 0,
      commentsCount: commentsByProject.get(p.id) ?? 0,
      progress: { done, total },
    };
  });

  const activeProjectId = await resolveActiveProjectId();
  return NextResponse.json({ projects, activeProjectId });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const body = await request.json();
  const name = sanitizeText(body.name, 150);
  if (!name) {
    return NextResponse.json({ error: 'Falta name' }, { status: 400 });
  }
  if (body.projectType !== undefined && !isValidEnum(body.projectType, PROJECT_TYPE_KEYS)) {
    return NextResponse.json({ error: `projectType debe ser uno de: ${PROJECT_TYPE_KEYS.join(', ')}` }, { status: 400 });
  }
  if (body.saleMode !== undefined && !isValidEnum(body.saleMode, SALE_MODE_KEYS)) {
    return NextResponse.json({ error: `saleMode debe ser uno de: ${SALE_MODE_KEYS.join(', ')}` }, { status: 400 });
  }
  const projectType = body.projectType ?? DEFAULT_PROJECT_TYPE;
  const saleMode = body.saleMode ?? DEFAULT_SALE_MODE;
  if (!isValidTypeCombo(projectType, saleMode)) {
    return NextResponse.json({ error: `La forma "${projectType}" no admite el propósito "${saleMode}".` }, { status: 400 });
  }

  // El slug se genera solo a partir del nombre — el admin nunca lo escribe
  // ni puede pisarlo con uno repetido (ver lib/slug.ts).
  const slug = await ensureUniqueSlug(supabase, { table: 'projects', column: 'slug', base: slugify(name) });

  const { data, error } = await supabase
    .from('projects')
    .insert({
      slug,
      name,
      owner_id: user.id,
      project_type: projectType,
      sale_mode: saleMode,
    })
    .select('id, slug, name, project_type, sale_mode')
    .single();

  if (error) {
    if (error.code === '23505') return NextResponse.json({ error: 'Ese slug ya está en uso.' }, { status: 409 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Formas "de una sola cosa" (casa): la casa ES el proyecto, así que se
  // arma sola acá mismo con el nombre del proyecto — el usuario no pasa
  // por un paso de "crear la casa". Si algo falla, el proyecto igual queda
  // creado y el wizard la provisiona como red de seguridad.
  if (!getProjectTypeConfig(projectType, saleMode).hasUnitStep) {
    try {
      await provisionSingleUnitStructure(supabase, { projectId: data.id, name });
    } catch (e) {
      console.error('No se pudo auto-provisionar la casa del proyecto', data.id, e);
    }
  }

  return NextResponse.json(data, { status: 201 });
}
