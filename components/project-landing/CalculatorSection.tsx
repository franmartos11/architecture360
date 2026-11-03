import Calculator, { type CalculatorModel } from '@/components/Calculator';
import type { SectionProps } from './types';

// Un modelo por tipología (modelName) con su precio más bajo entre las
// unidades disponibles — los mismos grupos que muestra "Conocé cada espacio".
const MAX_MODELS = 6;

export default function CalculatorSection({ project, typeConfig }: SectionProps) {
  if (!typeConfig.showCalculator) return null;

  const byModel = new Map<string, CalculatorModel>();
  for (const u of project.units) {
    if (u.status !== 'available' || typeof u.price !== 'number' || u.price <= 0) continue;
    const label = u.modelName || u.type;
    const prev = byModel.get(label);
    if (!prev || u.price < prev.price) byModel.set(label, { label, price: u.price, currency: u.currency ?? 'USD' });
  }
  const models = [...byModel.values()].sort((a, b) => a.price - b.price).slice(0, MAX_MODELS);

  return <Calculator projectSlug={project.slug} models={models} />;
}
