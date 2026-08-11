import { NextResponse } from 'next/server';
import { requireAdminUser } from '@/lib/supabase/require-admin';
import { createAdminClient } from '@/lib/supabase/admin';

const PROJECT_SLUG = 'demo';

export async function POST(request: Request) {
  const user = await requireAdminUser();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const body = await request.json();
  if (!body.name) {
    return NextResponse.json({ error: 'Falta name' }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: project, error: projectErr } = await admin
    .from('projects')
    .select('id')
    .eq('slug', PROJECT_SLUG)
    .maybeSingle();
  if (projectErr) return NextResponse.json({ error: projectErr.message }, { status: 500 });
  if (!project) return NextResponse.json({ error: 'Proyecto no encontrado' }, { status: 404 });

  const { data, error } = await admin
    .from('points_of_interest')
    .insert({
      project_id: project.id,
      name: body.name,
      category: body.category ?? 'otro',
      description: body.description ?? null,
      distance_label: body.distanceLabel ?? null,
      image: body.image ?? null,
      latitude: body.latitude ?? null,
      longitude: body.longitude ?? null,
      walk_minutes: body.walkMinutes != null ? Number(body.walkMinutes) : null,
      drive_minutes: body.driveMinutes != null ? Number(body.driveMinutes) : null,
      bike_minutes: body.bikeMinutes != null ? Number(body.bikeMinutes) : null,
      sort_order: body.sortOrder ?? 0,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
