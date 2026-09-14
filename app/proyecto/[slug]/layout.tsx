import { notFound } from 'next/navigation';
import Navbar from '@/components/ui/Navbar';
import { getProjectBasePath } from '@/lib/project-base-path';
import { ProjectBasePathProvider } from '@/lib/project-base-path-context';
import { getPublicProjectBySlug } from '@/data/project-repository';
import { getProjectTypeConfig } from '@/lib/project-types';
import { resolveTheme } from '@/lib/resolve-theme';
import { ALL_FONT_CLASSNAMES } from '@/lib/fonts';

interface LayoutProps {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}

// Dueño del "chrome" del sitio público de un proyecto: el theme (variables
// CSS + fuentes) y la navegación global. Vive acá y no en page.tsx porque
// las sub-rutas (/unidades, /amenities, /ubicacion, /masterplan, /recorrido,
// /edificio/[buildingId]) son HERMANAS de page.tsx, no hijas — montado en la
// página, el theme no llegaba a ninguna de ellas y el explorador quedaba sin
// la identidad visual que la desarrolladora personalizó.
//
// El fetch del proyecto no agrega un query: getPublicProjectBySlug está
// memoizado con cache() de React, así que esta llamada y la que hace cada
// página en la misma request se deduplican.
export default async function ProjectLayout({ children, params }: LayoutProps) {
  const { slug } = await params;
  const [basePath, project] = await Promise.all([
    getProjectBasePath(slug),
    getPublicProjectBySlug(slug),
  ]);
  if (!project) notFound();

  const typeConfig = getProjectTypeConfig(project.projectType, project.saleMode);
  const theme = resolveTheme(project.themeConfig);

  return (
    <ProjectBasePathProvider basePath={basePath}>
      <div
        className={`${ALL_FONT_CLASSNAMES} theme-bg-image theme-bg-image--fixed bg-[var(--theme-bg)] min-h-screen`}
        style={{ ...theme.cssVars, fontFamily: 'var(--theme-font-body)' } as React.CSSProperties}
      >
        {theme.fontFaceCss && <style dangerouslySetInnerHTML={{ __html: theme.fontFaceCss }} />}
        <Navbar
          projectName={project.name}
          showCalculator={typeConfig.showCalculator}
          hasTour={!!project.commonAreasTour}
          singleUnit={!typeConfig.hasUnitStep && project.units[0]
            ? { buildingId: project.units[0].buildingId, unitId: project.units[0].id, label: typeConfig.unitLabel }
            : undefined}
          unitsLabel={`${typeConfig.unitLabel}s`}
        />
        {/* El Navbar es fixed h-16: este padding es el único lugar donde se
            compensa su alto, para las seis sub-rutas a la vez. La landing lo
            neutraliza con un margen negativo (ver page.tsx) porque su hero es
            a pantalla completa y va por debajo del nav a propósito. */}
        <div className="pt-16">{children}</div>
      </div>
    </ProjectBasePathProvider>
  );
}
