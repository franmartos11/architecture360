'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { TransitionLink as Link } from '@/components/ui/TransitionUtils';
import ExploreSwitcher, { navItemClass } from '@/components/ui/ExploreSwitcher';
import LeadCaptureModal from '@/components/ui/LeadCaptureModal';
import { ProjectMenuButton, ChatIcon } from '@/components/ui/ProjectMenu';
import { useContactModal } from '@/hooks/useContactModal';
import { useProjectBasePath } from '@/lib/project-base-path-context';
import { projectNavHrefs, projectSectionFor, type ProjectNavInfo } from '@/lib/project-nav';

// Barra única del sitio público de un proyecto — la misma en la web, en
// Explorar 3D y en la ficha de unidad (rediseño C/D). Según el ancho:
// - ≥1200px: las seis secciones a la vista + Contactar, sin botón Menú.
// - <1200px: barra mínima — marca, dónde estás, Contactar y Menú (el menú
//   único de ProjectMenu). En mobile Contactar y Menú quedan solo con ícono.
// Mismo orden en la barra, el menú y la hoja: Proyecto, Explorar 3D,
// Unidades, Amenities, Ubicación, Cotizador → Contactar.
export default function Navbar({ info }: { info: ProjectNavInfo }) {
  const pathname = usePathname();
  const basePath = useProjectBasePath();
  const contactModal = useContactModal();
  const hrefs = projectNavHrefs(basePath, info.singleUnit, info.explore.plans?.buildingId);
  const section = projectSectionFor(pathname, basePath, info);
  const isActive = (href: string) => pathname.replace(/\/+$/, '') === href.replace(/\/+$/, '');
  const unitsLabel = info.singleUnit?.label ?? info.unitsLabel;

  // Sólida (sin vidrio) salvo sobre la foto del hero de la portada: el
  // vidrio translúcido sobre fondos claros se veía gris lavado.
  const onHome = isActive(hrefs.home);
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    if (!onHome) return;
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [onHome]);
  const glass = onHome && !scrolled;

  return (
    <nav
      aria-label="Principal"
      className={`fixed top-0 left-0 right-0 z-50 border-b transition-[background-color,box-shadow] duration-300 ${
        glass
          ? 'bg-[var(--theme-bg-alt)]/70 backdrop-blur-xl border-[var(--theme-border-on-dark)]'
          : 'bg-[var(--theme-bg-alt)] border-[var(--theme-text-on-dark)]/10 shadow-[0_6px_20px_rgba(0,0,0,0.2)]'
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3 sm:gap-5 h-16">
          {/* Marca — este sitio es white-label: lleva el nombre del proyecto, no el de la plataforma. */}
          <Link
            href={hrefs.home}
            aria-label={info.projectLocation ? `${info.projectName}, ${info.projectLocation} — inicio` : `${info.projectName} — inicio`}
            className="shrink-0 min-w-0 flex flex-col"
          >
            <span className="block font-[family-name:var(--theme-font-heading)] text-[17px] sm:text-lg font-semibold leading-tight tracking-tight text-[var(--theme-text-on-dark)] truncate max-w-[40vw] md:max-w-[280px]">
              {info.projectName}
            </span>
            {info.projectLocation && (
              <span className="hidden sm:block mt-0.5 text-[9px] sm:text-[10px] tracking-[0.24em] uppercase text-[var(--theme-text-on-dark-muted)] truncate max-w-[280px]">
                {info.projectLocation}
              </span>
            )}
          </Link>

          <span aria-hidden="true" className={`w-px h-7 shrink-0 bg-[var(--theme-text-on-dark)]/20 ${section ? '' : 'hidden min-[1200px]:block'}`} />

          {/* Barra completa (≥1200px) */}
          <div className="hidden min-[1200px]:flex flex-1 min-w-0 items-center gap-0.5">
            <Link href={hrefs.home} aria-current={onHome ? 'page' : undefined} className={`px-3.5 py-2.5 rounded-lg text-[15px] font-medium transition-colors ${navItemClass(onHome)}`}>
              Proyecto
            </Link>
            <ExploreSwitcher info={info} current={section?.group ? section.label : undefined} />
            <Link href={hrefs.units} aria-current={isActive(hrefs.units) ? 'page' : undefined} className={`flex items-center gap-2 px-3.5 py-2.5 rounded-lg text-[15px] font-medium whitespace-nowrap transition-colors ${navItemClass(isActive(hrefs.units))}`}>
              {unitsLabel}
              {!info.singleUnit && info.unitsAvailable != null && (
                <span className="px-[7px] py-0.5 rounded-full text-[11px] font-semibold bg-[var(--theme-accent)]/25 text-[var(--theme-text-on-dark)]">
                  {info.unitsAvailable}<span className="sr-only"> disponibles</span>
                </span>
              )}
            </Link>
            <Link href={hrefs.amenities} aria-current={isActive(hrefs.amenities) ? 'page' : undefined} className={`px-3.5 py-2.5 rounded-lg text-[15px] font-medium transition-colors ${navItemClass(isActive(hrefs.amenities))}`}>
              Amenities
            </Link>
            <Link href={hrefs.location} aria-current={isActive(hrefs.location) ? 'page' : undefined} className={`px-3.5 py-2.5 rounded-lg text-[15px] font-medium transition-colors ${navItemClass(isActive(hrefs.location))}`}>
              Ubicación
            </Link>
            {info.showCalculator && (
              <Link href={hrefs.calculator} className={`px-3.5 py-2.5 rounded-lg text-[15px] font-medium transition-colors ${navItemClass(false)}`}>
                Cotizador
              </Link>
            )}
          </div>

          {/* Barra mínima (<1200px): dónde estás. En Explorar 3D, mobile
              apila "Explorar 3D" sobre la vista; desde sm van en una línea. */}
          <div className="min-[1200px]:hidden flex-1 min-w-0 flex items-center text-[var(--theme-text-on-dark)]">
            {section?.group ? (
              <>
                <span className="md:hidden min-w-0 flex flex-col">
                  <span className="text-[11px] text-[var(--theme-text-on-dark-muted)]">{section.group}</span>
                  <span className="text-[15px] font-semibold truncate">{section.label}</span>
                </span>
                <span className="hidden md:flex items-baseline gap-2.5 min-w-0 text-[15px]">
                  <span className="text-[var(--theme-text-on-dark-muted)] whitespace-nowrap">{section.group}</span>
                  <span aria-hidden="true" className="text-[var(--theme-text-on-dark)]/35">/</span>
                  <span className="font-semibold truncate">{section.label}</span>
                  {section.detail && <span className="text-sm text-[var(--theme-text-on-dark-muted)] truncate">{section.detail}</span>}
                </span>
              </>
            ) : section && (
              <span className="min-w-0 flex items-baseline gap-2 sm:gap-3 text-sm sm:text-[15px]">
                <span className="font-semibold truncate">{section.label}</span>
                {section.detail && (
                  <span className="hidden sm:inline text-[13px] sm:text-sm text-[var(--theme-text-on-dark-muted)] truncate">{section.detail}</span>
                )}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {info.showLeads && (
              <button
                type="button"
                onClick={() => contactModal.open()}
                aria-label="Contactar"
                className="h-11 w-11 sm:h-10 sm:w-auto sm:px-4 flex items-center justify-center gap-2 rounded-lg bg-[var(--theme-accent)] hover:opacity-85 text-[var(--theme-text-on-accent)] text-sm font-semibold transition-opacity"
              >
                <ChatIcon className="w-[17px] h-[17px] shrink-0" />
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
