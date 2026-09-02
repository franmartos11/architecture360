'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

// Red de contención por si el socket de Realtime se corta sin avisar — el
// disparador normal de check() es el evento de postgres_changes de abajo
// (antes era polling puro cada 30s).
const FALLBACK_POLL_INTERVAL_MS = 60000;

// Mismo patrón de polling que useNewLeadsCount — sin embargo, a diferencia
// de mensajes (donde alcanza con dejar que RLS filtre un canal sin
// filtro), acá sí hace falta el filtro por recipient_id: sin él,
// cualquier notificación de CUALQUIER usuario (no solo la mía) dispararía
// un check() de más — barato pero innecesario a escala.
export function useUnreadNotificationsCount(enabled: boolean) {
  const [count, setCount] = useState(0);

  const check = useCallback(() => {
    fetch('/api/notifications/unread-count')
      .then(res => res.json())
      .then(data => setCount(data.count ?? 0))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!enabled) return;
    check();

    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;

    supabase.auth.getUser().then(({ data }) => {
      const userId = data.user?.id;
      if (cancelled || !userId) return;
      channel = supabase
        .channel(`unread-notifications:${userId}`)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'notifications', filter: `recipient_id=eq.${userId}` },
          () => check()
        )
        .subscribe();
    });

    const interval = setInterval(check, FALLBACK_POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
      if (channel) supabase.removeChannel(channel);
    };
  }, [enabled, check]);

  return { count, clear: () => setCount(0) };
}
