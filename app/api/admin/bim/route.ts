import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdminUser } from '@/lib/supabase/require-admin';
import { createClient } from '@/lib/supabase/server';
import { mapBimModelRow } from '@/data/bim-repository';
import { canPublishBimModel, MAX_GALLERY_IMAGES } from '@/lib/bim';
import { requireProjectAccess } from '@/lib/supabase/require-project-access';
import type { BimModelRow } from '@/types/database';

const createSchema = z.object({
  title: z.string(),
  description: z.string().optional(),
  galleryImages: z.array(z.string()).optional(),
  projectId: z.string().uuid().nullable().optional(),
  isPublic: z.boolean().optional(),
});

// Lista las piezas del autor logueado. La lee el admin; el portfolio
// público usa getPublicBimModelsByAuthor del repositorio, no esta ruta.
export async function GET() {
  const user = await requireAdminUser();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('bim_models')
    .select('*')
    .eq('author_id', user.id)
    .order('created_at', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ models: ((data ?? []) as BimModelRow[]).map(mapBimModelRow) });
}

export async function POST(request: Request) {
  const user = await requireAdminUser();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const parsed = createSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 });

  const { title, description, projectId, isPublic } = parsed.data;
  const galleryImages = (parsed.data.galleryImages ?? []).filter(u => u.trim().length > 0);

  if (title.trim().length === 0) {
    return NextResponse.json({ error: 'Falta el título.' }, { status: 400 });
  }
  if (galleryImages.length > MAX_GALLERY_IMAGES) {
    return NextResponse.json(
      { error: `Máximo ${MAX_GALLERY_IMAGES} imágenes por pieza — subiste ${galleryImages.length}.` },
      { status: 400 }
    );
  }

  // La fila que se inserta es propia (author_id = user.id), así que RLS
  // no protege contra asociarla a un proyecto ajeno con solo mandar su
  // uuid. Se valida a mano, ownership únicamente — un colaborador sin
  // ser dueño queda para el flujo de invitación de Fase 4.
  if (projectId) {
    const access = await requireProjectAccess(projectId);
    if (!access) return NextResponse.json({ error: 'No tenés acceso a ese proyecto.' }, { status: 400 });
  }

  // Una pieza con contenido nace publicada; una vacía queda en
  // 'processing' esperando que le suban el modelo (Fase 2) o fotos.
  const status = canPublishBimModel({ geometryUrl: null, galleryImages }) ? 'ready' : 'processing';

  const supabase = await createClient();

  // bim_models.author_id referencia profiles(id), no auth.users(id)
  // directo — y profiles es opt-in (se crea recién cuando la cuenta
  // define su handle en /admin/portfolio). Sin esto, una cuenta nueva
  // sin portfolio todavía se lleva un 500 crudo por la foreign key en
  // vez de un mensaje claro — mismo patrón que ya usan posts/events/
  // conversations para esta misma condición. Va al final, después de
  // validar el body y el projectId, para no gastar una consulta si el
  // pedido ya iba a fallar por otro motivo.
  const { data: profile } = await supabase.from('profiles').select('id').eq('id', user.id).maybeSingle();
  if (!profile) {
    return NextResponse.json({ error: 'Creá tu portfolio antes de publicar una pieza BIM.' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('bim_models')
    .insert({
      author_id: user.id,
      project_id: projectId ?? null,
      title: title.trim(),
      description: description?.trim() || null,
      gallery_images: galleryImages,
      cover_image: galleryImages[0] ?? null,
      is_public: isPublic ?? true,
      status,
    })
    .select('*')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ model: mapBimModelRow(data as BimModelRow) }, { status: 201 });
}
