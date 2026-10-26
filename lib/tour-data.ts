import type { TourData, TourView } from '@/types';

// Fija la vista inicial (hacia dónde mira la cámara al entrar) de un
// ambiente. Inmutable: devuelve un TourData nuevo, o el mismo objeto si el
// nodo no existe, así el llamador puede evitar un guardado inútil.
export function setNodeInitialView(tour: TourData, nodeId: string, view: TourView): TourData {
  if (!tour.nodes.some(n => n.id === nodeId)) return tour;
  return {
    ...tour,
    nodes: tour.nodes.map(n => (n.id === nodeId ? { ...n, initialView: { ...view } } : n)),
  };
}
