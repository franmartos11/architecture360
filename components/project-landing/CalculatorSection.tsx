import Calculator from '@/components/Calculator';
import type { SectionProps } from './types';

export default function CalculatorSection({ project, typeConfig }: SectionProps) {
  if (!typeConfig.showCalculator) return null;
  return <Calculator projectSlug={project.slug} />;
}
