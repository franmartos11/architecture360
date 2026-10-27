'use client';

import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { usePathname } from 'next/navigation';
import { TransitionLink as Link } from '@/components/ui/TransitionUtils';
import LeadCaptureModal from '@/components/ui/LeadCaptureModal';
import { useContactModal } from '@/hooks/useContactModal';
import { useScrollLock } from '@/hooks/useScrollLock';
import { useProjectBasePath } from '@/lib/project-base-path-context';
import { projectNavHrefs, projectSectionFor, type ProjectNavInfo } from '@/lib/project-nav';

// Menú único del sitio público de un proyecto (rediseño C/D), para pantallas
// de menos de 1200px — desde ahí la barra lista todas las secciones. Mismo
// orden que la barra; la sección actual queda marcada. Tablet: pantalla
// completa. Mobile: hoja que sube desde abajo, cerca del pulgar, con
// Contactar fijo al final.

// bar: la barra global. light: barras blancas de la ficha de unidad.
type Variant = 'bar' | 'light';

const TRIGGER_CLASS: Record<Variant, string> = {
  bar: 'h-11 w-11 justify-center sm:h-10 sm:w-auto sm:px-4 rounded-lg bg-[var(--theme-text-on-dark)]/10 border border-[var(--theme-text-on-dark)]/15 text-[var(--theme-text-on-dark)] hover:bg-[var(--theme-text-on-dark)]/15',
  light: 'w-9 h-9 justify-center rounded-full bg-gray-100 text-gray-600 md:w-auto md:h-auto md:px-4 md:py-1.5 md:rounded-lg md:bg-white md:shadow md:text-gray-700 md:hover:bg-gray-50',
};

export function ProjectMenuButton({ info, variant = 'bar' }: { info: ProjectNavInfo; variant?: Variant }) {
  const [open, setOpen] = useState(false);
  const contactModal = useContactModal();
  const close = useCallback(() => setOpen(false), []);
  const [leadMessage, setLeadMessage] = useState<string | undefined>();
  const contact = useCallback((message?: string) => {
    setOpen(false);
    setLeadMessage(message);
    contactModal.open();
  }, [contactModal]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Abrir menú"
        aria-expanded={open}
        className={`pointer-events-auto flex items-center gap-2 text-sm font-medium whitespace-nowrap transition-colors ${TRIGGER_CLASS[variant]}`}
      >
        <svg className="w-[18px] h-[18px] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true">
          <path d="M4 7h16M4 12h16M4 17h16" />
        </svg>
        <span className="hidden sm:inline">Menú</span>
      </button>

      {open && (
        <ProjectMenuOverlay
          info={info}
          onClose={close}
          onContact={contact}
        />
      )}

      {info.showLeads && (
        <LeadCaptureModal
          isOpen={contactModal.isOpen}
          onClose={contactModal.close}
          unit={null}
          projectSlug={info.projectSlug}
          defaultMethod={contactModal.method}
          initialMessage={leadMessage}
        />
      )}
    </>
  );
}

export interface ExploreCard { href: string; label: string; image?: string; detail?: string }

// Destinos de "Explorar 3D" — los comparten el menú y el selector de las
// migas de pan (ExploreSwitcher), así los dos listan lo mismo.
export function exploreCardsFor(info: ProjectNavInfo, basePath: string): ExploreCard[] {
  const hrefs = projectNavHrefs(basePath, info.singleUnit, info.explore.plans?.buildingId);
  const cards: (ExploreCard | null)[] = [
    { href: hrefs.masterplan, label: 'Fachada', image: info.explore.facadeImage, detail: info.explore.facadeDetail },
    hrefs.plans && info.explore.plans
      ? { href: hrefs.plans, label: info.explore.plans.label, image: info.explore.plans.image, detail: info.explore.plans.detail }
      : null,
    info.hasTour ? { href: hrefs.tour, label: 'Recorrido 360', image: info.explore.tourImage, detail: info.explore.tourDetail } : null,
  ];
  return cards.filter((c): c is ExploreCard => !!c);
}

export function ChatIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.9} strokeLinejoin="round" aria-hidden="true">
      <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" />
    </svg>
  );
}

function ProjectMenuOverlay({ info, onClose, onContact }: {
  info: ProjectNavInfo;
  onClose: () => void;
  /** message: texto inicial del formulario (ej. "Agendar visita"). */
  onContact: (message?: string) => void;
}) {
  const pathname = usePathname();
  const basePath = useProjectBasePath();
  const hrefs = projectNavHrefs(basePath, info.singleUnit, info.explore.plans?.buildingId);
  const unitsLabel = info.singleUnit?.label ?? info.unitsLabel;

  useScrollLock(true);

  // Portal por lo mismo que ModalPortal (un ancestro con transform o
  // backdrop-filter — la barra, los visores con framer-motion — recorta un
  // position: fixed), pero al contenedor del theme y no al body: ahí viven
  // las variables --theme-* que pinta el menú. El overlay solo se monta
  // tras un clic, así que document ya existe.
  const [portalTarget] = useState(() => document.querySelector('[data-project-theme]') ?? document.body);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const isActive = (href: string) => pathname.replace(/\/+$/, '') === href.replace(/\/+$/, '');
  const section = projectSectionFor(pathname, basePath, info);
  const exploreCards = exploreCardsFor(info, basePath);

  // Mismo orden que la barra completa (ver Navbar): Proyecto, Explorar 3D,
  // Unidades, Amenities, Ubicación, Cotizador → Contactar.
  const after = [
    {
      href: hrefs.units,
      label: unitsLabel,
      detail: !info.singleUnit && info.unitsAvailable != null ? `${info.unitsAvailable} disponibles` : undefined,
    },
    { href: hrefs.amenities, label: 'Amenities' },
    { href: hrefs.location, label: 'Ubicación' },
    ...(info.showCalculator ? [{ href: hrefs.calculator, label: 'Cotizador' }] : []),
  ];

  return createPortal(
    <div className="fixed inset-0 z-[55]" role="dialog" aria-modal="true" aria-label="Menú">
      {/* Mobile: velo sobre la vista, la hoja sube desde abajo. Tablet: pantalla completa. */}
      <button type="button" aria-label="Cerrar menú" onClick={onClose} className="absolute inset-0 bg-black/60 cursor-default" />

      <div
        className="absolute inset-x-0 bottom-0 max-h-[90vh] overflow-y-auto rounded-t-3xl bg-[var(--theme-bg-alt)] text-[var(--theme-text-on-dark)]
          md:inset-0 md:max-h-none md:rounded-none"
        style={{ fontFamily: 'var(--theme-font-body)' }}
      >
        <div className="max-w-3xl mx-auto px-[18px] pb-[22px] md:px-8 md:pb-8 flex flex-col md:min-h-full">
          {/* Cabecera — tablet: marca + Cerrar; mobile: tirador de la hoja. */}
          <div className="md:hidden flex justify-center pt-2.5 pb-2">
            <span aria-hidden="true" className="w-10 h-1 rounded-full bg-[var(--theme-text-on-dark)]/25" />
          </div>
          <div className="hidden md:flex h-16 items-center gap-6">
            <span className="flex-1 min-w-0 flex flex-col">
              <span className="font-[family-name:var(--theme-font-heading)] text-[17px] font-semibold leading-tight tracking-tight truncate">{info.projectName}</span>
              {info.projectLocation && (
                <span className="mt-0.5 text-[9px] tracking-[0.24em] uppercase text-[var(--theme-text-on-dark-muted)]">{info.projectLocation}</span>
              )}
            </span>
            <CloseButton onClick={onClose} />
          </div>

          <nav aria-label="Menú principal" className="flex flex-col md:flex-1 md:pt-2">
            <MenuLink href={hrefs.home} label="Proyecto" active={isActive(hrefs.home)} onClose={onClose} first />

            {exploreCards.length > 0 && (
              <div className="flex flex-col md:flex-row md:items-center gap-2.5 md:gap-3.5 py-2.5 md:py-1.5 border-t border-[var(--theme-text-on-dark)]/[.08] md:border-0">
                <ActiveLabel active={!!section?.group} className="md:min-w-[150px]">Explorar 3D</ActiveLabel>
                <div className="grid grid-cols-3 gap-2 md:flex md:gap-2">
                  {exploreCards.map(card => {
                    const active = card.label === section?.label && !!section?.group;
                    return (
                      <Link
                        key={card.href}
                        href={card.href}
                        onClick={onClose}
                        aria-current={active ? 'page' : undefined}
                        aria-label={card.detail ? `${card.label} — ${card.detail}` : card.label}
                        className={`flex flex-col gap-1.5 text-xs font-medium md:flex-row md:items-center md:gap-1.5 md:pl-1 md:pr-2 md:py-1 md:rounded-lg md:border ${
                          active ? 'md:border-[var(--theme-accent)] md:font-semibold' : 'md:border-[var(--theme-text-on-dark)]/15'
                        }`}
                      >
                        <span
                          className={`block w-full aspect-[16/11] md:w-9 md:h-[26px] md:aspect-auto overflow-hidden rounded-lg md:rounded-[5px] bg-[var(--theme-text-on-dark)]/10 box-border ${
                            active ? 'ring-2 ring-[var(--theme-accent)] md:ring-0' : ''
                          }`}
                        >
                          {card.image && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={card.image} alt="" className="w-full h-full object-cover" />
                          )}
                        </span>
                        {card.label}
                      </Link>
                    );
                  })}
                </div>
              </div>
            )}

            {after.map(link => (
              <MenuLink key={link.href} {...link} active={isActive(link.href)} onClose={onClose} />
            ))}
          </nav>

          {info.showLeads && (
            <div className="mt-2 md:mt-6 flex gap-2.5">
              <button
                type="button"
                onClick={() => onContact()}
                className="flex-1 h-[52px] md:h-[46px] flex items-center justify-center gap-2 rounded-xl md:rounded-[10px] bg-[var(--theme-accent)] hover:opacity-85 text-[var(--theme-text-on-accent)] text-base md:text-sm font-semibold transition-opacity"
              >
                <span className="md:hidden">Contactar · Agendar visita</span>
                <span className="hidden md:inline">Contactar</span>
              </button>
              <button
                type="button"
                onClick={() => onContact('Hola, quiero agendar una visita.')}
                className="hidden md:flex flex-1 h-[46px] items-center justify-center rounded-[10px] border border-[var(--theme-text-on-dark)]/20 text-sm font-medium hover:bg-[var(--theme-text-on-dark)]/5 transition-colors"
              >
                Agendar visita
              </button>
            </div>
          )}
        </div>
      </div>
    </div>,
    portalTarget,
  );
}

// Sección actual: punto + acento + seminegrita, en mobile y tablet.
function ActiveLabel({ active, className = '', children }: { active: boolean; className?: string; children: React.ReactNode }) {
  return (
    <span className={`flex items-center gap-2 text-xl md:text-[21px] ${active ? 'font-semibold text-[var(--theme-accent)]' : 'md:font-light'} ${className}`}>
      {active && <span aria-hidden="true" className="w-1.5 h-1.5 rounded-full bg-[var(--theme-accent)]" />}
      {children}
    </span>
  );
}

function MenuLink({ href, label, detail, active, onClose, first = false }: {
  href: string;
  label: string;
  detail?: string;
  active: boolean;
  onClose: () => void;
  first?: boolean;
}) {
  return (
    <Link
      href={href}
      onClick={onClose}
      aria-current={active ? 'page' : undefined}
      className={`flex items-center justify-between md:justify-start gap-2.5 py-2.5 md:py-1.5 transition-opacity hover:opacity-75 ${
        first ? '' : 'border-t border-[var(--theme-text-on-dark)]/[.08] md:border-0'
      }`}
    >
      <ActiveLabel active={active}>{label}</ActiveLabel>
      {detail && <span className="text-xs text-[var(--theme-text-on-dark-muted)]">{detail}</span>}
    </Link>
  );
}

function CloseButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[var(--theme-text-on-dark)] text-[var(--theme-bg-alt)] text-sm font-semibold hover:opacity-90 transition-opacity"
    >
      <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true">
        <path d="M6 6l12 12M18 6 6 18" />
      </svg>
      Cerrar
    </button>
  );
}
