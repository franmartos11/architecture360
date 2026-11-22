'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { TransitionLink as Link, useTransitionRouter } from '@/components/ui/TransitionUtils';
import ExploreSwitcher, { navItemClass } from '@/components/ui/ExploreSwitcher';
import LeadCaptureModal from '@/components/ui/LeadCaptureModal';
import { ProjectMenuButton } from '@/components/ui/ProjectMenu';
import { useContactModal } from '@/hooks/useContactModal';
import { useProjectBasePath } from '@/lib/project-base-path-context';
import { EXPLORE_GROUP, projectNavHrefs, projectSectionFor, type ProjectNavInfo } from '@/lib/project-nav';

// Barra única del sitio público de un proyecto — la misma en la web, en
// Explorar 3D y en la ficha de unidad (rediseño C/D). Según el ancho:
// - ≥1200px: las seis secciones a la vista + Contactar, sin botón Menú.
// - <1200px: barra mínima — marca, dónde estás, Contactar y Menú (el menú
//   único de ProjectMenu). En mobile Contactar y Menú quedan solo con ícono.
// Mismo orden en la barra, el menú y la hoja: Proyecto, Explorar 3D,
// Unidades, Amenities, Ubicación, Cotizador → Contactar.
// Pantallas recorridas dentro del sitio en esta pestaña (navegación del
// lado del cliente: document.referrer no cambia en esas). Si la nueva ruta es
// la anterior de la pila, fue un "atrás" y se saca; si no, se apila.
const visited: string[] = [];
function trackVisit(path: string) {
  if (visited[visited.length - 1] === path) return;
  if (visited[visited.length - 2] === path) visited.pop();
  else visited.push(path);
}

export default function Navbar({ info }: { info: ProjectNavInfo }) {
  const pathname = usePathname();
  const basePath = useProjectBasePath();
  const contactModal = useContactModal();
  const hrefs = projectNavHrefs(basePath, info.singleUnit, info.explore.plans?.buildingId);
  const section = projectSectionFor(pathname, basePath, info);
  const isActive = (href: string) => pathname.replace(/\/+$/, '') === href.replace(/\/+$/, '');
  const unitsLabel = info.singleUnit?.label ?? info.unitsLabel;
  // En la ficha de una unidad, "Unidades" también es la sección activa.
  const unitsActive = isActive(hrefs.units) || /\/unidad\/[^/]+\/?$/.test(pathname);

  // Como la barra de aspasoftware.com: en la portada arranca transparente
  // (texto con el color del tema, sobre el fondo del hero) y al scrollear se
  // oscurece con vidrio esmerilado. En el resto de las páginas va siempre
  // oscura: hay vistas (360, masterplan) que pasan por debajo de la barra.
  const onHome = isActive(hrefs.home);
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    if (!onHome) return;
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [onHome]);
  const clear = onHome && !scrolled;
  // Color del contenido de la barra. Solo la barra lo usa (no el menú ni el
  // modal de contacto, que tienen su propio fondo oscuro).
  const navVars = {
    '--nav-fg': clear ? 'var(--theme-text)' : 'var(--theme-text-on-dark)',
    '--nav-fg-muted': clear ? 'var(--theme-text-muted)' : 'var(--theme-text-on-dark-muted)',
  } as React.CSSProperties;

  // Volver (barra mínima): en todas las páginas menos la portada y la ficha
  // de unidad (que trae su propia barra con volver). Va a la pantalla
  // anterior del sitio; si se entró por un link directo, a la "de arriba":
  // el recorrido de un edificio vuelve al edificio, el resto a la portada.
  const router = useTransitionRouter();
  const onUnitPage = /\/unidad\/[^/]+\/?$/.test(pathname);
  const showBack = !onHome && !onUnitPage;
  const parentHref = pathname.match(/^(.*\/edificio\/[^/]+)\/recorrido\/?$/)?.[1] ?? hrefs.home;
  useEffect(() => { trackVisit(pathname); }, [pathname]);
  const goBack = () => {
    // Hay a dónde volver si se navegó dentro del sitio, o si se llegó desde
    // otra página del mismo sitio (recarga completa).
    const fromSite = !!document.referrer && new URL(document.referrer).origin === window.location.origin;
    if (visited.length > 1 || (fromSite && window.history.length > 1)) router.back();
    else router.push(parentHref);
  };

  return (
    // site-nav: queda quieta durante la transición entre páginas;
    // data-site-nav: ahí corre la línea de navegación lenta (globals.css).
    <nav
      aria-label="Principal"
      data-site-nav=""
      style={{ viewTransitionName: 'site-nav', ...navVars }}
      className="fixed top-0 left-0 right-0 z-50"
    >
      {/* Fondo en una capa aparte: con el blur en el <nav>, el vidrio del
          desplegable de Explorar 3D no podría desenfocar la página (un
          ancestro con backdrop-filter corta el fondo que ven sus hijos). */}
      <div
        aria-hidden="true"
        className={`absolute inset-0 -z-10 border-b transition-[background-color,border-color,backdrop-filter] duration-500 ${
          clear
            ? 'bg-transparent border-transparent'
            : 'bg-[var(--theme-bg-alt)]/[.86] backdrop-blur-[24px] backdrop-saturate-[1.6] border-white/[.08]'
        }`}
      />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* ≥1200px: grilla de tres columnas iguales a los costados para que
            los links queden centrados en la barra, sin importar el largo del
            nombre del proyecto. Abajo de eso, una fila flex como siempre. */}
        <div className="flex items-center gap-3 sm:gap-5 h-16 min-[1200px]:grid min-[1200px]:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
          {showBack && (
            <button
              type="button"
              onClick={goBack}
              aria-label="Volver"
              className="min-[1200px]:hidden -ml-2 -mr-1.5 sm:-mr-3 w-11 h-11 shrink-0 flex items-center justify-center rounded-lg text-[var(--nav-fg)]"
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg>
            </button>
          )}
          {/* Marca — este sitio es white-label: lleva el nombre del proyecto, no el de la plataforma. */}
          <Link
            href={hrefs.home}
            aria-label={info.projectLocation ? `${info.projectName}, ${info.projectLocation} — inicio` : `${info.projectName} — inicio`}
            className="hit-44 shrink-0 min-w-0 flex flex-col"
          >
            <span className="block font-[family-name:var(--theme-font-heading)] text-[17px] sm:text-lg font-semibold leading-tight tracking-tight text-[var(--nav-fg)] truncate max-w-[40vw] md:max-w-[280px]">
              {info.projectName}
            </span>
            {info.projectLocation && (
              <span className="hidden sm:block mt-0.5 text-[11px] tracking-[0.2em] uppercase text-[var(--nav-fg-muted)] truncate max-w-[280px]">
                {info.projectLocation}
              </span>
            )}
          </Link>

          <span aria-hidden="true" className={`w-px h-7 shrink-0 bg-[var(--nav-fg)]/20 min-[1200px]:hidden ${section ? '' : 'hidden'}`} />

          {/* Barra completa (≥1200px) */}
          <div className="hidden min-[1200px]:flex items-center gap-1">
            <Link href={hrefs.home} aria-current={onHome ? 'page' : undefined} className={navItemClass(onHome)}>
              Proyecto
            </Link>
            <ExploreSwitcher info={info} current={section?.group === EXPLORE_GROUP ? section.label : undefined} />
            <Link href={hrefs.units} aria-current={unitsActive ? 'page' : undefined} className={`flex items-center gap-2 ${navItemClass(unitsActive)}`}>
              {unitsLabel}
              {!info.singleUnit && info.unitsAvailable != null && (
                <span className="px-[7px] py-0.5 rounded-full text-[11px] font-semibold bg-[var(--theme-accent)]/25 text-[var(--nav-fg)]">
                  {info.unitsAvailable}<span className="sr-only"> disponibles</span>
                </span>
              )}
            </Link>
            <Link href={hrefs.amenities} aria-current={isActive(hrefs.amenities) ? 'page' : undefined} className={navItemClass(isActive(hrefs.amenities))}>
              Amenities
            </Link>
            <Link href={hrefs.location} aria-current={isActive(hrefs.location) ? 'page' : undefined} className={navItemClass(isActive(hrefs.location))}>
              Ubicación
            </Link>
            {info.hasProgress && (
              <Link href={hrefs.progress} className={navItemClass(false)}>
                Avance de obra
              </Link>
            )}
            {info.showCalculator && (
              <Link href={hrefs.calculator} className={navItemClass(false)}>
                Cotizador
              </Link>
            )}
          </div>

          {/* Barra mínima (<1200px): dónde estás. En Explorar 3D, mobile
              apila "Explorar 3D" sobre la vista; desde sm van en una línea. */}
          <div className="min-[1200px]:hidden flex-1 min-w-0 flex items-center text-[var(--nav-fg)]">
            {section?.group ? (
              <>
                <span className="md:hidden min-w-0 flex flex-col">
                  <span className="text-xs text-[var(--nav-fg-muted)]">{section.group}</span>
                  <span className="text-[15px] font-semibold truncate">{section.label}</span>
                </span>
                <span className="hidden md:flex items-baseline gap-2.5 min-w-0 text-[15px]">
                  <span className="text-[var(--nav-fg-muted)] whitespace-nowrap">{section.group}</span>
                  <span aria-hidden="true" className="text-[var(--nav-fg)]/35">/</span>
                  <span className="font-semibold truncate">{section.label}</span>
                  {section.detail && <span className="text-sm text-[var(--nav-fg-muted)] truncate">{section.detail}</span>}
                </span>
              </>
            ) : section && (
              <span className="min-w-0 flex items-baseline gap-2 sm:gap-3 text-sm sm:text-[15px]">
                <span className="font-semibold truncate">{section.label}</span>
                {section.detail && (
                  <span className="hidden sm:inline text-[13px] sm:text-sm text-[var(--nav-fg-muted)] truncate">{section.detail}</span>
                )}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0 justify-self-end">
            {info.showLeads && (
              <button
                type="button"
                onClick={() => contactModal.open()}
                aria-label="Contactar"
                className="nav-cta h-11 w-11 sm:h-10 sm:w-auto sm:px-5 text-[15px] font-semibold whitespace-nowrap"
              >
                {/* En mobile no entra el texto: queda redondo con un sobre. */}
                <svg className="sm:hidden w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="3" y="5" width="18" height="14" rx="3" />
                  <path d="m4 7 8 6 8-6" />
                </svg>
                <span className="hidden sm:inline">Contactar</span>
              </button>
            )}
            <div className="min-[1200px]:hidden">
              <ProjectMenuButton info={info} />
            </div>
          </div>
        </div>
      </div>

      {info.showLeads && (
        <LeadCaptureModal
          isOpen={contactModal.isOpen}
          onClose={contactModal.close}
          unit={null}
          projectSlug={info.projectSlug}
          defaultMethod={contactModal.method}
        />
      )}
    </nav>
  );
}
