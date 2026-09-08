'use client';

import { useState, useEffect, useCallback, startTransition } from 'react';

// Favoritos de unidades — solo en este navegador, por proyecto. Usado
// tanto en la lista de unidades (UnitsListView) como en el explorador de
// planta (FloorPlanViewer), para que marcar una unidad como favorita en
// cualquiera de los dos se refleje en el otro.
export function useUnitFavorites(projectSlug: string) {
  const favsKey = `atrium:favorites:${projectSlug}`;
  const [favorites, setFavorites] = useState<string[]>([]);

  useEffect(() => {
    startTransition(() => {
      try {
        const raw = window.localStorage.getItem(favsKey);
        if (raw) setFavorites(JSON.parse(raw));
      } catch {
        // localStorage no disponible (privado/bloqueado) — se sigue sin favoritos.
      }
    });
  }, [favsKey]);

  const toggleFavorite = useCallback((unitId: string) => {
    setFavorites(prev => {
      const next = prev.includes(unitId) ? prev.filter(id => id !== unitId) : [...prev, unitId];
      try { window.localStorage.setItem(favsKey, JSON.stringify(next)); } catch { /* ídem */ }
      return next;
    });
  }, [favsKey]);

  return { favorites, toggleFavorite };
}
