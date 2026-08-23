'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

const PresenceContext = createContext<Set<string>>(new Set());

/** true si ese id de usuario tiene una pestaña abierta ahora mismo en la cuenta. */
export function useIsOnline(userId: string | null | undefined): boolean {
  const onlineIds = useContext(PresenceContext);
  return !!userId && onlineIds.has(userId);
}

// Un solo canal de presence de Realtime, compartido por cualquier usuario
// logueado — cada pestaña se "trackea" a sí misma acá una vez al montar y
// lee el estado agregado de todas. No hay tabla ni persistencia: es
// puramente el estado de sockets conectados ahora mismo, se pierde al
// cerrar la pestaña, que es exactamente lo que significa "en línea".
export function PresenceProvider({ children }: { children: React.ReactNode }) {
  const [onlineIds, setOnlineIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;

    supabase.auth.getUser().then(({ data }) => {
      const userId = data.user?.id;
      if (cancelled || !userId) return;

      channel = supabase.channel('presence:online', { config: { presence: { key: userId } } });
      channel
        .on('presence', { event: 'sync' }, () => {
          setOnlineIds(new Set(Object.keys(channel!.presenceState())));
        })
        .subscribe(async status => {
          if (status === 'SUBSCRIBED') await channel!.track({ online_at: new Date().toISOString() });
        });
    });

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, []);

  return <PresenceContext.Provider value={onlineIds}>{children}</PresenceContext.Provider>;
}
