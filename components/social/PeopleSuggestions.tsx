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

  return (
    <div className="bg-white rounded-2xl border border-trevo-dark/10 p-5">
      <h3 className="font-bold text-trevo-dark text-lg mb-4">Añadir a tu feed</h3>
      <div className="space-y-5">
        {suggestions.map(s => (
          <div key={s.handle} className="flex items-start gap-3">
            <Link href={`/portfolio/${s.handle}`} className="shrink-0 relative w-14 h-14 rounded-full bg-trevo-dark/5 overflow-hidden">
              {s.avatarImage ? (
                <Image src={s.avatarImage} alt={s.displayName} fill sizes="56px" className="object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-trevo-dark/40 font-medium text-lg">
                  {s.displayName.charAt(0).toUpperCase()}
                </div>
              )}
            </Link>
            <div className="flex-1 min-w-0 pt-0.5">
              <Link href={`/portfolio/${s.handle}`} className="block font-bold text-trevo-dark leading-snug hover:underline">
                {s.displayName}
              </Link>
              {s.bio && (
                <p className="text-sm text-trevo-dark/50 line-clamp-1 mt-0.5">{s.bio}</p>
              )}
              <div className="mt-2.5">
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
      <div className="mt-5 pt-4 border-t border-trevo-dark/5">
        <Link href="/directorio" className="flex items-center gap-1 text-sm font-medium text-trevo-dark/60 hover:text-trevo-dark transition-colors">
          Ver todas las recomendaciones →
        </Link>
      </div>
    </div>
  );
}
