import { NextResponse } from 'next/server';
import { requireProjectAccess, resolveRequestedProjectId } from '@/lib/supabase/require-project-access';

export async function POST(request: Request) {
  const projectId = await resolveRequestedProjectId(request);
  if (!projectId) return NextResponse.json({ error: 'Proyecto no encontrado' }, { status: 404 });

  const access = await requireProjectAccess(projectId);
  if (!access) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const { supabase } = access;

  const body = await request.json();
  if (!body.imageUrl || !body.label) {
    return NextResponse.json({ error: 'Faltan imageUrl y/o label' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('aerial_slides')
    .insert({
      project_id: projectId,
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
