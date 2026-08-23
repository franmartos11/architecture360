import type { Project } from '@/types';
import type { ProjectTypeConfig } from '@/lib/project-types';

export interface SectionProps {
  project: Project;
  typeConfig: ProjectTypeConfig;
}
