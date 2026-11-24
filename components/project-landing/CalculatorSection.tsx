import Calculator from '@/components/Calculator';
import type { SectionProps } from './types';
import { calculatorModels } from './calculator-models';

export default function CalculatorSection({ project, typeConfig }: SectionProps) {
  if (!typeConfig.showCalculator) return null;
  return <Calculator projectSlug={project.slug} models={calculatorModels(project.units, typeConfig.unitIsLand)} plansOnly={typeConfig.unitIsLand} />;
}
