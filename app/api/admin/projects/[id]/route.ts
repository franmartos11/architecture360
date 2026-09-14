import { NextResponse } from 'next/server';
import { requireProjectAccess } from '@/lib/supabase/require-project-access';
import { createAdminClient } from '@/lib/supabase/admin';
import { deleteProjectStorageFiles } from '@/lib/supabase/delete-project-storage';
import { deleteBimStorageFiles } from '@/lib/supabase/delete-bim-storage';

// Borra un proyecto entero. El cascade de la base (ver supabase/schema.sql)
// se lleva edificios/pisos/unidades, vistas aéreas, amenidades, ubicación,
// colaboradores y comentarios solo. Dos cosas que el cascade NO resuelve:
// - Los leads (on delete set null en vez de cascade) — se borran acá a
//   mano para no dejar leads huérfanos apuntando a un proyecto que ya no
//   existe.
// - Los archivos en Supabase Storage — borrar filas nunca borra los
//   objetos que apuntaban, así que hay que juntarlos ANTES de borrar
//   nada (deleteProjectStorageFiles lee todas las tablas) y borrarlos del
//   bucket con el cliente admin, igual que /api/admin/upload los sube.
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await requireProjectAccess(id);
  if (!access) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const admin = createAdminClient();

  // Piezas BIM asociadas: viven en el portfolio del AUTOR, no del
  // proyecto, así que el modal pregunta qué hacer con ellas. Sin el flag
  // se quedan (project_id pasa a null por el on delete set null del
  // schema). Con el flag solo se borran las del que está borrando: el
  // dueño del proyecto no puede borrarle una pieza de portfolio a un
  // colaborador — esas se desvinculan igual que sin el flag.
  const deleteBim = new URL(request.url).searchParams.get('deleteBim') === 'true';
  const { data: bimRows } = await admin
    .from('bim_models')
    .select('id, author_id, geometry_url, properties_url, cover_image, source_url, gallery_images')
    .eq('project_id', id);

  const own = (bimRows ?? []).filter(m => m.author_id === access.user.id);
  if (deleteBim && own.length > 0) {
    await deleteBimStorageFiles(admin, own);
    await admin.from('bim_models').delete().in('id', own.map(m => m.id));
  }

  await deleteProjectStorageFiles(admin, id);
  await admin.from('leads').delete().eq('project_id', id);

  const { error } = await admin.from('projects').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
