// Unidades comparables a una dada, para ofrecer una salida real cuando el
// comprador llega a una unidad vendida. Criterio deliberadamente simple —
// mismo edificio, misma tipología, disponible — usando sólo campos que Unit
// ya tiene: no hace falta infraestructura de datos nueva.
export interface SimilarUnitsInput {
  buildingId: string;
  type: string;
  status: string;
}

export function findSimilarUnits<T extends SimilarUnitsInput & { id: string }>(
  unit: T,
  allUnits: T[],
): T[] {
  return allUnits.filter(
    candidate =>
      candidate.id !== unit.id &&
      candidate.buildingId === unit.buildingId &&
      candidate.type === unit.type &&
      candidate.status === 'available',
  );
}
