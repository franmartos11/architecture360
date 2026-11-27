import type { Project } from '@/types';
import type { ProjectTypeConfig } from '@/lib/project-types';
import type { Locale } from '@/lib/i18n/locales';

export interface SectionProps {
  project: Project;
  typeConfig: ProjectTypeConfig;
  /** Prefijo para los links internos del proyecto — ver lib/project-base-path.ts:getProjectBasePath. */
  basePath: string;
  /** Idioma de la página pública. Sin él (vista previa del panel), castellano. */
  locale?: Locale;
}
