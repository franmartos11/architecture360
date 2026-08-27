import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { Users } from 'lucide-react';
import { TransitionLink as Link } from '@/components/ui/TransitionUtils';
import { getPortfolioByHandle, getFollowing, getFollowingSet } from '@/data/profile-repository';
import { createClient } from '@/lib/supabase/server';
import DirectoryGrid from '@/components/DirectoryGrid';
import EmptyState from '@/components/ui/EmptyState';

interface PageProps { params: Promise<{ handle: string }> }

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { handle } = await params;
  const portfolio = await getPortfolioByHandle(handle);
  const title = portfolio ? `A quién sigue ${portfolio.displayName}` : 'Siguiendo';
  return { title };
}

export default async function FollowingPage({ params }: PageProps) {
  const { handle } = await params;
  const portfolio = await getPortfolioByHandle(handle);
  if (!portfolio) notFound();

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const [following, followingSet] = await Promise.all([
    getFollowing(portfolio.id),
    user ? getFollowingSet(user.id) : Promise.resolve(new Set<string>()),
  ]);

  return (
    <div className="min-h-screen bg-trevo-light">
      <section className="py-10 px-4 sm:px-6 border-b border-trevo-dark/10">
        <div className="max-w-6xl mx-auto">
          <Link href={`/portfolio/${portfolio.handle}`} className="text-sm text-trevo-dark/40 hover:text-trevo-dark transition-colors">
            ← {portfolio.displayName}
          </Link>
          <h1 className="text-2xl font-light tracking-wide text-trevo-dark mt-1">Siguiendo</h1>
        </div>
      </section>

      <section className="py-10 px-4 sm:px-6">
        <div className="max-w-6xl mx-auto">
          {following.length === 0 ? (
            <EmptyState icon={<Users className="w-6 h-6" />} title="Todavía no sigue a nadie." />
          ) : (
            <Suspense fallback={null}>
              <DirectoryGrid profiles={following} followingSet={followingSet} loggedIn={!!user} currentProfileId={user?.id} />
            </Suspense>
          )}
        </div>
      </section>
    </div>
  );
}
