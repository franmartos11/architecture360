import type { TourData } from '@/types';

export interface TourStats {
  nodeCount: number;
  totalLinks: number;
  orphanCount: number;
  hasStart: boolean;
}

// Un nodo está "conectado" si es origen o destino de al menos un link hotspot.
// Con un solo nodo no aplica: es el único ambiente, no necesita conexión.
export function getTourStats(tour: TourData | null | undefined): TourStats {
  const nodes = tour?.nodes ?? [];
  const connectedIds = new Set<string>();
  nodes.forEach(n => (n.linkHotspots ?? []).forEach(h => { connectedIds.add(n.id); connectedIds.add(h.targetNodeId); }));
  const orphanCount = nodes.length > 1 ? nodes.filter(n => !connectedIds.has(n.id)).length : 0;
  const hasStart = nodes.some(n => n.id === tour?.initialNodeId);
  const totalLinks = nodes.reduce((a, n) => a + (n.linkHotspots?.length ?? 0), 0) / 2;

  return { nodeCount: nodes.length, totalLinks, orphanCount, hasStart };
}
