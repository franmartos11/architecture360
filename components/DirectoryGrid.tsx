'use client';

import { useMemo, useState } from 'react';
import Image from 'next/image';
import { useSearchParams } from 'next/navigation';
import { SearchX } from 'lucide-react';
import { TransitionLink as Link } from '@/components/ui/TransitionUtils';
import FollowButton from '@/components/social/FollowButton';
import EmptyState from '@/components/ui/EmptyState';
import type { DirectoryProfile } from '@/types';

type Filter = 'all' | 'person' | 'company';

export default function DirectoryGrid({ profiles, followingSet = new Set(), loggedIn = false, currentProfileId }: { profiles: DirectoryProfile[], followingSet?: Set<string>, loggedIn?: boolean, currentProfileId?: string }) {
  // Precarga el filtro cuando se llega con ?q= (ej. desde el buscador de
  // la nav) — solo como valor inicial, así el usuario puede seguir
  // editando la búsqueda sin que se resetee.
  const initialQuery = useSearchParams().get('q') ?? '';
  const [query, setQuery] = useState(initialQuery);
  const [filter, setFilter] = useState<Filter>('all');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return profiles.filter(p => {
      if (filter !== 'all' && p.accountType !== filter) return false;
      if (!q) return true;
      return p.displayName.toLowerCase().includes(q)
        || p.handle.toLowerCase().includes(q)
        || (p.location ?? '').toLowerCase().includes(q);
    });
  }, [profiles, query, filter]);

  return (
    <div>
      <div className="flex flex-col sm:flex-row gap-3 mb-10">
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Buscar por nombre, handle o ubicación..."
          className="flex-1 px-4 py-2.5 rounded-lg border border-trevo-dark/15 bg-white text-trevo-dark placeholder:text-trevo-dark/30 focus:ring-2 focus:ring-trevo-dark/20 focus:border-trevo-dark/30 outline-none transition-all"
        />
        <div className="inline-flex rounded-lg border border-trevo-dark/15 p-1 bg-white shrink-0">
          {([['all', 'Todos'], ['person', 'Personas'], ['company', 'Estudios']] as [Filter, string][]).map(([value, label]) => (
            <button
              key={value}
              onClick={() => setFilter(value)}
              className={`px-3.5 py-1.5 rounded-md text-sm font-medium transition-colors ${filter === value ? 'bg-trevo-dark text-white' : 'text-trevo-dark/60 hover:text-trevo-dark'}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={<SearchX className="w-6 h-6" />} title="No encontramos a nadie con esa búsqueda." />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {filtered.map(p => (
            <Link
              key={p.handle}
              href={`/portfolio/${p.handle}`}
              className="group flex items-start gap-4 p-5 rounded-2xl bg-white border border-trevo-dark/10 hover:border-trevo-dark/20 hover:shadow-sm transition-all"
            >
              <div className={`relative w-14 h-14 overflow-hidden shrink-0 bg-trevo-dark/10 flex items-center justify-center ${p.accountType === 'company' ? 'rounded-xl' : 'rounded-full'}`}>
                {p.avatarImage ? (
                  <Image src={p.avatarImage} alt={p.displayName} fill sizes="56px" className="object-cover" />
                ) : (
                  <span className="text-trevo-dark/40 font-medium text-lg">{p.displayName.charAt(0).toUpperCase()}</span>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-trevo-dark truncate group-hover:underline">{p.displayName}</p>
                  {p.accountType === 'company' && (
                    <span className="text-[10px] font-medium tracking-wide uppercase text-trevo-dark/40 border border-trevo-dark/15 rounded-full px-2 py-0.5 shrink-0">
                      Estudio
                    </span>
                  )}
                </div>
                {p.location && <p className="text-xs text-trevo-dark/50 mt-0.5">{p.location}</p>}
                {p.bio && <p className="text-sm text-trevo-dark/60 font-light mt-1.5 line-clamp-2">{p.bio}</p>}
                <p className="text-xs text-trevo-dark/40 mt-2">
                  {p.projectCount} {p.projectCount === 1 ? 'proyecto' : 'proyectos'}
                </p>
              </div>
              {p.id !== currentProfileId && (
                <div className="shrink-0 pt-2" onClick={e => e.preventDefault()}>
                  <FollowButton
                    handle={p.handle}
                    initialFollowing={followingSet.has(p.id)}
                    initialCount={0} // Ocultar contador en la grilla para hacerlo liviano
                    loggedIn={loggedIn}
                  />
                </div>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
