import { hasConstructionProgress } from '@/lib/construction-progress';
import ConstructionProgressView from './ConstructionProgressView';
import type { SectionProps } from './types';

// Avance de obra — la vista (animaciones, time-lapse) es de cliente; acá
// solo se decide si hay algo para mostrar, igual que el resto de las
// secciones: sin fotos, porcentaje ni entrega cargados, no aparece.
export default function ConstructionProgressSection({ project }: SectionProps) {
  if (!hasConstructionProgress(project.constructionProgress)) return null;
  return <ConstructionProgressView progress={project.constructionProgress} />;
}
