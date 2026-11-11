import { revalidateProjectBySlug } from '@/lib/revalidate-project';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireProjectAccess, resolveRequestedProjectId } from '@/lib/supabase/require-project-access';
import { parseJsonBody } from '@/lib/api-validate';
import { sanitizeText, sanitizeMultiline } from '@/lib/sanitize';
import { PROJECT_SALE_MODES, isValidTypeCombo, getProjectTypeConfig } from '@/lib/project-types';
import { getPublishReadiness, describeMissing } from '@/lib/publish-readiness';
import { getProjectBySlug } from '@/data/project-repository';
import { parseConstructionProgress, stampConstructionProgress } from '@/lib/construction-progress-sanitize';
import { slugify } from '@/lib/slug';
import { safeUrl } from '@/lib/schema-parts';
import { themeConfigSchema, sectionConfigSchema, processGallerySchema, beforeAfterSchema, commonAreasTourSchema, constructionProgressSchema } from '@/lib/project-schemas';
import { serverError } from '@/lib/api-errors';
import { removeOrphanedMedia } from '@/lib/storage-cleanup';
import type { ConstructionProgress } from '@/types';

const SALE_MODE_KEYS = Object.keys(PROJECT_SALE_MODES) as [string, ...string[]];

// sectionConfig/themeConfig/commonAreasTour/processGallery/beforeAfter son
// blobs JSON con forma propia (config del sitio, tema, tour 360°, galería de
// proceso): su forma y sus topes viven en lib/project-schemas.ts. Antes eran
// z.unknown() y entraba cualquier cosa de cualquier tamaño, que después se
// servía (con caché) a cada visitante — en el tema, además, los valores
// terminan como variables CSS del sitio público.
const projectPatchSchema = z.object({
  name: z.string().max(200).optional(),
  // Link público (/proyecto/[slug]) — editable desde Configuración. Se
  // normaliza con slugify y tiene que ser único entre TODOS los proyectos.
  slug: z.string().min(1).max(120).optional(),
  // Propósito del desarrollo (para vender / solo mostrar) — editable desde
  // Configuración. La FORMA (project_type: edificio/casa/loteo…) NO se
  // toca acá: se fija al crear el proyecto y define toda la jerarquía.
  // Sin CHECK en la base (ver supabase/schema.sql), la validación vive acá.
  saleMode: z.enum(SALE_MODE_KEYS).optional(),
  // Columnas de texto opcionales: la fila las trae como null en un
  // proyecto recién creado, y el form las reenvía tal cual al guardar
  // cualquier otro campo (ej. la foto del masterplan). `.nullable()` para
  // no rechazar ese null — el handler lo sanea a '' igual.
  description: z.string().max(5000).nullable().optional(),
  tagline: z.string().max(300).nullable().optional(),
  sectionConfig: sectionConfigSchema.optional(),
  themeConfig: themeConfigSchema.optional(),
  location: z.string().max(300).nullable().optional(),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  masterplanImage: safeUrl.nullable().optional(),
  commonAreasTour: commonAreasTourSchema.optional(),
  tourOrientationDegrees: z.number().min(0).max(360).nullable().optional(),
  academicInstitution: z.string().max(200).nullable().optional(),
  academicCareer: z.string().max(200).nullable().optional(),
  academicTutor: z.string().max(200).nullable().optional(),
  academicYear: z.string().max(20).nullable().optional(),
  academicTeam: z.string().max(500).nullable().optional(),
  processGallery: processGallerySchema.optional(),
  beforeAfter: beforeAfterSchema.optional(),
  // Avance de obra: el schema corta la forma y el tamaño; el contenido lo
  // sanea entero parseConstructionProgress (null = sin avance cargado).
  constructionProgress: constructionProgressSchema.optional(),
  // updatedAt del avance tal como lo cargó el panel. Si viene y no coincide
  // con lo guardado, otra persona guardó en el medio: 409, no se pisa.
  // Sin este campo el guardado es incondicional (panel viejo, scripts).
  constructionProgressBase: z.string().max(40).nullable().optional(),
  showInPortfolio: z.boolean().optional(),
  published: z.boolean().optional(),
});

/** Todas las fotos y clips de un avance (con repetidos: una URL puede estar en dos entradas). */
function progressMediaUrls(progress: ConstructionProgress): string[] {
  return progress.updates.flatMap(u => [...u.images, ...(u.video ? [u.video] : [])]);
}

export async function GET(request: Request) {
  const projectId = await resolveRequestedProjectId(request);
  if (!projectId) return NextResponse.json({ error: 'Proyecto no encontrado' }, { status: 404 });

  const access = await requireProjectAccess(projectId);
  if (!access) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const { supabase } = access;

  const { data: project, error } = await supabase.from('projects').select('*').eq('id', projectId).maybeSingle();
  if (error) return serverError(error);
  if (!project) return NextResponse.json({ error: 'Proyecto no encontrado' }, { status: 404 });

  const [{ data: buildings }, { slides, hotspots }, { data: amenities }, { data: pointsOfInterest }, { data: collaborators }, comments, unitsTotal, unitsPriced] = await Promise.all([
    supabase.from('buildings').select('*').eq('project_id', project.id).order('slug'),
    (async () => {
      const { data: slides } = await supabase
        .from('aerial_slides')
        .select('*')
        .eq('project_id', project.id)
        .order('sort_order');
      const slideIds = (slides ?? []).map(s => s.id);
      const { data: hotspots } = slideIds.length
        ? await supabase.from('aerial_hotspots').select('*').in('slide_id', slideIds)
        : { data: [] };
      return { slides: slides ?? [], hotspots: hotspots ?? [] };
    })(),
    supabase.from('amenities').select('*').eq('project_id', project.id).order('sort_order'),
    supabase.from('points_of_interest').select('*').eq('project_id', project.id).order('sort_order'),
    supabase
      .from('project_collaborators')
      .select('*, profile:profiles(handle, display_name, avatar_image)')
      .eq('project_id', project.id)
      .order('created_at'),
    (async () => {
      const { data: commentRows } = await supabase
        .from('project_comments')
        .select('*')
        .eq('project_id', project.id)
        .order('created_at', { ascending: false });
      const rows = commentRows ?? [];
      // Sin FK real entre project_comments.author_id y profiles (profiles
      // es opt-in) — join manual, igual que en /api/comments.
      const authorIds = [...new Set(rows.map(c => c.author_id))];
      const { data: profiles } = authorIds.length
        ? await supabase.from('profiles').select('id, handle, display_name, avatar_image').in('id', authorIds)
        : { data: [] };
      const profileById = new Map((profiles ?? []).map(p => [p.id, p]));
      return rows.map(c => ({ ...c, author: profileById.get(c.author_id) ?? null }));
    })(),
    // Conteos (head, sin traer filas) para la checklist de publicación: un
    // select de filas toparía con el límite de 1000 de PostgREST y daría
    // totales parciales en proyectos grandes.
    supabase
      .from('units')
      .select('id, floors!inner(buildings!inner(project_id))', { count: 'exact', head: true })
      .eq('floors.buildings.project_id', project.id),
    supabase
      .from('units')
      .select('id, floors!inner(buildings!inner(project_id))', { count: 'exact', head: true })
      .eq('floors.buildings.project_id', project.id)
      .not('price', 'is', null),
  ]);

  // Si falla algún conteo no tiramos el GET entero: la checklist degrada a
  // "sin precios cargados" y queda el error en el log.
  let unitPrices = { total: unitsTotal.count ?? 0, priced: unitsPriced.count ?? 0 };
  if (unitsTotal.error || unitsPriced.error) {
    console.error('[project GET] no se pudieron contar los precios de las unidades', unitsTotal.error ?? unitsPriced.error);
    unitPrices = { total: 0, priced: 0 };
  }

  return NextResponse.json({
    project,
    buildings: buildings ?? [],
    slides: slides ?? [],
    hotspots: hotspots ?? [],
    amenities: amenities ?? [],
    pointsOfInterest: pointsOfInterest ?? [],
    collaborators: collaborators ?? [],
    comments,
    unitPrices,
  });
}

export async function PATCH(request: Request) {
  const projectId = await resolveRequestedProjectId(request);
  if (!projectId) return NextResponse.json({ error: 'Proyecto no encontrado' }, { status: 404 });

  const access = await requireProjectAccess(projectId, { revalidate: true });
  if (!access) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const { supabase } = access;

  const parsed = await parseJsonBody(request, projectPatchSchema);
  if ('error' in parsed) return parsed.error;
  const body = parsed.data;

  const updates: Record<string, unknown> = {};
  if (body.name !== undefined) updates.name = sanitizeText(body.name, 200);

  // El propósito nuevo tiene que ser compatible con la forma ya guardada
  // (ej. un "Proyecto único" no puede pasar a "venta") — ver isValidTypeCombo.
  if (body.saleMode !== undefined) {
    const { data: current } = await supabase
      .from('projects').select('project_type').eq('id', projectId).maybeSingle();
    if (!isValidTypeCombo(current?.project_type ?? '', body.saleMode)) {
      return NextResponse.json({ error: `La forma de este proyecto no admite el propósito "${body.saleMode}".` }, { status: 400 });
    }
    updates.sale_mode = body.saleMode;
  }
  // Slug anterior, para invalidar también su caché si cambia (la
  // revalidación automática de requireProjectAccess lee el slug DESPUÉS del
  // update, así que solo limpiaría el nuevo).
  let previousSlug: string | null = null;
  if (body.slug !== undefined) {
    // 63 = máximo de una etiqueta DNS: el slug también es subdominio
    // cuando NEXT_PUBLIC_ROOT_DOMAIN está configurado. Sin guiones colgando
    // después de cortar.
    const slug = slugify(body.slug).slice(0, 63).replace(/-+$/, '');
    if (!slug) return NextResponse.json({ error: 'El link tiene que tener al menos una letra o un número.' }, { status: 400 });
    const { data: taken } = await supabase.from('projects').select('id').eq('slug', slug).neq('id', projectId).maybeSingle();
    if (taken) return NextResponse.json({ error: 'Ese link ya lo usa otro proyecto. Probá con otro.' }, { status: 409 });
    const { data: current } = await supabase.from('projects').select('slug').eq('id', projectId).maybeSingle();
    previousSlug = current?.slug && current.slug !== slug ? current.slug : null;
    updates.slug = slug;
  }
  if (body.description !== undefined) updates.description = sanitizeMultiline(body.description, 5000);
  if (body.tagline !== undefined) updates.tagline = sanitizeText(body.tagline, 300);
  if (body.sectionConfig !== undefined) updates.section_config = body.sectionConfig;
  if (body.themeConfig !== undefined) updates.theme_config = body.themeConfig;
  if (body.location !== undefined) updates.location = sanitizeText(body.location, 300);
  if (body.latitude !== undefined) updates.latitude = body.latitude;
  if (body.longitude !== undefined) updates.longitude = body.longitude;
  if (body.masterplanImage !== undefined) updates.masterplan_image = body.masterplanImage;
  if (body.commonAreasTour !== undefined) updates.common_areas_tour = body.commonAreasTour;
  if (body.tourOrientationDegrees !== undefined) updates.tour_orientation_degrees = body.tourOrientationDegrees;
  if (body.academicInstitution !== undefined) updates.academic_institution = sanitizeText(body.academicInstitution, 200);
  if (body.academicCareer !== undefined) updates.academic_career = sanitizeText(body.academicCareer, 200);
  if (body.academicTutor !== undefined) updates.academic_tutor = sanitizeText(body.academicTutor, 200);
  if (body.academicYear !== undefined) updates.academic_year = sanitizeText(body.academicYear, 20);
  if (body.academicTeam !== undefined) updates.academic_team = sanitizeText(body.academicTeam, 500);
  if (body.processGallery !== undefined) updates.process_gallery = body.processGallery;
  if (body.beforeAfter !== undefined) updates.before_after = body.beforeAfter;
  // Avance guardado antes de este PATCH: sirve para el chequeo de conflicto y
  // para saber qué fotos dejaron de usarse (se borran después del update).
  let previousProgress: ConstructionProgress | null = null;
  let nextProgress: ConstructionProgress | null = null;
  if (body.constructionProgress !== undefined) {
    const { data: row } = await supabase.from('projects').select('construction_progress').eq('id', projectId).maybeSingle();
    previousProgress = parseConstructionProgress(row?.construction_progress);
    if (body.constructionProgressBase !== undefined && (previousProgress?.updatedAt ?? null) !== body.constructionProgressBase) {
      return NextResponse.json(
        { error: 'Alguien más guardó el avance de obra mientras lo editabas. Recargá para ver lo nuevo antes de volver a guardar.', code: 'construction_progress_conflict' },
        { status: 409 }
      );
    }
    const parsed = parseConstructionProgress(body.constructionProgress);
    nextProgress = parsed ? stampConstructionProgress(parsed) : null;
    updates.construction_progress = nextProgress;
  }
  if (body.showInPortfolio !== undefined) updates.show_in_portfolio = body.showInPortfolio;
  if (body.published !== undefined) {
    // Publicar exige el mínimo de lib/publish-readiness — el mismo que
    // muestra el panel. Se valida acá además de en el botón para que no
    // haya forma de dejar en línea un sitio roto (otra pantalla, a mano).
    if (body.published) {
      const { data: row } = await supabase.from('projects').select('slug').eq('id', projectId).maybeSingle();
      const project = row ? await getProjectBySlug(row.slug) : undefined;
      if (!project) return NextResponse.json({ error: 'Proyecto no encontrado' }, { status: 404 });
      const typeConfig = getProjectTypeConfig(project.projectType, body.saleMode ?? project.saleMode);
      const readiness = getPublishReadiness(
        { ...project, name: body.name ?? project.name },
        typeConfig
      );
      if (!readiness.canPublish) {
        return NextResponse.json(
          { error: `Todavía no se puede publicar. ${describeMissing(readiness.missing)}`, missing: readiness.missing },
          { status: 422 }
        );
      }
    }
    updates.published = body.published;
  }
  updates.updated_at = new Date().toISOString();

  const { data, error } = await supabase
    .from('projects')
    .update(updates)
    .eq('id', projectId)
    .select()
    .single();

  // Carrera entre el chequeo de arriba y el update: la constraint unique decide.
  if (error?.code === '23505' && body.slug !== undefined) return NextResponse.json({ error: 'Ese link ya lo usa otro proyecto. Probá con otro.' }, { status: 409 });
  if (error) return serverError(error);
  if (previousSlug) revalidateProjectBySlug(previousSlug);
  // Recién con el guardado hecho: si el borrado falla queda un archivo suelto,
  // no un avance perdido. Nunca lanza.
  if (body.constructionProgress !== undefined && previousProgress) {
    await removeOrphanedMedia(progressMediaUrls(previousProgress), nextProgress ? progressMediaUrls(nextProgress) : [], { bucket: 'project-media', folder: 'construction' });
  }
  return NextResponse.json(data);
}
