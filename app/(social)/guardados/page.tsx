import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getFeedRailData } from '@/lib/feed-rail';
import FeedLeftRail from '@/components/social/FeedLeftRail';
import FeedRightRail from '@/components/social/FeedRightRail';
import PostFeed from '@/components/social/PostFeed';

const title = 'Guardados — Atrium';
const description = 'Los posts que guardaste para ver más tarde.';

export const metadata: Metadata = {
  title,
  description,
};

export default async function GuardadosPage() {
  const rail = await getFeedRailData();
  if (!rail.userId) redirect('/admin/login');
  if (!rail.profileHandle) redirect('/admin/portfolio');

  const supabase = await createClient();
  const { count } = await supabase.from('saved_posts').select('*', { count: 'exact', head: true }).eq('profile_id', rail.userId);
  const savedCount = count ?? 0;

  return (
    <div style={{ fontFamily: "'Poppins', ui-sans-serif, system-ui, sans-serif" }}>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
      <section className="py-8 px-4 sm:px-6">
        <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-[240px_minmax(0,1fr)_280px] gap-6 items-start">
          <div className="hidden lg:block">
            <FeedLeftRail
              handle={rail.profileHandle}
              displayName={rail.displayName ?? rail.profileHandle}
              avatarImage={rail.avatarImage}
              followerCount={rail.followerCount}
              projectsCount={rail.projectsCount}
              collaborationsCount={rail.collaborationsCount}
              viewsToday={rail.viewsToday}
              draftProject={rail.draftProject}
            />
          </div>

          <div className="max-w-2xl mx-auto w-full space-y-6">
            {/* Calcado del mockup Feed.dc.html ("savedView") */}
            <div className="flex items-end justify-between gap-3.5">
              <div>
                <h1 className="font-semibold text-[19px] text-[#1c1a17]">Guardados</h1>
                <p className="font-light text-[12.5px] leading-[1.5] text-[rgba(28,25,23,0.5)] mt-[3px]">
                  Los posts que guardaste para ver más tarde.
                </p>
              </div>
              <p className="font-normal text-[11.5px] text-[rgba(28,25,23,0.42)] whitespace-nowrap">
                {savedCount === 1 ? '1 publicación' : `${savedCount} publicaciones`}
              </p>
            </div>

            <PostFeed
              loggedIn
              currentProfileHandle={rail.profileHandle}
              currentAvatarImage={rail.avatarImage}
              scope="saved"
            />
          </div>

          <FeedRightRail loggedIn={rail.loggedIn} canCreate={!!rail.profileHandle} />
        </div>
      </section>
    </div>
  );
}
