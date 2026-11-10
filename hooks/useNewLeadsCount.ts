'use client';

import { startTransition, useCallback, useEffect, useState } from 'react';
import { useActiveProjectId, withActiveProject } from '@/lib/active-project-context';

const STORAGE_KEY = 'leads-last-seen-at';
const POLL_INTERVAL_MS = 30000;

function getLastSeenAt(): number {
  if (typeof window === 'undefined') return Date.now();
  const raw = window.localStorage.getItem(STORAGE_KEY);
  return raw ? Number(raw) : 0;
}

// Cuenta cuántos leads nuevos entraron desde la última vez que se visitó
// /admin/leads, para mostrar un badge en el sidebar sin tener que entrar
// a revisar manualmente.
export function useNewLeadsCount() {
  const activeProjectId = useActiveProjectId();
  const [count, setCount] = useState(0);

  const check = useCallback(async () => {
    try {
      // Con la pestaña en segundo plano nadie mira el badge: no consultar.
      if (document.hidden) return;
      const url = withActiveProject('/api/admin/leads', activeProjectId);
      const res = await fetch(`${url}${url.includes('?') ? '&' : '?'}count=1&since=${getLastSeenAt()}`);
      if (!res.ok) return;
      const data: { count?: number } = await res.json();
      setCount(data.count ?? 0);
    } catch {
      // silencioso — no interrumpir la navegación del admin por esto
    }
  }, [activeProjectId]);

  useEffect(() => {
    startTransition(() => {
      check();
    });
    const interval = setInterval(check, POLL_INTERVAL_MS);
    // Al volver a la pestaña, ponerse al día sin esperar el próximo ciclo.
    const onVisible = () => { if (!document.hidden) check(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [check]);

  const markSeen = useCallback(() => {
    window.localStorage.setItem(STORAGE_KEY, String(Date.now()));
    setCount(0);
  }, []);

  return { count, markSeen };
}
