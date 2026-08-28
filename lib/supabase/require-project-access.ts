import 'server-only';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { createClient } from './server';
import { getRequestUser } from './auth';
import { DEFAULT_PROJECT_SLUG } from '@/lib/constants';

// Nombre de la cookie que recuerda "con qué proyecto estoy trabajando" —
// la setea /admin/proyectos al elegir uno. No es un dato sensible: la
// pertenencia se re-valida siempre en requireProjectAccess(), así que si
// alguien la manipulara a mano solo lograría que la rechacen.
export const ACTIVE_PROJECT_COOKIE = 'active_project_id';

export interface ProjectAccess {
  user: User;
  /** Cliente scoped a la sesión de este usuario — respeta RLS, a diferencia
   *  del cliente de service-role. Las rutas deben usar ESTE cliente para
   *  leer/escribir datos de proyecto, no createAdminClient(). */
  supabase: SupabaseClient;
}

// Reemplaza a requireAdminUser() para todo lo que cuelga de un proyecto:
// no alcanza con "hay sesión", además hace falta ser el dueño DE ESE
// proyecto puntual. Devuelve el cliente de sesión del usuario para que
// la ruta lo use — así, cuando existan políticas RLS de escritura
// (próximo sprint), quedan aplicadas de verdad y no solo de nombre.
export async function requireProjectAccess(projectId: string): Promise<ProjectAccess | null> {
  const supabase = await createClient();
  const user = await getRequestUser();
  if (!user) return null;

  const { data: project } = await supabase
    .from('projects')
    .select('id')
    .eq('id', projectId)
    .eq('owner_id', user.id)
    .maybeSingle();
  if (!project) return null;

  return { user, supabase };
}

// ─── Resolver el project_id dueño de un recurso anidado ─────────────
// Las rutas de building/floor/unit reciben el id del recurso, no el del
// proyecto — hace falta subir la cadena de FKs antes de poder llamar a
// requireProjectAccess(). Las lecturas acá son públicas (no dependen de
// sesión), así que alcanza con el cliente anon/sesión.

export async function resolveProjectIdFromBuilding(buildingId: string): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase.from('buildings').select('project_id').eq('id', buildingId).maybeSingle();
  return data?.project_id ?? null;
}

export async function resolveProjectIdFromFloor(floorId: string): Promise<string | null> {
  const supabase = await createClient();
  const { data: floor } = await supabase.from('floors').select('building_id').eq('id', floorId).maybeSingle();
  if (!floor) return null;
  return resolveProjectIdFromBuilding(floor.building_id);
}

export async function resolveProjectIdFromUnit(unitId: string): Promise<string | null> {
  const supabase = await createClient();
  const { data: unit } = await supabase.from('units').select('floor_id').eq('id', unitId).maybeSingle();
  if (!unit) return null;
  return resolveProjectIdFromFloor(unit.floor_id);
}

export async function resolveProjectIdFromSlide(slideId: string): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase.from('aerial_slides').select('project_id').eq('id', slideId).maybeSingle();
  return data?.project_id ?? null;
}

export async function resolveProjectIdFromHotspot(hotspotId: string): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase.from('aerial_hotspots').select('slide_id').eq('id', hotspotId).maybeSingle();
  if (!data) return null;
  return resolveProjectIdFromSlide(data.slide_id);
}

export async function resolveProjectIdFromAmenity(amenityId: string): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase.from('amenities').select('project_id').eq('id', amenityId).maybeSingle();
  return data?.project_id ?? null;
}

export async function resolveProjectIdFromPoi(poiId: string): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase.from('points_of_interest').select('project_id').eq('id', poiId).maybeSingle();
  return data?.project_id ?? null;
}

export async function resolveProjectIdFromLead(leadId: string): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase.from('leads').select('project_id').eq('id', leadId).maybeSingle();
  return data?.project_id ?? null;
}

export async function resolveProjectIdFromCollaborator(collaboratorId: string): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase.from('project_collaborators').select('project_id').eq('id', collaboratorId).maybeSingle();
  return data?.project_id ?? null;
}

// La cookie de "proyecto activo" que setea /admin/proyectos al elegir uno;
// si no hay (cuenta que nunca pasó por el selector), cae al proyecto de
// siempre — para que el proyecto demo original siga funcionando igual.
// Se usa tanto desde rutas API (con Request) como desde el layout server
// del panel (sin Request, ver resolveActiveProjectId más abajo).
export async function resolveActiveProjectId(): Promise<string | null> {
  const cookieStore = await cookies();
  const active = cookieStore.get(ACTIVE_PROJECT_COOKIE)?.value;
  if (active) return active;

  const supabase = await createClient();
  const { data } = await supabase.from('projects').select('id').eq('slug', DEFAULT_PROJECT_SLUG).maybeSingle();
  return data?.id ?? null;
}

// Igual que resolveActiveProjectId, pero para rutas API: además de la
// cookie, respeta un ?projectId= explícito si algún día alguna ruta lo
// manda a propósito (ninguna lo hace todavía).
export async function resolveRequestedProjectId(request: Request): Promise<string | null> {
  const { searchParams } = new URL(request.url);
  const explicit = searchParams.get('projectId');
  if (explicit) return explicit;
  return resolveActiveProjectId();
}
