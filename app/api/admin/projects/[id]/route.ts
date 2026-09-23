import { NextResponse } from 'next/server';
import { requireProjectAccess } from '@/lib/supabase/require-project-access';
import { createAdminClient } from '@/lib/supabase/admin';
import { deleteProjectStorageFiles } from '@/lib/supabase/delete-project-storage';
import { deleteBimStorageFiles } from '@/lib/supabase/delete-bim-storage';

// Borra un proyecto entero. El cascade de la base (ver supabase/schema.sql)
// se lleva edificios/pisos/unidades, vistas aéreas, amenidades, ubicación,
// colaboradores, comentarios y piezas BIM solo. Dos cosas que el cascade
// NO resuelve:
// - Los leads (on delete set null en vez de cascade) — se borran acá a
//   mano para no dejar leads huérfanos apuntando a un proyecto que ya no
//   existe.
// - Los archivos en Supabase Storage — borrar filas nunca borra los
//   objetos que apuntaban, así que hay que juntarlos ANTES de borrar
//   nada (deleteProjectStorageFiles lee todas las tablas) y borrarlos del
//   bucket con el cliente admin, igual que /api/admin/upload los sube.
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await requireProjectAccess(id, { revalidate: true });
  if (!access) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const admin = createAdminClient();

  // Piezas BIM del proyecto: el cascade de la base (bim_models.project_id
  // on delete cascade, ver supabase/schema.sql) borra las FILAS solo al
  // borrar el proyecto — pero nunca los archivos de Storage que
  // apuntaban. Hay que juntarlos y borrarlos ANTES, con el cliente admin,
  // igual que ya hace deleteProjectStorageFiles con el resto del proyecto.
  const { data: bimRows } = await admin
    .from('bim_models')
    .select('id, geometry_url, properties_url, cover_image, source_url, gallery_images')
    .eq('project_id', id);

  if (bimRows && bimRows.length > 0) {
    await deleteBimStorageFiles(admin, bimRows);
  }

  await deleteProjectStorageFiles(admin, id);
  await admin.from('leads').delete().eq('project_id', id);

  const { error } = await admin.from('projects').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
