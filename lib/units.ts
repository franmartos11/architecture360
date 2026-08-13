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
