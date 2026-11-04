'use client';

import { usePublishState, type MissingSection } from '@/lib/publish-state-context';

export type { MissingSection };

// Qué secciones de la landing pública están habilitadas pero vacías. Ahora
// sale del estado de publicación compartido del panel (una sola consulta
// para el sidebar y todas las pantallas, refrescada al navegar) — ver
// lib/publish-state-context.tsx.
export function useProjectCompleteness() {
  const { missingSections, loading } = usePublishState();
  return { missing: missingSections, loading };
}
