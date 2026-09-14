import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdminUser } from '@/lib/supabase/require-admin';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { deleteBimStorageFiles } from '@/lib/supabase/delete-bim-storage';
import { mapBimModelRow } from '@/data/bim-repository';
import { canPublishBimModel, MAX_GALLERY_IMAGES } from '@/lib/bim';
import { requireProjectAccess } from '@/lib/supabase/require-project-access';
import type { BimModelRow } from '@/types/database';

const patchSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  galleryImages: z.array(z.string()).optional(),
  projectId: z.string().uuid().nullable().optional(),
  isPublic: z.boolean().optional(),
});

// OJO: bim_models también tiene una política RLS de lectura PÚBLICA
// (is_public = true and status = 'ready'), así que el cliente de sesión
// SÍ puede leer una pieza ajena ya publicada — no alcanza con dejar que
// RLS "oculte" lo que no es tuyo. Por eso acá filtramos por author_id a
// mano: sin esto, loadOwn devolvía piezas de otros autores como si
// fueran propias, PATCH se estrellaba contra la política de escritura
// (bloqueada, pero después de ya haber leído la fila ajena) y DELETE
// terminaba borrando los archivos de Storage de un desconocido con el
// cliente admin antes de que el borrado de la fila fallara silenciosamente.
async function loadOwn(supabase: Awaited<ReturnType<typeof createClient>>, id: string, authorId: string) {
  const { data } = await supabase.from('bim_models').select('*').eq('id', id).eq('author_id', authorId).maybeSingle();
  return (data as BimModelRow | null) ?? null;
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireAdminUser();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const parsed = patchSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 });

  const supabase = await createClient();
  const current = await loadOwn(supabase, id, user.id);
  if (!current) return NextResponse.json({ error: 'Pieza no encontrada' }, { status: 404 });

  // Asociar la pieza a un proyecto ajeno no lo bloquea RLS (la fila
  // sigue siendo propia), así que hace falta chequearlo a mano — igual
  // que en POST. Ownership únicamente por ahora: un colaborador sin ser
  // dueño queda para cuando exista el flujo de invitación (Fase 4).
  if (parsed.data.projectId !== undefined && parsed.data.projectId !== null) {
    const access = await requireProjectAccess(parsed.data.projectId);
    if (!access) return NextResponse.json({ error: 'No tenés acceso a ese proyecto.' }, { status: 400 });
  }

  const galleryImages = parsed.data.galleryImages
    ? parsed.data.galleryImages.filter(u => u.trim().length > 0)
    : current.gallery_images;

  if (galleryImages.length > MAX_GALLERY_IMAGES) {
    return NextResponse.json(
      { error: `Máximo ${MAX_GALLERY_IMAGES} imágenes por pieza — mandaste ${galleryImages.length}.` },
      { status: 400 }
    );
  }
  if (parsed.data.title !== undefined && parsed.data.title.trim().length === 0) {
    return NextResponse.json({ error: 'Falta el título.' }, { status: 400 });
  }

  // El estado se RECALCULA en cada edición: sacar la última foto de una
  // pieza sin modelo la despublica, y agregar la primera la publica. Una
  // pieza fallida se deja en 'failed' — eso lo resuelve reintentar la
  // conversión (Fase 2), no editar el título.
  const publishable = canPublishBimModel({ geometryUrl: current.geometry_url, galleryImages });
  const status = current.status === 'failed' ? 'failed' : publishable ? 'ready' : 'processing';

  // La portada solo se toca si la que había dejó de existir: si la Fase 2
  // ya puso una captura del modelo, editar la galería no debe pisarla.
  const coverStillThere = current.cover_image && galleryImages.includes(current.cover_image);
  const coverFromModel = current.cover_image && !current.gallery_images.includes(current.cover_image);
  const cover_image = coverStillThere || coverFromModel ? current.cover_image : galleryImages[0] ?? null;

  const { data, error } = await supabase
    .from('bim_models')
    .update({
      ...(parsed.data.title !== undefined ? { title: parsed.data.title.trim() } : {}),
      ...(parsed.data.description !== undefined ? { description: parsed.data.description.trim() || null } : {}),
      ...(parsed.data.projectId !== undefined ? { project_id: parsed.data.projectId } : {}),
      ...(parsed.data.isPublic !== undefined ? { is_public: parsed.data.isPublic } : {}),
      gallery_images: galleryImages,
      cover_image,
      status,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select('*')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ model: mapBimModelRow(data as BimModelRow) });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireAdminUser();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const supabase = await createClient();
  const current = await loadOwn(supabase, id, user.id);
  if (!current) return NextResponse.json({ error: 'Pieza no encontrada' }, { status: 404 });

  // Primero los archivos (hace falta la fila para saber qué URLs tenía),
  // después la fila. El cliente admin es el único que puede borrar del
  // bucket, igual que en /api/admin/upload.
  await deleteBimStorageFiles(createAdminClient(), [current]);

  const { error } = await supabase.from('bim_models').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
