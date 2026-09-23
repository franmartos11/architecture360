import 'server-only';
import { revalidateTag } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { projectCacheTag } from '@/data/project-repository';

// El segundo argumento de revalidateTag es un perfil de cache-life, no un
// modo de invalidación: dice cada cuánto se considera vieja la entrada de
// acá en adelante. 'max' la daría por fresca 30 días — o sea, lo contrario
// de lo que queremos. 'seconds' (revalidate: 1) la vence enseguida, que es
// la forma de invalidar de verdad desde un Route Handler. updateTag, que
// sería lo directo, solo se puede llamar desde un Server Action.
const INVALIDAR_YA = 'seconds';

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
