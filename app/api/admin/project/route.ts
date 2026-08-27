import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireProjectAccess, resolveRequestedProjectId } from '@/lib/supabase/require-project-access';
import { parseJsonBody } from '@/lib/api-validate';
import { sanitizeText, sanitizeMultiline } from '@/lib/sanitize';
import { PROJECT_SALE_MODES, isValidTypeCombo } from '@/lib/project-types';

const SALE_MODE_KEYS = Object.keys(PROJECT_SALE_MODES) as [string, ...string[]];

// sectionConfig/themeConfig/commonAreasTour/processGallery/beforeAfter son
// blobs JSON grandes y con forma propia (config del sitio, tour 360°,
// galería de proceso) — se aceptan sin validar su estructura interna acá
// (fuera de alcance de este endurecimiento puntual); lo que sí se valida
// es todo el texto libre que termina en la ficha pública del proyecto.
const projectPatchSchema = z.object({
  name: z.string().max(200).optional(),
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
  sectionConfig: z.unknown().optional(),
  themeConfig: z.unknown().optional(),
  location: z.string().max(300).nullable().optional(),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  masterplanImage: z.string().max(1000).nullable().optional(),
  commonAreasTour: z.unknown().optional(),
  tourOrientationDegrees: z.number().min(0).max(360).nullable().optional(),
  academicInstitution: z.string().max(200).nullable().optional(),
  academicCareer: z.string().max(200).nullable().optional(),
  academicTutor: z.string().max(200).nullable().optional(),
  academicYear: z.string().max(20).nullable().optional(),
  academicTeam: z.string().max(500).nullable().optional(),
  processGallery: z.unknown().optional(),
  beforeAfter: z.unknown().optional(),
  showInPortfolio: z.boolean().optional(),
});

export async function GET(request: Request) {
  const projectId = await resolveRequestedProjectId(request);
  if (!projectId) return NextResponse.json({ error: 'Proyecto no encontrado' }, { status: 404 });

  const access = await requireProjectAccess(projectId);
  if (!access) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const { supabase } = access;

  const { data: project, error } = await supabase.from('projects').select('*').eq('id', projectId).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!project) return NextResponse.json({ error: 'Proyecto no encontrado' }, { status: 404 });

  const [{ data: buildings }, { slides, hotspots }, { data: amenities }, { data: pointsOfInterest }, { data: collaborators }, comments] = await Promise.all([
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
  ]);

  return NextResponse.json({
    project,
    buildings: buildings ?? [],
    slides: slides ?? [],
    hotspots: hotspots ?? [],
    amenities: amenities ?? [],
    pointsOfInterest: pointsOfInterest ?? [],
    collaborators: collaborators ?? [],
    comments,
  });
}

export async function PATCH(request: Request) {
  const projectId = await resolveRequestedProjectId(request);
  if (!projectId) return NextResponse.json({ error: 'Proyecto no encontrado' }, { status: 404 });

  const access = await requireProjectAccess(projectId);
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
  if (body.showInPortfolio !== undefined) updates.show_in_portfolio = body.showInPortfolio;
  updates.updated_at = new Date().toISOString();

  const { data, error } = await supabase
    .from('projects')
    .update(updates)
    .eq('id', projectId)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
