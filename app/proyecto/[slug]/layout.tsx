import { notFound } from 'next/navigation';
import ProjectChrome from '@/components/ui/ProjectChrome';
import { getProjectBasePath } from '@/lib/project-base-path';
import { ProjectBasePathProvider } from '@/lib/project-base-path-context';
import { ProjectWhatsappProvider } from '@/lib/project-whatsapp-context';
import type { Metadata } from 'next';
import { getSiteProject } from '@/data/project-repository';
import DraftPreviewBar from '@/components/project-landing/DraftPreviewBar';
import { getProjectTypeConfig } from '@/lib/project-types';
import { resolveTheme } from '@/lib/resolve-theme';
import { resolveWebTemplateKey } from '@/lib/web-templates';
import { ALL_FONT_CLASSNAMES } from '@/lib/fonts';
import { projectHasContent } from '@/lib/project-content';
import SiteTracker from '@/components/analytics/SiteTracker';
import ChatWidgetLoader from '@/components/chat/ChatWidgetLoader';
import HtmlLang from '@/components/i18n/HtmlLang';
import { LocaleProvider } from '@/lib/i18n/client';
import { getLocale } from '@/lib/i18n/server';
import { intlLocale, type Locale } from '@/lib/i18n/locales';
import { crearT, type T } from '@/lib/i18n/t';

import { pluralize } from '@/lib/units';
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
// El fetch del proyecto no agrega un query: getSiteProject está
// memoizado con cache() de React, así que esta llamada y la que hace cada
// página en la misma request se deduplican.
// "Exterior y terraza" — bajada de Recorrido 360 en el desplegable de
// Explorar 3D. Con más de tres espacios, solo la cantidad.
function tourSpacesLabel(names: string[], t: T, locale: Locale): string | undefined {
  if (names.length === 0) return undefined;
  if (names.length > 3) return t('sitio.layout.espacios', { n: names.length });
  const list = names.map((n, i) => (i === 0 ? n : n.toLowerCase()));
  return new Intl.ListFormat(intlLocale(locale), { type: 'conjunction' }).format(list);
}

// Un borrador solo lo ve su dueño (ver getSiteProject), pero igual: que
// ningún buscador lo indexe si alguien comparte el link antes de publicar.
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const view = await getSiteProject(slug);
  return view?.isDraftPreview ? { robots: { index: false, follow: false } } : {};
}

export default async function ProjectLayout({ children, params }: LayoutProps) {
  const { slug } = await params;
  const [basePath, view, locale] = await Promise.all([
    getProjectBasePath(slug),
    getSiteProject(slug),
    getLocale(),
  ]);
  if (!view) notFound();
  const { project, isDraftPreview, canPublish } = view;
  // El idioma ya se leyó arriba (junto con el proyecto): no se vuelve a pedir.
  const t = crearT(locale);
  // /en de un proyecto sin inglés activado: no existe.
  if (!project.locales.includes(locale)) notFound();

  const typeConfig = getProjectTypeConfig(project.projectType, project.saleMode, locale);
  const theme = resolveTheme(project.themeConfig);
  const content = projectHasContent(project);
  // Barra y menú: solo las secciones con contenido, salvo en la vista previa
  // del borrador — ahí van todas, para que el dueño entre a las que le faltan
  // cargar (esas páginas le muestran el mensaje de vacío en vez de un 404).
  // El recorrido no: /recorrido sin tour da 404 también en el borrador.
  const inNav = (has: boolean) => has || isDraftPreview;
  const isDefaultLocale = locale === 'es';
  // "Plantas" del menú: el primer edificio con plano cargado. Una casa no
  // tiene plano propio (su edificio redirige a la ficha), así que no va.
  const plansBuilding = typeConfig.hasUnitStep
    ? project.buildings.find(b => b.floors.some(f => f.planImage))
    : undefined;

  return (
    <LocaleProvider locale={locale} disponibles={project.locales}>
    {!isDefaultLocale && <HtmlLang locale={locale} />}
    <ProjectBasePathProvider basePath={basePath}>
      <ProjectWhatsappProvider numero={project.whatsappNumber}>
      <SiteTracker projectSlug={project.slug} isDraftPreview={isDraftPreview} briefUrl={project.briefPdfUrl ?? undefined}>
      <div
        data-project-theme
        data-web-template={resolveWebTemplateKey(project.themeConfig?.webTemplate)}
        className={`${ALL_FONT_CLASSNAMES} theme-bg-image theme-bg-image--fixed bg-[var(--theme-bg)] min-h-screen`}
        style={{ ...theme.cssVars, fontFamily: 'var(--theme-font-body)' } as React.CSSProperties}
      >
        {theme.fontFaceCss && <style dangerouslySetInnerHTML={{ __html: theme.fontFaceCss }} />}
        {/* El Navbar es fixed h-16 y ProjectChrome compensa ese alto con
            pt-16 para las seis sub-rutas a la vez (y se auto-oculta en modo
            embed — ver ProjectChrome.tsx). La landing neutraliza el padding
            con un margen negativo (ver page.tsx) porque su hero es a
            pantalla completa y va por debajo del nav a propósito. */}
        <ProjectChrome
          projectName={project.name}
          hasTour={content.tour}
          singleUnit={!typeConfig.hasUnitStep && project.units[0]
            ? { buildingId: project.units[0].buildingId, unitId: project.units[0].id, label: typeConfig.unitLabel }
            : undefined}
          unitsLabel={pluralize(typeConfig.unitLabel, locale)}
          projectSlug={project.slug}
          projectLocation={project.location?.split(',')[0]?.trim() || undefined}
          showLeads={typeConfig.showLeads}
          briefUrl={project.briefPdfUrl}
          unitsAvailable={typeConfig.showStatus ? project.units.filter(u => u.status === 'available').length : undefined}
          amenitiesCount={project.amenities.length}
          hasAmenities={inNav(content.amenities)}
          hasLocation={inNav(content.location)}
          hasUnits={inNav(content.units)}
          buildingNames={Object.fromEntries(project.buildings.map(b => [b.id, b.name]))}
          explore={{
            hasFacade: inNav(content.facade),
            facadeImage: project.aerialSlides[0]?.imageUrl || project.masterplanImage || undefined,
            facadeDetail: project.aerialSlides.length > 1 ? t('sitio.layout.angulos', { n: project.aerialSlides.length }) : t('sitio.layout.vistaAerea'),
            plans: plansBuilding && {
              buildingId: plansBuilding.id,
              image: plansBuilding.floors.find(f => f.planImage)?.planImage || plansBuilding.coverImage,
              label: typeConfig.hasFloorStep ? t('nav.plantas') : t('sitio.layout.planoDe', { unidad: typeConfig.unitLabel, unidades: pluralize(typeConfig.unitLabel, locale) }),
              detail: typeConfig.hasFloorStep && plansBuilding.floors.length > 1
                ? t('sitio.layout.pisosElegi', { n: plansBuilding.floors.length })
                : t('sitio.layout.elegiTuUnidad'),
            },
            tourImage: project.commonAreasTour?.nodes.find(n => n.id === project.commonAreasTour?.initialNodeId)?.imageUrl
              ?? project.commonAreasTour?.nodes[0]?.imageUrl,
            tourDetail: project.commonAreasTour ? tourSpacesLabel(project.commonAreasTour.nodes.map(n => n.name), t, locale) : undefined,
          }}
        >
          {children}
        </ProjectChrome>
        {isDraftPreview && <DraftPreviewBar projectId={project.id} canPublish={canPublish} />}
        {project.chat && !isDraftPreview && <ChatWidgetLoader projectSlug={project.slug} nombreBot={project.chat.nombreBot} formulario={typeConfig.showLeads} />}
      </div>
      </SiteTracker>
      </ProjectWhatsappProvider>
    </ProjectBasePathProvider>
    </LocaleProvider>
  );
}
