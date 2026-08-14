import type { Unit } from '@/types';

// Utilidades de unidades usadas en todo el sitio (producción y admin) —
// antes vivían en data/mockData.ts, que en realidad es solo datos de
// demo; separadas acá para que el nombre del archivo no confunda.

// Nota: recibe la lista de unidades como parámetro (en vez de leer un
// array del módulo) para poder reusarse tanto con datos mock como con
// las unidades ya traídas de Supabase (ver data/project-repository.ts).
export function getUnitsByBuildingAndFloor(unitList: Unit[], buildingId: string, floor: number): Unit[] {
  return unitList.filter(u => u.buildingId === buildingId && u.floor === floor);
}

export function formatPrice(price: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(price);
}

export function getStatusLabel(status: string): string {
  return { available: 'Disponible para vender', reserved: 'Reservado', sold: 'Vendido' }[status] || status;
}

export function getStatusColor(status: string): string {
  return { available: '#22c55e', reserved: '#eab308', sold: '#ef4444' }[status] || '#94a3b8';
}

// Score de similitud (0-100) entre dos unidades, para ordenar el picker
// del comparador por "parecido" a la unidad que se está viendo. Pondera
// m² total (lo que más pesa a la hora de comparar dos deptos), dormitorios,
// baños y tipología — nada de esto requiere datos que no tengamos ya.
export function similarityScore(a: Unit, b: Unit): number {
  const areaScore = a.totalArea > 0 && b.totalArea > 0
    ? Math.max(0, 1 - Math.abs(a.totalArea - b.totalArea) / Math.max(a.totalArea, b.totalArea))
    : 0;
  const bedroomsScore = Math.max(0, 1 - Math.abs(a.bedrooms - b.bedrooms) / 3);
  const bathroomsScore = Math.max(0, 1 - Math.abs(a.bathrooms - b.bathrooms) / 3);
  const typeScore = a.type === b.type ? 1 : 0;

  const total = areaScore * 0.5 + bedroomsScore * 0.2 + bathroomsScore * 0.15 + typeScore * 0.15;
  return Math.round(total * 100);
}
