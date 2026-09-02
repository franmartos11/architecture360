'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

// Red de contención por si el socket de Realtime se corta sin avisar — el
// disparador normal de check() es el evento de postgres_changes de abajo
// (antes era polling puro cada 30s).
const FALLBACK_POLL_INTERVAL_MS = 60000;

// Mismo patrón que useUnreadNotificationsCount — polling liviano dedicado,
// separado de la lista completa de conversaciones.
export function useUnreadMessagesCount(enabled: boolean) {
  const [count, setCount] = useState(0);

  const check = useCallback(() => {
    fetch('/api/conversations/unread-count')
      .then(res => res.json())
      .then(data => setCount(data.count ?? 0))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!enabled) return;
    check();

    // Sin filtro de columna: postgres_changes ya viene acotado por RLS al
    // conjunto de conversaciones donde participo, no hace falta filtrar acá.
    const supabase = createClient();
    const channel = supabase
      .channel('unread-messages:mine')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, () => check())
      .subscribe();

    const interval = setInterval(check, FALLBACK_POLL_INTERVAL_MS);
    return () => {
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, [enabled, check]);

  return count;
}
