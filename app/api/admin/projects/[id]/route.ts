import { NextResponse } from 'next/server';
import { requireProjectAccess } from '@/lib/supabase/require-project-access';
import { createAdminClient } from '@/lib/supabase/admin';
import { deleteProjectStorageFiles } from '@/lib/supabase/delete-project-storage';

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
  await deleteProjectStorageFiles(admin, id);
  await admin.from('leads').delete().eq('project_id', id);

  const { error } = await admin.from('projects').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
