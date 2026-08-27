import { Suspense } from 'react';
import type { Metadata } from 'next';
import { Users } from 'lucide-react';
import { getPortfolioDirectory, getFollowingSet } from '@/data/profile-repository';
import { createClient } from '@/lib/supabase/server';
import DirectoryGrid from '@/components/DirectoryGrid';
import EmptyState from '@/components/ui/EmptyState';

const title = 'Directorio — Arquitectos y estudios';
const description = 'Descubrí personas y estudios de arquitectura con portfolio publicado.';

export const metadata: Metadata = {
  title,
  description,
  openGraph: { title, description },
  twitter: { card: 'summary', title, description },
};

export default async function DirectoryPage() {
  // DirectoryGrid lee ?q= con useSearchParams() y filtra en el mismo
  // render — como es un client component, Next también lo renderiza en
  // el server con los searchParams correctos, así que un link compartido
  // con ?q= ya sale filtrado en el primer HTML, sin round-trip extra acá.
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const profiles = await getPortfolioDirectory();
  const followingSet = user ? await getFollowingSet(user.id) : new Set<string>();

  return (
    <div className="min-h-screen bg-trevo-light">
      <section className="py-10 px-4 sm:px-6">
        <div className="max-w-6xl mx-auto">
          {profiles.length === 0 ? (
            <EmptyState icon={<Users className="w-6 h-6" />} title="Todavía no hay perfiles publicados." />
          ) : (
            <Suspense fallback={null}>
              <DirectoryGrid profiles={profiles} followingSet={followingSet} loggedIn={!!user} currentProfileId={user?.id} />
            </Suspense>
          )}
        </div>
      </section>
    </div>
  );
}
