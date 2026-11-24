'use client';

import { useEffect } from 'react';
import { useTrack } from '@/components/analytics/SiteTracker';
import { newId } from '@/lib/analytics/client-state';

/**
 * Registra que se está viendo una unidad (ficha o panel del plano) y, al
 * cambiar de unidad, desmontar u ocultarse la pestaña, manda una sola vez el
 * mismo evento con los segundos que estuvo visible. Sin id (demo, nada
 * seleccionado) no hace nada.
 */
export function useUnitViewTracking(unitDbId: string | null | undefined): void {
  const track = useTrack();

  useEffect(() => {
    if (!unitDbId) return;
    const id = newId();
    const start = Date.now();
    let sent = false;
    track('unit', { id, unitId: unitDbId });

    const flush = () => {
      if (sent) return;
      sent = true;
      track('unit', { id, unitId: unitDbId, durationSeconds: Math.round((Date.now() - start) / 1000) });
    };
    const onVisibility = () => { if (document.visibilityState === 'hidden') flush(); };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      flush();
    };
  }, [unitDbId, track]);
}
