import { NextResponse } from 'next/server';
import { requireProjectAccess, resolveRequestedProjectId } from '@/lib/supabase/require-project-access';

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

  const body = await request.json();

  const updates: Record<string, unknown> = {};
  if (body.name !== undefined) updates.name = body.name;
  if (body.description !== undefined) updates.description = body.description;
  if (body.tagline !== undefined) updates.tagline = body.tagline;
  if (body.sectionConfig !== undefined) updates.section_config = body.sectionConfig;
  if (body.themeConfig !== undefined) updates.theme_config = body.themeConfig;
  if (body.location !== undefined) updates.location = body.location;
  if (body.latitude !== undefined) updates.latitude = body.latitude;
  if (body.longitude !== undefined) updates.longitude = body.longitude;
  if (body.masterplanImage !== undefined) updates.masterplan_image = body.masterplanImage;
  if (body.commonAreasTour !== undefined) updates.common_areas_tour = body.commonAreasTour;
  if (body.tourOrientationDegrees !== undefined) updates.tour_orientation_degrees = body.tourOrientationDegrees;
  if (body.academicInstitution !== undefined) updates.academic_institution = body.academicInstitution;
  if (body.academicCareer !== undefined) updates.academic_career = body.academicCareer;
  if (body.academicTutor !== undefined) updates.academic_tutor = body.academicTutor;
  if (body.academicYear !== undefined) updates.academic_year = body.academicYear;
  if (body.academicTeam !== undefined) updates.academic_team = body.academicTeam;
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
