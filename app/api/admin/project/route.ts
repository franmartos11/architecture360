import { NextResponse } from 'next/server';
import { requireAdminUser } from '@/lib/supabase/require-admin';
import { createAdminClient } from '@/lib/supabase/admin';

import { DEFAULT_PROJECT_SLUG as PROJECT_SLUG } from '@/lib/constants';

export async function GET() {
  const user = await requireAdminUser();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const admin = createAdminClient();
  const { data: project, error } = await admin
    .from('projects')
    .select('*')
    .eq('slug', PROJECT_SLUG)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!project) return NextResponse.json({ error: 'Proyecto no encontrado' }, { status: 404 });

  const [{ data: buildings }, { slides, hotspots }, { data: amenities }, { data: pointsOfInterest }] = await Promise.all([
    admin.from('buildings').select('*').eq('project_id', project.id).order('slug'),
    (async () => {
      const { data: slides } = await admin
        .from('aerial_slides')
        .select('*')
        .eq('project_id', project.id)
        .order('sort_order');
      const slideIds = (slides ?? []).map(s => s.id);
      const { data: hotspots } = slideIds.length
        ? await admin.from('aerial_hotspots').select('*').in('slide_id', slideIds)
        : { data: [] };
      return { slides: slides ?? [], hotspots: hotspots ?? [] };
    })(),
    admin.from('amenities').select('*').eq('project_id', project.id).order('sort_order'),
    admin.from('points_of_interest').select('*').eq('project_id', project.id).order('sort_order'),
  ]);

  return NextResponse.json({
    project,
    buildings: buildings ?? [],
    slides: slides ?? [],
    hotspots: hotspots ?? [],
    amenities: amenities ?? [],
    pointsOfInterest: pointsOfInterest ?? [],
  });
}

export async function PATCH(request: Request) {
  const user = await requireAdminUser();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const body = await request.json();
  const admin = createAdminClient();

  const updates: Record<string, unknown> = {};
  if (body.name !== undefined) updates.name = body.name;
  if (body.description !== undefined) updates.description = body.description;
  if (body.location !== undefined) updates.location = body.location;
  if (body.latitude !== undefined) updates.latitude = body.latitude;
  if (body.longitude !== undefined) updates.longitude = body.longitude;
  if (body.masterplanImage !== undefined) updates.masterplan_image = body.masterplanImage;
  if (body.commonAreasTour !== undefined) updates.common_areas_tour = body.commonAreasTour;
  updates.updated_at = new Date().toISOString();

  const { data, error } = await admin
    .from('projects')
    .update(updates)
    .eq('slug', PROJECT_SLUG)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
