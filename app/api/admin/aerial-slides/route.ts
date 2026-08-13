import { NextResponse } from 'next/server';
import { requireAdminUser } from '@/lib/supabase/require-admin';
import { createAdminClient } from '@/lib/supabase/admin';

import { DEFAULT_PROJECT_SLUG as PROJECT_SLUG } from '@/lib/constants';

export async function POST(request: Request) {
  const user = await requireAdminUser();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const body = await request.json();
  if (!body.imageUrl || !body.label) {
    return NextResponse.json({ error: 'Faltan imageUrl y/o label' }, { status: 400 });
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
    .from('aerial_slides')
    .insert({
      project_id: project.id,
      image_url: body.imageUrl,
      video_url: body.videoUrl || null,
      label: body.label,
      sort_order: body.sortOrder ?? 0,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
