import { createClient } from '@/lib/supabase/server';
import { getRequestUser } from '@/lib/supabase/auth';

export interface FeedRailData {
  loggedIn: boolean;
  userId: string | null;
  profileHandle: string | null;
  displayName: string | null;
  avatarImage: string | null;
  followerCount: number;
  hasFollowing: boolean;
  projectsCount: number;
  collaborationsCount: number;
  viewsToday: number;
  draftProject: { name: string } | null;
}

// Datos del rail izquierdo del feed (tarjeta de perfil + borrador
// pendiente) — usado por /feed, /guardados y /etiqueta/[tag], que
// comparten el mismo cascarón de 3 columnas (ver FeedLeftRail y
// FeedRightRail). Antes vivía inline en app/(social)/feed/page.tsx; se
// factorizó acá para no repetir las mismas 8 queries en cada página nueva
// que agrega ese cascarón.
export async function getFeedRailData(): Promise<FeedRailData> {
  const supabase = await createClient();
  const user = await getRequestUser();

  if (!user) {
    return {
      loggedIn: false, userId: null, profileHandle: null, displayName: null, avatarImage: null,
      followerCount: 0, hasFollowing: false, projectsCount: 0, collaborationsCount: 0,
      viewsToday: 0, draftProject: null,
    };
  }

  const [{ data: profile }, { count: followingCount }] = await Promise.all([
    supabase.from('profiles').select('handle, display_name, avatar_image').eq('id', user.id).maybeSingle(),
    supabase.from('follows').select('*', { count: 'exact', head: true }).eq('follower_id', user.id),
  ]);
  const profileHandle = profile?.handle ?? null;

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const [
    { count: followers },
    { count: projects },
    { count: collaborations },
    { count: views },
    { data: draft },
  ] = await Promise.all([
    profileHandle
      ? supabase.from('follows').select('*', { count: 'exact', head: true }).eq('following_id', user.id)
      : Promise.resolve({ count: 0 }),
    supabase.from('projects').select('*', { count: 'exact', head: true }).eq('owner_id', user.id),
    supabase.from('project_collaborators').select('*', { count: 'exact', head: true }).eq('profile_id', user.id).eq('status', 'accepted'),
    supabase.from('profile_views').select('*', { count: 'exact', head: true }).eq('profile_id', user.id).gte('created_at', startOfToday.toISOString()),
    supabase.from('projects').select('name').eq('owner_id', user.id).eq('published', false).order('updated_at', { ascending: false }).limit(1).maybeSingle(),
  ]);

  return {
    loggedIn: true,
    userId: user.id,
    profileHandle,
    displayName: profile?.display_name ?? null,
    avatarImage: profile?.avatar_image ?? null,
    followerCount: followers ?? 0,
    hasFollowing: (followingCount ?? 0) > 0,
    projectsCount: projects ?? 0,
    collaborationsCount: collaborations ?? 0,
    viewsToday: views ?? 0,
    draftProject: draft ?? null,
  };
}
