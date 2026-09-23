import { Suspense } from 'react';
import type { Metadata } from 'next';
import { Users } from 'lucide-react';
import { searchPortfolioDirectory, getFollowingSet } from '@/data/profile-repository';
import { getRequestUser } from '@/lib/supabase/auth';
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

interface PageProps {
  searchParams: Promise<{ q?: string; tipo?: string }>;
}

export default async function DirectoryPage({ searchParams }: PageProps) {
  // La búsqueda se resuelve en la base y no trayendo todos los perfiles para
  // filtrar en el navegador. DirectoryGrid sigue filtrando al instante lo que
  // recibe —eso hace que escribir se sienta inmediato— y manda la consulta al
  // servidor cuando el usuario frena, para el caso en que haya más que los
  // que entraron en esta página.
  const { q, tipo } = await searchParams;
  const user = await getRequestUser();

  const accountType = tipo === 'person' || tipo === 'company' ? tipo : undefined;
  const { profiles, hayMas } = await searchPortfolioDirectory({ query: q, accountType });
  const followingSet = user ? await getFollowingSet(user.id) : new Set<string>();

  return (
    <div className="min-h-screen bg-trevo-light">
      <section className="py-10 px-4 sm:px-6">
        <div className="max-w-6xl mx-auto">
          {profiles.length === 0 && !q && !accountType ? (
            <EmptyState icon={<Users className="w-6 h-6" />} title="Todavía no hay perfiles publicados." />
          ) : (
            <Suspense fallback={null}>
              <DirectoryGrid profiles={profiles} followingSet={followingSet} loggedIn={!!user} currentProfileId={user?.id} hayMas={hayMas} />
            </Suspense>
          )}
        </div>
      </section>
    </div>
  );
}
