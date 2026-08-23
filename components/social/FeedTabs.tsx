'use client';

import { useState } from 'react';
import PostFeed from '@/components/social/PostFeed';

interface FeedTabsProps {
  loggedIn: boolean;
  currentProfileHandle: string | null;
  currentAvatarImage?: string | null;
  defaultTab: 'following' | 'global';
}

export default function FeedTabs({ loggedIn, currentProfileHandle, currentAvatarImage, defaultTab }: FeedTabsProps) {
  const [tab, setTab] = useState<'following' | 'global'>(defaultTab);

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-1 bg-trevo-dark/5 p-1 rounded-xl w-fit mx-auto sm:mx-0">
        <button
          onClick={() => setTab('following')}
          className={`px-5 py-2 rounded-lg text-sm font-medium transition-all ${
            tab === 'following' ? 'bg-white text-trevo-dark shadow-sm' : 'text-trevo-dark/50 hover:text-trevo-dark'
          }`}
        >
          Siguiendo
        </button>
        <button
          onClick={() => setTab('global')}
          className={`px-5 py-2 rounded-lg text-sm font-medium transition-all ${
            tab === 'global' ? 'bg-white text-trevo-dark shadow-sm' : 'text-trevo-dark/50 hover:text-trevo-dark'
          }`}
        >
          Explorar
        </button>
      </div>

      <div className="pt-2">
        {/* We use key to force remount when tab changes, ensuring feed re-fetches cleanly */}
        <PostFeed
          key={tab}
          loggedIn={loggedIn}
          currentProfileHandle={currentProfileHandle}
          currentAvatarImage={currentAvatarImage}
          scope={tab}
        />
      </div>
    </div>
  );
}
