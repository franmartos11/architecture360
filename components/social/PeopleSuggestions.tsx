'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { TransitionLink as Link } from '@/components/ui/TransitionUtils';
import FollowButton from '@/components/social/FollowButton';

interface Suggestion {
  id: string;
  handle: string;
  displayName: string;
  avatarImage: string | null;
  accountType: 'person' | 'company';
  bio: string | null;
  mutualCount: number;
}

export default function PeopleSuggestions() {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/profiles/suggestions?limit=3')
      .then(res => res.json())
      .then(data => {
        setSuggestions(data.suggestions ?? []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading || suggestions.length === 0) return null;

  // Calcado del mockup Feed.dc.html — valores arbitrarios en vez de
  // tokens trevo-*, a propósito: es el look específico de ese diseño,
  // scopeado a este componente.
  return (
    <div className="bg-white rounded-2xl p-[17px]" style={{ border: '1px solid rgba(28,25,23,0.07)' }}>
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="font-semibold text-[13.5px] text-[#1c1a17]">Añadir a tu feed</h3>
        <span className="text-[11px] text-[rgba(28,25,23,0.4)] shrink-0">Basado en tu red</span>
      </div>
      <div className="flex flex-col gap-3.5 mt-3.5">
        {suggestions.map(s => (
          <div key={s.handle} className="flex items-start gap-2.5">
            <Link href={`/portfolio/${s.handle}`} className="shrink-0 relative w-10 h-10 rounded-full bg-trevo-dark/5 overflow-hidden">
              {s.avatarImage ? (
                <Image src={s.avatarImage} alt={s.displayName} fill sizes="40px" className="object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-trevo-dark/40 font-medium">
                  {s.displayName.charAt(0).toUpperCase()}
                </div>
              )}
            </Link>
            <div className="flex-1 min-w-0">
              <Link href={`/portfolio/${s.handle}`} className="block font-semibold text-[12.5px] leading-[1.3] text-[#1c1a17] truncate hover:underline">
                {s.displayName}
              </Link>
              {s.bio && (
                <p className="font-light text-[11px] leading-[1.4] text-[rgba(28,25,23,0.5)] line-clamp-1 mt-0.5">{s.bio}</p>
              )}
              {s.mutualCount > 0 && (
                <p className="text-[10.5px] text-[rgba(28,25,23,0.38)] mt-[3px]">
                  {s.mutualCount} contacto{s.mutualCount === 1 ? '' : 's'} en común
                </p>
              )}
              <div className="mt-2">
                <FollowButton
                  handle={s.handle}
                  initialFollowing={false}
                  initialCount={0}
                  loggedIn={true} // Se asume que esto solo se muestra a logueados
                />
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3.5 pt-3 border-t" style={{ borderColor: 'rgba(28,25,23,0.07)' }}>
        <Link href="/directorio" className="text-xs font-medium text-[#4a6647]">
          Ver todas las recomendaciones →
        </Link>
      </div>
    </div>
  );
}
