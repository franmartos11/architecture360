'use client';

import { useCallback, useEffect, useState } from 'react';

const POLL_INTERVAL_MS = 30000;

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
    const interval = setInterval(check, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [enabled, check]);

  return count;
}
