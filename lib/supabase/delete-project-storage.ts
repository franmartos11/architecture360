import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

const BUCKET = 'project-media';

interface TourNodeLike { imageUrl?: string | null }
interface TourDataLike { nodes?: TourNodeLike[] | null }
interface LevelLike { planImage?: string | null }
interface BeforeAfterLike { beforeImage?: string | null; afterImage?: string | null }
interface ThemeConfigLike { backgroundImageUrl?: string | null }

// De una URL pública de Supabase Storage extrae la key relativa al bucket
// (lo que pide storage.remove()) — "https://xxx.supabase.co/storage/v1/
// object/public/project-media/units/foo.png" → "units/foo.png". Cualquier
// URL que no sea de nuestro bucket (una pegada a mano, un asset de
// /public/ local, etc.) no tiene nada que borrar acá — se ignora.
function toStorageKey(url: string | null | undefined): string | null {
  if (!url) return null;
  const marker = `/${BUCKET}/`;
  const i = url.indexOf(marker);
  if (i === -1) return null;
  return url.slice(i + marker.length);
}

function collectFromTourData(tourData: TourDataLike | null | undefined, into: (string | null | undefined)[]) {
  for (const node of tourData?.nodes ?? []) into.push(node?.imageUrl);
}

// Junta y borra del bucket TODOS los archivos que pertenecen a un
// proyecto — se llama ANTES de borrar las filas (necesita leerlas para
// saber qué URLs tenían) desde DELETE /api/admin/projects/[id]. Recorre
// cada tabla/columna con archivos subidos (ver supabase/schema.sql);
// nada de esto pasaba antes — borrar un proyecto (o un edificio, una
// unidad) solo borraba las filas y dejaba los archivos huérfanos en
// Storage para siempre.
export async function deleteProjectStorageFiles(supabase: SupabaseClient, projectId: string): Promise<void> {
  const urls: (string | null | undefined)[] = [];

  const { data: project } = await supabase
    .from('projects')
    .select('masterplan_image, process_gallery, before_after, theme_config, common_areas_tour')
    .eq('id', projectId)
    .maybeSingle();
  if (project) {
    urls.push(project.masterplan_image);
    for (const img of (project.process_gallery ?? []) as string[]) urls.push(img);
    for (const pair of (project.before_after ?? []) as BeforeAfterLike[]) {
      urls.push(pair.beforeImage, pair.afterImage);
    }
    urls.push((project.theme_config as ThemeConfigLike | null)?.backgroundImageUrl);
    collectFromTourData(project.common_areas_tour as TourDataLike | null, urls);
  }

  const { data: buildings } = await supabase.from('buildings').select('id, cover_image, amenities_tour').eq('project_id', projectId);
  for (const b of buildings ?? []) {
    urls.push(b.cover_image);
    collectFromTourData(b.amenities_tour as TourDataLike | null, urls);
  }
  const buildingIds = (buildings ?? []).map(b => b.id);

  const { data: floors } = buildingIds.length
    ? await supabase.from('floors').select('id, plan_image').in('building_id', buildingIds)
    : { data: [] };
  for (const f of floors ?? []) urls.push(f.plan_image);
  const floorIds = (floors ?? []).map(f => f.id);

  const { data: units } = floorIds.length
    ? await supabase
        .from('units')
        .select('interior_image_url, gallery_images, floor_plan_3d_url, plan_3d_url, technical_plan_url, room_plan_image, tour_image_url, tour_data, levels')
        .in('floor_id', floorIds)
    : { data: [] };
  for (const u of units ?? []) {
    urls.push(u.interior_image_url, u.floor_plan_3d_url, u.plan_3d_url, u.technical_plan_url, u.room_plan_image, u.tour_image_url);
    for (const img of (u.gallery_images ?? []) as string[]) urls.push(img);
    collectFromTourData(u.tour_data as TourDataLike | null, urls);
    for (const level of (u.levels ?? []) as LevelLike[]) urls.push(level.planImage);
  }

  const { data: slides } = await supabase.from('aerial_slides').select('image_url, video_url').eq('project_id', projectId);
  for (const s of slides ?? []) urls.push(s.image_url, s.video_url);

  const { data: amenities } = await supabase.from('amenities').select('images').eq('project_id', projectId);
  for (const a of amenities ?? []) {
    for (const img of (a.images ?? []) as string[]) urls.push(img);
  }

  const { data: pois } = await supabase.from('points_of_interest').select('image').eq('project_id', projectId);
  for (const p of pois ?? []) urls.push(p.image);

  const keys = [...new Set(urls.map(toStorageKey).filter((k): k is string => !!k))];
  if (keys.length === 0) return;

  // remove() acepta un array grande, pero se manda en tandas para no
  // depender de un límite no documentado de la API de Storage.
  const CHUNK = 100;
  for (let i = 0; i < keys.length; i += CHUNK) {
    await supabase.storage.from(BUCKET).remove(keys.slice(i, i + CHUNK));
  }
}
