'use client';

import { useState } from 'react';
import { TransitionLink as Link } from '@/components/ui/TransitionUtils';
import { usePathname } from 'next/navigation';
import { useProjectBasePath } from '@/lib/project-base-path-context';

export default function Navbar({ showCalculator, hasTour, singleUnit, unitsLabel: unitsLabelProp }: {
  showCalculator: boolean;
  hasTour: boolean;
  /** Tipo "casa": una sola unidad — el link va directo a ella y se llama como la casa. */
  singleUnit?: { buildingId: string; unitId: string; label: string };
  /** Plural de unitLabel del tipo de proyecto (ej. "Lotes", "Unidades") — para el link cuando no hay singleUnit. */
  unitsLabel?: string;
}) {
  const pathname = usePathname();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const basePath = useProjectBasePath();
  // projectHref (con el fallback a "/") es solo para el link "Inicio" — el
  // resto de los links concatena sobre basePath crudo ('' en subdominio,
  // "/proyecto/slug" en el dominio raíz); anteponerle el fallback acá
  // duplicaba la barra ("" || "/" + "/masterplan" = "//masterplan").
  const projectHref = basePath || '/';
  const masterplanHref = `${basePath}/masterplan`;
  const tourHref = `${basePath}/recorrido`;
  const unitsHref = singleUnit
    ? `${basePath}/edificio/${singleUnit.buildingId}/unidad/${singleUnit.unitId}`
    : `${basePath}/unidades`;
  const unitsLabel = singleUnit?.label ?? unitsLabelProp ?? 'Unidades';
  const amenitiesHref = `${basePath}/amenities`;
  const locationHref = `${basePath}/ubicacion`;
  const calculatorHref = `${basePath}#cotizador`;

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-[var(--theme-bg-alt)]/70 backdrop-blur-xl border-b border-[var(--theme-border-on-dark)]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link href={projectHref} className="flex items-center gap-3 group">
            <div className="w-9 h-9 rounded-lg bg-[var(--theme-accent)] flex items-center justify-center text-[var(--theme-text-on-dark)] font-bold text-sm transition-transform group-hover:scale-110">
              360
            </div>
            <span className="font-[family-name:var(--theme-font-heading)] text-lg font-semibold tracking-tight text-[var(--theme-text-on-dark)]/90">
              InteractiveRE
            </span>
          </Link>

          {/* Navigation Links - Desktop */}
          <div className="hidden md:flex items-center gap-0.5 lg:gap-1">
            <NavLink href={projectHref} active={pathname === projectHref}>
              Inicio
            </NavLink>
            <NavLink href={masterplanHref} active={pathname === masterplanHref}>
              Masterplan
            </NavLink>
            {hasTour && (
              <NavLink href={tourHref} active={pathname === tourHref}>
                Recorrido
              </NavLink>
            )}
            <NavLink href={unitsHref} active={pathname === unitsHref}>
              {unitsLabel}
            </NavLink>
            <NavLink href={amenitiesHref} active={pathname === amenitiesHref}>
              Amenities
            </NavLink>
            <NavLink href={locationHref} active={pathname === locationHref}>
              Ubicación
            </NavLink>
          </div>

          {/* CTA & Mobile Menu Toggle */}
          <div className="flex items-center gap-2">
            <Link
              href={masterplanHref}
              aria-label="Explorar Proyecto"
              className="hidden sm:inline-flex items-center gap-2 px-2.5 md:px-3 lg:px-4 py-2 rounded-lg bg-[var(--theme-accent)] hover:opacity-85 text-[var(--theme-text-on-dark)] text-sm font-medium transition-all duration-200"
            >
              <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
              </svg>
              <span className="hidden lg:inline">Explorar Proyecto</span>
            </Link>

            {/* Mobile menu button */}
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="md:hidden p-2 text-[var(--theme-text-on-dark-muted)] hover:text-[var(--theme-text-on-dark)] rounded-lg bg-[var(--theme-text-on-dark)]/5 hover:bg-[var(--theme-text-on-dark)]/10 transition-colors"
              aria-label={isMobileMenuOpen ? 'Cerrar menú' : 'Abrir menú'}
              aria-expanded={isMobileMenuOpen}
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                {isMobileMenuOpen ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                )}
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Menu Dropdown */}
      {isMobileMenuOpen && (
        <div className="md:hidden px-4 pt-2 pb-4 space-y-1 bg-[var(--theme-bg-alt)]/95 border-t border-[var(--theme-border-on-dark)] backdrop-blur-md max-h-[calc(100vh-4rem)] overflow-y-auto">
          <MobileNavLink href={projectHref} active={pathname === projectHref} onClick={() => setIsMobileMenuOpen(false)}>
            Inicio
          </MobileNavLink>
          <MobileNavLink href={masterplanHref} active={pathname === masterplanHref} onClick={() => setIsMobileMenuOpen(false)}>
            Masterplan
          </MobileNavLink>
          {hasTour && (
            <MobileNavLink href={tourHref} active={pathname === tourHref} onClick={() => setIsMobileMenuOpen(false)}>
              Recorrido
            </MobileNavLink>
          )}
          <MobileNavLink href={unitsHref} active={pathname === unitsHref} onClick={() => setIsMobileMenuOpen(false)}>
            {unitsLabel}
          </MobileNavLink>
          <MobileNavLink href={amenitiesHref} active={pathname === amenitiesHref} onClick={() => setIsMobileMenuOpen(false)}>
            Amenities
          </MobileNavLink>
          <MobileNavLink href={locationHref} active={pathname === locationHref} onClick={() => setIsMobileMenuOpen(false)}>
            Ubicación
          </MobileNavLink>
          {showCalculator && (
            <MobileNavLink href={calculatorHref} active={false} onClick={() => setIsMobileMenuOpen(false)}>
              Cotizador
            </MobileNavLink>
          )}
          <Link
            href={masterplanHref}
            onClick={() => setIsMobileMenuOpen(false)}
            className="sm:hidden flex items-center justify-center gap-2 mt-4 px-4 py-3 w-full rounded-lg bg-[var(--theme-accent)] hover:opacity-85 text-[var(--theme-text-on-dark)] text-sm font-medium transition-colors"
          >
            Explorar Proyecto
          </Link>
        </div>
      )}
    </nav>
  );
}

function NavLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`px-2 lg:px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 whitespace-nowrap ${
        active
          ? 'text-[var(--theme-text-on-dark)] bg-[var(--theme-text-on-dark)]/10'
          : 'text-[var(--theme-text-on-dark-muted)] hover:text-[var(--theme-text-on-dark)] hover:bg-[var(--theme-text-on-dark)]/5'
      }`}
    >
      {children}
    </Link>
  );
}

function MobileNavLink({
  href,
  active,
  onClick,
  children,
}: {
  href: string;
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className={`block px-4 py-3 rounded-lg text-base font-medium transition-colors ${
        active
          ? 'text-[var(--theme-text-on-dark)] bg-[var(--theme-text-on-dark)]/10'
          : 'text-[var(--theme-text-on-dark-muted)] hover:text-[var(--theme-text-on-dark)] hover:bg-[var(--theme-text-on-dark)]/5'
      }`}
    >
      {children}
    </Link>
  );
}
