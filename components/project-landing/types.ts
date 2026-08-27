import type { Project } from '@/types';
import type { ProjectTypeConfig } from '@/lib/project-types';

export interface SectionProps {
  project: Project;
  typeConfig: ProjectTypeConfig;
  /** Prefijo para los links internos del proyecto — ver lib/project-base-path.ts:getProjectBasePath. */
  basePath: string;
}
