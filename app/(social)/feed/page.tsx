import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { getRequestUser } from '@/lib/supabase/auth';
import FeedTabs from '@/components/social/FeedTabs';
import FeedLeftRail from '@/components/social/FeedLeftRail';
import PeopleSuggestions from '@/components/social/PeopleSuggestions';
import TrendingTags from '@/components/social/TrendingTags';
import UpcomingEvent from '@/components/social/UpcomingEvent';

const title = 'Feed — Atrium';
const description = 'Lo que están publicando arquitectos y estudios en Atrium.';

export const metadata: Metadata = {
  title,
  description,
  openGraph: { title, description },
  twitter: { card: 'summary', title, description },
};

export default async function FeedPage() {
  const supabase = await createClient();
  const user = await getRequestUser();

  let currentProfileHandle: string | null = null;
  let currentAvatarImage: string | null = null;
  let currentDisplayName: string | null = null;
  let followerCount = 0;
  let hasFollowing = false;
  let projectsCount = 0;
  let collaborationsCount = 0;
  let viewsToday = 0;
  let draftProject: { name: string } | null = null;

  if (user) {
    const [{ data: profile }, { count: followingCount }] = await Promise.all([
      supabase.from('profiles').select('handle, display_name, avatar_image').eq('id', user.id).maybeSingle(),
      supabase.from('follows').select('*', { count: 'exact', head: true }).eq('follower_id', user.id),
    ]);
    currentProfileHandle = profile?.handle ?? null;
    currentAvatarImage = profile?.avatar_image ?? null;
    currentDisplayName = profile?.display_name ?? null;
    hasFollowing = (followingCount ?? 0) > 0;

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const [
      { count: followers },
      { count: projects },
      { count: collaborations },
      { count: views },
      { data: draft },
    ] = await Promise.all([
      currentProfileHandle
        ? supabase.from('follows').select('*', { count: 'exact', head: true }).eq('following_id', user.id)
        : Promise.resolve({ count: 0 }),
      supabase.from('projects').select('*', { count: 'exact', head: true }).eq('owner_id', user.id),
      supabase.from('project_collaborators').select('*', { count: 'exact', head: true }).eq('profile_id', user.id).eq('status', 'accepted'),
      supabase.from('profile_views').select('*', { count: 'exact', head: true }).eq('profile_id', user.id).gte('created_at', startOfToday.toISOString()),
      supabase.from('projects').select('name').eq('owner_id', user.id).eq('published', false).order('updated_at', { ascending: false }).limit(1).maybeSingle(),
    ]);
    followerCount = followers ?? 0;
    projectsCount = projects ?? 0;
    collaborationsCount = collaborations ?? 0;
    viewsToday = views ?? 0;
    draftProject = draft ?? null;
  }

  return (
    // Poppins scopeado a esta página (no al resto de la app, que usa
    // Montserrat) — así el feed calca la tipografía exacta del mockup
    // Feed.dc.html sin recolorear/retipografiar admin, portfolio o los
    // sitios públicos de proyecto.
    <div style={{ fontFamily: "'Poppins', ui-sans-serif, system-ui, sans-serif" }}>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
      <section className="py-8 px-4 sm:px-6">
        <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-[240px_minmax(0,1fr)_280px] gap-6 items-start">
          {/* Rail izquierdo — solo con perfil propio; en mobile no ocupa lugar. */}
          <div className="hidden lg:block">
            {currentProfileHandle && currentDisplayName && (
              <FeedLeftRail
                handle={currentProfileHandle}
                displayName={currentDisplayName}
                avatarImage={currentAvatarImage}
                followerCount={followerCount}
                projectsCount={projectsCount}
                collaborationsCount={collaborationsCount}
                viewsToday={viewsToday}
                draftProject={draftProject}
              />
            )}
          </div>

          <FeedTabs
            loggedIn={!!user}
            currentProfileHandle={currentProfileHandle}
            currentAvatarImage={currentAvatarImage}
            defaultTab={user && hasFollowing ? 'following' : 'global'}
          />

          {/* Rail derecho — sugerencias siempre visibles en desktop, antes solo aparecían al fondo del feed de "Siguiendo" vacío. */}
          <div className="hidden lg:flex flex-col gap-4 sticky top-20">
            <PeopleSuggestions />
            <TrendingTags />
            <UpcomingEvent loggedIn={!!user} canCreate={!!currentProfileHandle} />
            <p className="font-light text-[10.5px] leading-[1.7] px-1.5" style={{ color: 'rgba(28,25,23,0.34)' }}>
              Acerca de · Ayuda · Privacidad · Términos<br />Atrium © {new Date().getFullYear()}
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
