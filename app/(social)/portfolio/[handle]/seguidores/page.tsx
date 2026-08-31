import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { UserPlus } from 'lucide-react';
import { TransitionLink as Link } from '@/components/ui/TransitionUtils';
import { getPortfolioByHandle, getFollowers, getFollowingSet } from '@/data/profile-repository';
import { getRequestUser } from '@/lib/supabase/auth';
import DirectoryGrid from '@/components/DirectoryGrid';
import EmptyState from '@/components/ui/EmptyState';

interface PageProps { params: Promise<{ handle: string }> }

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { handle } = await params;
  const portfolio = await getPortfolioByHandle(handle);
  const title = portfolio ? `Seguidores de ${portfolio.displayName}` : 'Seguidores';
  return { title };
}

export default async function FollowersPage({ params }: PageProps) {
  const { handle } = await params;
  const portfolio = await getPortfolioByHandle(handle);
  if (!portfolio) notFound();

  const user = await getRequestUser();

  const [followers, followingSet] = await Promise.all([
    getFollowers(portfolio.id),
    user ? getFollowingSet(user.id) : Promise.resolve(new Set<string>()),
  ]);

  return (
    <div className="min-h-screen bg-trevo-light">
      <section className="py-10 px-4 sm:px-6 border-b border-trevo-dark/10">
        <div className="max-w-6xl mx-auto">
          <Link href={`/portfolio/${portfolio.handle}`} className="text-sm text-trevo-dark/40 hover:text-trevo-dark transition-colors">
            ← {portfolio.displayName}
          </Link>
          <h1 className="text-2xl font-light tracking-wide text-trevo-dark mt-1">Seguidores</h1>
        </div>
      </section>

      <section className="py-10 px-4 sm:px-6">
        <div className="max-w-6xl mx-auto">
          {followers.length === 0 ? (
            <EmptyState icon={<UserPlus className="w-6 h-6" />} title="Todavía no tiene seguidores." />
          ) : (
            <Suspense fallback={null}>
              <DirectoryGrid profiles={followers} followingSet={followingSet} loggedIn={!!user} currentProfileId={user?.id} />
            </Suspense>
          )}
        </div>
      </section>
    </div>
  );
}
