'use client';

import { useState } from 'react';
import { ListFilter } from 'lucide-react';
import PostFeed from '@/components/social/PostFeed';

type Tab = 'following' | 'global' | 'collaborations';
type Sort = 'recent' | 'top';

interface FeedTabsProps {
  loggedIn: boolean;
  currentProfileHandle: string | null;
  currentAvatarImage?: string | null;
  defaultTab: Tab;
}

const TABS: { key: Tab; label: string }[] = [
  { key: 'following', label: 'Siguiendo' },
  { key: 'global', label: 'Explorar' },
  { key: 'collaborations', label: 'Colaboraciones' },
];

export default function FeedTabs({ loggedIn, currentProfileHandle, currentAvatarImage, defaultTab }: FeedTabsProps) {
  const [tab, setTab] = useState<Tab>(defaultTab);
  const [sort, setSort] = useState<Sort>('recent');

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Barra calcada del mockup Feed.dc.html — valores arbitrarios en vez
          de tokens trevo-*, a propósito: es el look específico de ese
          diseño, scopeado a este componente. */}
      <div
        className="flex items-center gap-2 flex-wrap p-2 rounded-[14px] border"
        style={{ background: 'rgba(245,244,240,0.86)', backdropFilter: 'blur(10px)', borderColor: 'rgba(28,25,23,0.06)' }}
      >
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`h-[34px] px-4 rounded-[9px] text-[12.5px] font-medium whitespace-nowrap transition-colors ${
              tab === t.key ? 'bg-[#1c1a17] text-white' : 'text-[rgba(28,25,23,0.55)] hover:text-[#1c1a17]'
            }`}
          >
            {t.label}
          </button>
        ))}
        <div className="flex-1" />
        <button
          onClick={() => setSort(s => (s === 'recent' ? 'top' : 'recent'))}
          className="h-8 px-3 flex items-center gap-1.5 rounded-[9px] border bg-white text-[11.5px] font-medium text-[rgba(28,25,23,0.7)] hover:text-[#1c1a17] transition-colors whitespace-nowrap"
          style={{ borderColor: 'rgba(28,25,23,0.12)' }}
        >
          <ListFilter className="w-3 h-3" />
          {sort === 'recent' ? 'Recientes' : 'Destacados'}
        </button>
      </div>

      <div className="pt-2">
        {/* Sin key acá a propósito — con key, cambiar de tab remontaba
            PostFeed de cero: la lista actual desaparecía, se veían los
            skeletons de carga inicial y el composer perdía cualquier
            adjunto/texto a medio armar. PostFeed ya reacciona solo a
            scope/sort (ver su useEffect) — dejarlo montado, así solo
            actualiza la lista en el lugar. */}
        <PostFeed
          loggedIn={loggedIn}
          currentProfileHandle={currentProfileHandle}
          currentAvatarImage={currentAvatarImage}
          scope={tab}
          sort={sort}
        />
      </div>
    </div>
  );
}
