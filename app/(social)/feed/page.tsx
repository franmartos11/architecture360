import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import FeedTabs from '@/components/social/FeedTabs';
import FeedLeftRail from '@/components/social/FeedLeftRail';
import PeopleSuggestions from '@/components/social/PeopleSuggestions';

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
  const { data: { user } } = await supabase.auth.getUser();

  let currentProfileHandle: string | null = null;
  let currentAvatarImage: string | null = null;
  let currentDisplayName: string | null = null;
  let followerCount = 0;
  let hasFollowing = false;

  if (user) {
    const [{ data: profile }, { count: followingCount }] = await Promise.all([
      supabase.from('profiles').select('handle, display_name, avatar_image').eq('id', user.id).maybeSingle(),
      supabase.from('follows').select('*', { count: 'exact', head: true }).eq('follower_id', user.id),
    ]);
    currentProfileHandle = profile?.handle ?? null;
    currentAvatarImage = profile?.avatar_image ?? null;
    currentDisplayName = profile?.display_name ?? null;
    hasFollowing = (followingCount ?? 0) > 0;
    if (currentProfileHandle) {
      const { count } = await supabase.from('follows').select('*', { count: 'exact', head: true }).eq('following_id', user.id);
      followerCount = count ?? 0;
    }
  }

  return (
    <div>
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
          <div className="hidden lg:block sticky top-20">
            <PeopleSuggestions />
          </div>
        </div>
      </section>
    </div>
  );
}
