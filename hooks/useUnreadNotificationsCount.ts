'use client';

import { useCallback, useEffect, useState } from 'react';

const POLL_INTERVAL_MS = 30000;

// Mismo patrón de polling que useNewLeadsCount — sin websockets, un
// endpoint liviano dedicado (/unread-count) en vez de traer la lista
// completa de notificaciones cada 30s solo para saber el número.
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
    const interval = setInterval(check, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [enabled, check]);

  return { count, clear: () => setCount(0) };
}
