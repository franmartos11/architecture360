import { NextResponse } from 'next/server';
import { requireAdminUser } from '@/lib/supabase/require-admin';
import { createAdminClient } from '@/lib/supabase/admin';

// Nota: el sitio hoy solo sirve un proyecto ('demo'), igual que el
// resto de la app (Navbar/homepage también lo hardcodean).
const PROJECT_SLUG = 'demo';

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

  const { data: buildings } = await admin
    .from('buildings')
    .select('*')
    .eq('project_id', project.id)
    .order('slug');

  const { data: slides } = await admin
    .from('aerial_slides')
    .select('*')
    .eq('project_id', project.id)
    .order('sort_order');

  const slideIds = (slides ?? []).map(s => s.id);
  const { data: hotspots } = slideIds.length
    ? await admin.from('aerial_hotspots').select('*').in('slide_id', slideIds)
    : { data: [] };

  return NextResponse.json({
    project,
    buildings: buildings ?? [],
    slides: slides ?? [],
    hotspots: hotspots ?? [],
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
  if (body.masterplanImage !== undefined) updates.masterplan_image = body.masterplanImage;
  if (body.amenities !== undefined) updates.amenities = body.amenities;
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
