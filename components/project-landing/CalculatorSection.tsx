import Calculator, { type FinanceableUnit } from '@/components/Calculator';
import type { SectionProps } from './types';

export default function CalculatorSection({ project, typeConfig }: SectionProps) {
  if (!typeConfig.showCalculator) return null;

  // Solo unidades que de verdad se pueden financiar: disponibles y con
  // precio cargado. Antes la calculadora ofrecía cuatro "modelos" con
  // precios inventados, iguales para todos los proyectos.
  const units: FinanceableUnit[] = project.units
    .filter(u => u.status === 'available' && typeof u.price === 'number' && u.price > 0)
    .sort((a, b) => a.price! - b.price!)
    .map(u => ({
      id: u.id,
      label: !typeConfig.unitIsLand && u.modelName ? `${u.name} · ${u.modelName}` : u.name,
      price: u.price!,
      currency: u.currency ?? 'USD',
    }));

  if (units.length === 0) return null;
  return <Calculator projectSlug={project.slug} units={units} />;
}
