import 'server-only';
import { revalidateTag } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { projectCacheTag } from '@/data/project-repository';

// El segundo argumento de revalidateTag es un perfil de cache-life, no un
// modo de invalidación. Un perfil con nombre ('max', 'seconds'…) marca la
// entrada como VIEJA: Next la sigue sirviendo una vez más mientras la rehace
// en segundo plano — así, el primero en entrar después de guardar (casi
// siempre el propio dueño, recién publicado) veía la versión anterior, o el
// 404 de cuando era borrador. { expire: 0 } la da por VENCIDA: la próxima
// visita espera la versión nueva. updateTag, que sería lo directo, solo se
// puede llamar desde un Server Action.
const INVALIDAR_YA = { expire: 0 };

/**
 * Tira la caché del microsite de un proyecto.
 *
 * Va DESPUÉS de escribir, nunca antes: si se invalidara primero, una visita
 * que entre en el medio volvería a cachear el contenido viejo y el cambio no
 * se vería hasta la próxima escritura.
 *
 * Recibe el id porque es lo que tienen a mano las rutas del admin; el slug
 * (que es con lo que se arma el tag) sale de una consulta chica. Si algo
 * falla no se corta la respuesta: el cambio ya se guardó, y lo peor que pasa
 * es que el público lo vea cuando venza el revalidate.
 */
export async function revalidateProjectById(projectId: string): Promise<void> {
  try {
    const { data } = await createAdminClient()
      .from('projects')
      .select('slug')
      .eq('id', projectId)
      .maybeSingle();
    if (data?.slug) revalidateTag(projectCacheTag(data.slug), INVALIDAR_YA);
  } catch {
    // Ver arriba: no vale la pena fallar la escritura por esto.
  }
}

/** Igual que la anterior, cuando el slug ya está a mano y no hace falta buscarlo. */
export function revalidateProjectBySlug(slug: string): void {
  revalidateTag(projectCacheTag(slug), INVALIDAR_YA);
}
