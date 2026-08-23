'use client';

import { useState } from 'react';
import { UserPlus, UserCheck } from 'lucide-react';
import { useToast } from '@/components/ui/ToastProvider';

interface FollowButtonProps {
  handle: string;
  initialFollowing: boolean;
  initialCount: number;
  loggedIn: boolean;
}

export default function FollowButton({ handle, initialFollowing, initialCount, loggedIn }: FollowButtonProps) {
  const [following, setFollowing] = useState(initialFollowing);
  const [count, setCount] = useState(initialCount);
  const [loading, setLoading] = useState(false);
  const [hovered, setHovered] = useState(false);
  const toast = useToast();

  const toggle = async () => {
    if (!loggedIn) {
      toast('Iniciá sesión para seguir a alguien.', 'error');
      return;
    }
    // Optimistic
    const next = !following;
    setFollowing(next);
    setCount(c => c + (next ? 1 : -1));
    setLoading(true);

    const res = await fetch(`/api/follows/${handle}`, {
      method: next ? 'POST' : 'DELETE',
    });
    setLoading(false);

    if (res.ok) {
      const data = await res.json();
      setCount(data.followerCount);
    } else {
      // Revertir
      setFollowing(!next);
      setCount(c => c + (next ? -1 : 1));
      const data = await res.json().catch(() => ({}));
      toast(data.error ?? 'No se pudo actualizar.', 'error');
    }
  };

  if (following) {
    return (
      <button
        onClick={toggle}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        disabled={loading}
        className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-medium border transition-all disabled:opacity-60 ${
          hovered
            ? 'bg-red-50 text-red-600 border-red-200 hover:bg-red-100'
            : 'bg-stone-100 text-stone-700 border-stone-200 hover:border-stone-300'
        }`}
        aria-label="Dejar de seguir"
      >
        <UserCheck className="w-4 h-4" />
        {hovered ? 'Dejar de seguir' : 'Siguiendo'}
      </button>
    );
  }

  return (
    <button
      onClick={toggle}
      disabled={loading}
      className="flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-medium bg-stone-900 text-white hover:bg-stone-700 border border-stone-900 transition-all disabled:opacity-60"
      aria-label="Seguir"
    >
      <UserPlus className="w-4 h-4" />
      Seguir
    </button>
  );
}
