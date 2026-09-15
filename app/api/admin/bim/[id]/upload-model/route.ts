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

    const projectId = await resolveProjectIdFromBimModel(id);
    if (!projectId) return NextResponse.json({ error: 'Pieza no encontrada' }, { status: 404 });

    const access = await requireProjectAccess(projectId);
    if (!access) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

    const fileName = decodeURIComponent(request.headers.get('x-file-name') || '');
    const fileType = request.headers.get('x-file-type') || 'application/octet-stream';
    
    if (!fileName) {
      return NextResponse.json({ error: 'Falta el nombre del archivo' }, { status: 400 });
    }

    const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      return NextResponse.json(
        { error: `Solo se aceptan archivos .glb o .gltf — recibí ".${ext}".` },
        { status: 400 }
      );
    }

    const baseType = fileType.split(';')[0].trim();
    if (!ALLOWED_TYPES.has(baseType)) {
      return NextResponse.json(
        { error: `Tipo de archivo no permitido: ${fileType}` },
        { status: 400 }
      );
    }

    const bytes = await request.arrayBuffer();

    if (bytes.byteLength > MAX_GEOMETRY_BYTES) {
      return NextResponse.json(
        { error: `El modelo pesa más de ${MAX_GEOMETRY_BYTES / (1024 * 1024)}MB.` },
        { status: 400 }
      );
    }

    const { data: currentData } = await access.supabase
      .from('bim_models').select('*').eq('id', id).maybeSingle();
    const current = currentData as BimModelRow | null;
    if (!current) return NextResponse.json({ error: 'Pieza no encontrada' }, { status: 404 });

    const admin = createAdminClient();
    const storagePath = `${id}/model.${ext}`;

    if (current.geometry_url) {
      try {
        const oldPath = new URL(current.geometry_url).pathname.split(`/${BIM_BUCKET}/`)[1];
        if (oldPath) await admin.storage.from(BIM_BUCKET).remove([oldPath]);
      } catch {
        // ignorar
      }
    }

    const { error: uploadError } = await admin.storage.from(BIM_BUCKET).upload(storagePath, bytes, {
      contentType: ext === 'glb' ? 'model/gltf-binary' : 'model/gltf+json',
      upsert: true,
    });
    if (uploadError) {
      return NextResponse.json({ error: `Storage error: ${uploadError.message}` }, { status: 500 });
    }

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
    if (error) return NextResponse.json({ error: `DB error: ${error.message}` }, { status: 500 });

    return NextResponse.json({ model: mapBimModelRow(data as BimModelRow) });
  } catch (error: any) {
    return NextResponse.json({ error: `Server error: ${error.message || String(error)}`, stack: error.stack }, { status: 500 });
  }
}
