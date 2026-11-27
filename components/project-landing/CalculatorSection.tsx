import Calculator from '@/components/Calculator';
import type { SectionProps } from './types';
import { calculatorModels } from './calculator-models';

export default function CalculatorSection({ project, typeConfig, locale = 'es' }: SectionProps) {
  if (!typeConfig.showCalculator) return null;
  return <Calculator projectSlug={project.slug} models={calculatorModels(project.units, typeConfig.unitIsLand, locale)} plansOnly={typeConfig.unitIsLand} />;
}
