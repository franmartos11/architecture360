import type { Metadata } from 'next';
import { getFeedRailData } from '@/lib/feed-rail';
import FeedLeftRail from '@/components/social/FeedLeftRail';
import FeedRightRail from '@/components/social/FeedRightRail';
import PostFeed from '@/components/social/PostFeed';

interface EtiquetaPageProps {
  params: Promise<{ tag: string }>;
}

export async function generateMetadata({ params }: EtiquetaPageProps): Promise<Metadata> {
  const { tag } = await params;
  const title = `#${decodeURIComponent(tag)} — Atrium`;
  return { title, description: `Publicaciones con #${decodeURIComponent(tag)} en Atrium.` };
}

// Página de una etiqueta — a dónde llevan tanto "En tendencia" (rail
// derecho, ver TrendingTags.tsx) como los "#hashtag" dentro del cuerpo de
// un post (ver PostFeed.tsx): antes ninguno de los dos era clickeable.
// Mismo cascarón de 3 columnas que /feed y /guardados.
export default async function EtiquetaPage({ params }: EtiquetaPageProps) {
  const { tag: rawTag } = await params;
  const tag = decodeURIComponent(rawTag);
  const rail = await getFeedRailData();

  return (
    <div style={{ fontFamily: "'Poppins', ui-sans-serif, system-ui, sans-serif" }}>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
      <section className="py-8 px-4 sm:px-6">
        <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-[240px_minmax(0,1fr)_280px] gap-6 items-start">
          <div className="hidden lg:block">
            {rail.profileHandle && rail.displayName && (
              <FeedLeftRail
                handle={rail.profileHandle}
                displayName={rail.displayName}
                avatarImage={rail.avatarImage}
                followerCount={rail.followerCount}
                projectsCount={rail.projectsCount}
                collaborationsCount={rail.collaborationsCount}
                viewsToday={rail.viewsToday}
                draftProject={rail.draftProject}
              />
            )}
          </div>

          <div className="max-w-2xl mx-auto w-full space-y-6">
            <div>
              <h1 className="font-semibold text-[19px] text-[#1c1a17]">#{tag}</h1>
              <p className="font-light text-[12.5px] leading-[1.5] text-[rgba(28,25,23,0.5)] mt-[3px]">
                Publicaciones que mencionan esta etiqueta.
              </p>
            </div>

            <PostFeed
              loggedIn={rail.loggedIn}
              currentProfileHandle={rail.profileHandle}
              currentAvatarImage={rail.avatarImage}
              tag={tag}
            />
          </div>

          <FeedRightRail loggedIn={rail.loggedIn} canCreate={!!rail.profileHandle} />
        </div>
      </section>
    </div>
  );
}
