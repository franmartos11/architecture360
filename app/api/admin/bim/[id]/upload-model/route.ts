import { NextResponse } from 'next/server';
import { resolveProjectIdFromBimModel, requireProjectAccess } from '@/lib/supabase/require-project-access';
import { createAdminClient } from '@/lib/supabase/admin';
import { BIM_BUCKET, MAX_GEOMETRY_BYTES } from '@/lib/bim';
import { mapBimModelRow } from '@/data/bim-repository';
import type { BimModelRow } from '@/types/database';

// Tipos MIME que acepta el upload de modelo 3D. `application/octet-stream`
// es lo que mandan algunos browsers cuando no reconocen la extensión —
// en ese caso se valida por extensión más abajo.
const ALLOWED_TYPES = new Set([
  'model/gltf-binary',      // .glb
  'model/gltf+json',        // .gltf
  'application/octet-stream', // fallback genérico
]);
const ALLOWED_EXTENSIONS = new Set(['glb', 'gltf']);

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { action, ext } = body;

    const projectId = await resolveProjectIdFromBimModel(id);
    if (!projectId) return NextResponse.json({ error: 'Pieza no encontrada' }, { status: 404 });

    const access = await requireProjectAccess(projectId);
    if (!access) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

    const admin = createAdminClient();

    if (action === 'get-url') {
      if (!ALLOWED_EXTENSIONS.has(ext)) {
        return NextResponse.json({ error: `Extensión .${ext} no permitida.` }, { status: 400 });
      }

      const storagePath = `${id}/model.${ext}`;
      
      // Intentar borrar archivo anterior (no critico)
      const { data: currentData } = await access.supabase.from('bim_models').select('*').eq('id', id).maybeSingle();
      if (currentData?.geometry_url) {
        try {
          const oldPath = new URL(currentData.geometry_url).pathname.split(`/${BIM_BUCKET}/`)[1];
          if (oldPath) await admin.storage.from(BIM_BUCKET).remove([oldPath]);
        } catch { }
      }

      const { data, error } = await admin.storage.from(BIM_BUCKET).createSignedUploadUrl(storagePath);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      
      return NextResponse.json({ signedUrl: data.signedUrl, path: data.path });
    }

    if (action === 'complete') {
      const storagePath = `${id}/model.${ext}`;
      const { data: urlData } = admin.storage.from(BIM_BUCKET).getPublicUrl(storagePath);

      const { data, error } = await access.supabase
        .from('bim_models')
        .update({
          geometry_url: urlData.publicUrl,
          status: 'ready',
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select('*')
        .single();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });

      return NextResponse.json({ model: mapBimModelRow(data as BimModelRow) });
    }

    return NextResponse.json({ error: 'Acción inválida' }, { status: 400 });

  } catch (error: any) {
    return NextResponse.json({ error: `Server error: ${error.message || String(error)}` }, { status: 500 });
  }
}
