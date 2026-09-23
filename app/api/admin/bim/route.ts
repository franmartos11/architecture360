import { NextResponse } from 'next/server';
import { z } from 'zod';
import { resolveRequestedProjectId, requireProjectAccess } from '@/lib/supabase/require-project-access';
import { mapBimModelRow } from '@/data/bim-repository';
import { canPublishBimModel, MAX_GALLERY_IMAGES } from '@/lib/bim';
import type { BimModelRow } from '@/types/database';

const createSchema = z.object({
  title: z.string(),
  description: z.string().optional(),
  galleryImages: z.array(z.string()).optional(),
  isPublic: z.boolean().optional(),
  floorIds: z.array(z.string()).optional(),
  unitIds: z.array(z.string()).optional(),
});

// Lista las piezas del proyecto activo (cookie de "proyecto activo", ver
// resolveRequestedProjectId) — la usa /admin/proyecto/bim y el paso del
// asistente guiado. El portfolio público ya no existe: la vitrina pública
// es la sección de la landing (getPublicBimModelsByProject).
export async function GET(request: Request) {
  const projectId = await resolveRequestedProjectId(request);
  if (!projectId) return NextResponse.json({ error: 'Proyecto no encontrado' }, { status: 404 });

  const access = await requireProjectAccess(projectId);
  if (!access) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const { data, error } = await access.supabase
    .from('bim_models')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ models: ((data ?? []) as BimModelRow[]).map(mapBimModelRow) });
}

export async function POST(request: Request) {
  const projectId = await resolveRequestedProjectId(request);
  if (!projectId) return NextResponse.json({ error: 'Proyecto no encontrado' }, { status: 404 });

  const access = await requireProjectAccess(projectId, { revalidate: true });
  if (!access) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const parsed = createSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 });

  const { title, description, isPublic, floorIds, unitIds } = parsed.data;
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

  // Una pieza con contenido nace publicada; una vacía queda en
  // 'processing' esperando que le suban el modelo (Fase C) o fotos.
  const status = canPublishBimModel({ geometryUrl: null, galleryImages }) ? 'ready' : 'processing';

  const { data, error } = await access.supabase
    .from('bim_models')
    .insert({
      project_id: projectId,
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

  const modelId = data.id;
  if (floorIds && floorIds.length > 0) {
    await access.supabase.from('bim_model_floors').insert(floorIds.map(f => ({ bim_model_id: modelId, floor_id: f })));
  }
  if (unitIds && unitIds.length > 0) {
    await access.supabase.from('bim_model_units').insert(unitIds.map(u => ({ bim_model_id: modelId, unit_id: u })));
  }

  const { data: finalData } = await access.supabase.from('bim_models').select('*, bim_model_floors(floor_id), bim_model_units(unit_id)').eq('id', modelId).single();

  return NextResponse.json({ model: mapBimModelRow(finalData as BimModelRow) }, { status: 201 });
}
