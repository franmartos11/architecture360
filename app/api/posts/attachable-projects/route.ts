import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// Lista liviana de "mis proyectos" para el picker de adjuntar Proyecto o
// Recorrido 360 en el composer del feed — a diferencia de
// /api/admin/projects (pensado para el dashboard "Mis proyectos", trae
// progreso/leads/comentarios y es pesado), acá solo va lo necesario para
// listar y armar la card embebida en el post.
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const { data, error } = await supabase
    .from('projects')
    .select('id, slug, name, location, masterplan_image, published, common_areas_tour')
    .eq('owner_id', user.id)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const projects = (data ?? []).map(p => ({
    id: p.id,
    slug: p.slug,
    name: p.name,
    location: p.location,
    masterplanImage: p.masterplan_image,
    published: p.published,
    hasTour: !!p.common_areas_tour,
  }));

  return NextResponse.json({ projects });
}
