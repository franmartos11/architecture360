import type { CalculatorModel } from '@/components/Calculator';
import type { Unit } from '@/types';

// Opciones de "Modelo" del Cotizador: una por tipología (modelName) con su
// precio más bajo entre las unidades disponibles — los mismos grupos que
// muestra "Conocé cada espacio". En un loteo todos los lotes son "Lote", así
// que se agrupan por superficie ("Lote de 600 m²").
const MAX_MODELS = 6;

export function calculatorModels(units: Unit[], unitIsLand: boolean): CalculatorModel[] {
  const byModel = new Map<string, CalculatorModel>();
  for (const u of units) {
    if (u.status !== 'available' || typeof u.price !== 'number' || u.price <= 0) continue;
    const area = Number(u.totalArea);
    const label = unitIsLand && area > 0
      ? `Lote de ${area.toLocaleString('es-AR')} m²`
      : u.modelName || u.type;
    const prev = byModel.get(label);
    if (!prev || u.price < prev.price) byModel.set(label, { label, price: u.price, currency: u.currency ?? 'USD' });
  }
  return [...byModel.values()].sort((a, b) => a.price - b.price).slice(0, MAX_MODELS);
}
