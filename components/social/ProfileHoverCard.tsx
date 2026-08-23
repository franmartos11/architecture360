'use client';

import { useState, useRef, type ReactNode } from 'react';
import { TransitionLink as Link } from '@/components/ui/TransitionUtils';
import FollowButton from '@/components/social/FollowButton';

interface HoverProfile {
  handle: string;
  displayName: string;
  avatarImage: string | null;
  bio: string | null;
  accountType: 'person' | 'company';
  followerCount: number;
  isFollowedByMe: boolean;
}

const cache = new Map<string, HoverProfile>();

// Mini-tarjeta de perfil al pasar el mouse sobre un nombre/avatar — mismo
// patrón que LinkedIn/Twitter, en vez de que un nombre en el feed o en un
// comentario sea solo un link plano sin más contexto. Perezoso: recién pide
// el perfil la primera vez que se hace hover, y lo cachea en memoria para
// no repetir el fetch si aparece varias veces en la misma sesión.
export default function ProfileHoverCard({ handle, loggedIn, children }: { handle: string; loggedIn: boolean; children: ReactNode }) {
  const [profile, setProfile] = useState<HoverProfile | null>(cache.get(handle) ?? null);
  const [open, setOpen] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const openTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = () => {
    if (cache.has(handle)) return;
    fetch(`/api/follows/${handle}`)
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (!data) return;
        cache.set(handle, data);
        setProfile(data);
      })
      .catch(() => {});
  };

  const handleEnter = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    openTimer.current = setTimeout(() => { setOpen(true); load(); }, 350);
  };

  const handleLeave = () => {
    if (openTimer.current) clearTimeout(openTimer.current);
    closeTimer.current = setTimeout(() => setOpen(false), 150);
  };

  return (
    <span className="relative inline-block" onMouseEnter={handleEnter} onMouseLeave={handleLeave}>
      {children}
      {open && (
        <div className="absolute top-full left-0 mt-2 w-64 bg-white rounded-xl shadow-lg border border-trevo-dark/10 p-4 z-40">
          {!profile ? (
            <div className="animate-pulse space-y-2">
              <div className="w-12 h-12 rounded-full bg-trevo-dark/10" />
              <div className="h-3 w-24 bg-trevo-dark/10 rounded" />
            </div>
          ) : (
            <>
              <Link href={`/portfolio/${profile.handle}`} className="flex items-center gap-3 mb-2">
                <div className={`relative w-12 h-12 overflow-hidden shrink-0 bg-trevo-dark/10 flex items-center justify-center ${profile.accountType === 'company' ? 'rounded-xl' : 'rounded-full'}`}>
                  {profile.avatarImage ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={profile.avatarImage} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-trevo-dark/40 font-medium">{profile.displayName.charAt(0).toUpperCase()}</span>
                  )}
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-trevo-dark text-sm truncate">{profile.displayName}</p>
                  <p className="text-xs text-trevo-dark/40">{profile.followerCount} seguidores</p>
                </div>
              </Link>
              {profile.bio && <p className="text-xs text-trevo-dark/60 font-light line-clamp-2 mb-3">{profile.bio}</p>}
              <FollowButton handle={profile.handle} initialFollowing={profile.isFollowedByMe} initialCount={profile.followerCount} loggedIn={loggedIn} />
            </>
          )}
        </div>
      )}
    </span>
  );
}
