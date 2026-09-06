import type { Metadata } from 'next';
import { getFeedRailData } from '@/lib/feed-rail';
import FeedTabs from '@/components/social/FeedTabs';
import FeedLeftRail from '@/components/social/FeedLeftRail';
import FeedRightRail from '@/components/social/FeedRightRail';

const title = 'Feed — Atrium';
const description = 'Lo que están publicando arquitectos y estudios en Atrium.';

export const metadata: Metadata = {
  title,
  description,
  openGraph: { title, description },
  twitter: { card: 'summary', title, description },
};

export default async function FeedPage() {
  const rail = await getFeedRailData();

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
            {rail.profileHandle && rail.displayName && (
              <FeedLeftRail
                handle={rail.profileHandle}
                displayName={rail.displayName}
                avatarImage={rail.avatarImage}
                bannerImage={rail.bannerImage}
                followerCount={rail.followerCount}
                projectsCount={rail.projectsCount}
                collaborationsCount={rail.collaborationsCount}
                viewsToday={rail.viewsToday}
                draftProject={rail.draftProject}
              />
            )}
          </div>

          <FeedTabs
            loggedIn={rail.loggedIn}
            currentProfileHandle={rail.profileHandle}
            currentAvatarImage={rail.avatarImage}
            defaultTab={rail.loggedIn && rail.hasFollowing ? 'following' : 'global'}
          />

          {/* Rail derecho — sugerencias siempre visibles en desktop, antes solo aparecían al fondo del feed de "Siguiendo" vacío. */}
          <FeedRightRail loggedIn={rail.loggedIn} canCreate={!!rail.profileHandle} />
        </div>
      </section>
    </div>
  );
}
