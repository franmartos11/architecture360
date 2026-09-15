import { NextResponse } from 'next/server';
import { z } from 'zod';
import { resolveProjectIdFromBimModel, requireProjectAccess } from '@/lib/supabase/require-project-access';
import { createAdminClient } from '@/lib/supabase/admin';
import { deleteBimStorageFiles } from '@/lib/supabase/delete-bim-storage';
import { mapBimModelRow } from '@/data/bim-repository';
import { canPublishBimModel, MAX_GALLERY_IMAGES } from '@/lib/bim';
import type { BimModelRow } from '@/types/database';

const patchSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  galleryImages: z.array(z.string()).optional(),
  isPublic: z.boolean().optional(),
  floorIds: z.array(z.string()).optional(),
  unitIds: z.array(z.string()).optional(),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const projectId = await resolveProjectIdFromBimModel(id);
  if (!projectId) return NextResponse.json({ error: 'Pieza no encontrada' }, { status: 404 });

  const access = await requireProjectAccess(projectId);
  if (!access) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const parsed = patchSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 });

  const { data: currentData } = await access.supabase.from('bim_models').select('*').eq('id', id).maybeSingle();
  const current = currentData as BimModelRow | null;
  if (!current) return NextResponse.json({ error: 'Pieza no encontrada' }, { status: 404 });

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
  // conversión (Fase C), no editar el título.
  const publishable = canPublishBimModel({ geometryUrl: current.geometry_url, galleryImages });
  const status = current.status === 'failed' ? 'failed' : publishable ? 'ready' : 'processing';

  // La portada solo se toca si la que había dejó de existir: si la Fase C
  // ya puso una captura del modelo, editar la galería no debe pisarla.
  const coverStillThere = current.cover_image && galleryImages.includes(current.cover_image);
  const coverFromModel = current.cover_image && !current.gallery_images.includes(current.cover_image);
  const cover_image = coverStillThere || coverFromModel ? current.cover_image : galleryImages[0] ?? null;

  // projectId ya no se acepta del body — la pieza nace y muere en su
  // proyecto, no se reasocia (ver spec, decisión 1).
  const { data, error } = await access.supabase
    .from('bim_models')
    .update({
      ...(parsed.data.title !== undefined ? { title: parsed.data.title.trim() } : {}),
      ...(parsed.data.description !== undefined ? { description: parsed.data.description.trim() || null } : {}),
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

  if (parsed.data.floorIds !== undefined) {
    await access.supabase.from('bim_model_floors').delete().eq('bim_model_id', id);
    if (parsed.data.floorIds.length > 0) {
      await access.supabase.from('bim_model_floors').insert(parsed.data.floorIds.map(f => ({ bim_model_id: id, floor_id: f })));
    }
  }

  if (parsed.data.unitIds !== undefined) {
    await access.supabase.from('bim_model_units').delete().eq('bim_model_id', id);
    if (parsed.data.unitIds.length > 0) {
      await access.supabase.from('bim_model_units').insert(parsed.data.unitIds.map(u => ({ bim_model_id: id, unit_id: u })));
    }
  }

  const { data: finalData } = await access.supabase.from('bim_models').select('*, bim_model_floors(floor_id), bim_model_units(unit_id)').eq('id', id).single();

  return NextResponse.json({ model: mapBimModelRow(finalData as BimModelRow) });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const projectId = await resolveProjectIdFromBimModel(id);
  if (!projectId) return NextResponse.json({ error: 'Pieza no encontrada' }, { status: 404 });

  const access = await requireProjectAccess(projectId);
  if (!access) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const { data: currentData } = await access.supabase.from('bim_models').select('*').eq('id', id).maybeSingle();
  const current = currentData as BimModelRow | null;
  if (!current) return NextResponse.json({ error: 'Pieza no encontrada' }, { status: 404 });

  // Primero los archivos (hace falta la fila para saber qué URLs tenía),
  // después la fila. El cliente admin es el único que puede borrar del
  // bucket, igual que en /api/admin/upload.
  await deleteBimStorageFiles(createAdminClient(), [current]);

  const { error } = await access.supabase.from('bim_models').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
