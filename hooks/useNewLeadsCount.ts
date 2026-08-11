'use client';

import { useCallback, useEffect, useState } from 'react';

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
  const [count, setCount] = useState(0);

  const check = useCallback(async () => {
    try {
      const res = await fetch('/api/leads');
      if (!res.ok) return;
      const leads: { createdAt: string }[] = await res.json();
      const lastSeenAt = getLastSeenAt();
      const newOnes = leads.filter(l => new Date(l.createdAt).getTime() > lastSeenAt);
      setCount(newOnes.length);
    } catch {
      // silencioso — no interrumpir la navegación del admin por esto
    }
  }, []);

  useEffect(() => {
    check();
    const interval = setInterval(check, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [check]);

  const markSeen = useCallback(() => {
    window.localStorage.setItem(STORAGE_KEY, String(Date.now()));
    setCount(0);
  }, []);

  return { count, markSeen };
}
