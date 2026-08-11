'use client';

import { useState } from 'react';
import { TransitionLink as Link } from '@/components/ui/TransitionUtils';
import { usePathname } from 'next/navigation';
import { DEFAULT_PROJECT_SLUG } from '@/lib/constants';

export default function Navbar() {
  const pathname = usePathname();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const projectHref = `/proyecto/${DEFAULT_PROJECT_SLUG}`;
  const tourHref = `${projectHref}/recorrido`;
  const amenitiesHref = `${projectHref}/amenities`;

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 glass">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-3 group">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center text-white font-bold text-sm transition-transform group-hover:scale-110">
              360
            </div>
            <span className="text-lg font-semibold tracking-tight text-white/90">
              InteractiveRE
            </span>
          </Link>

          {/* Navigation Links - Desktop */}
          <div className="hidden md:flex items-center gap-1">
            <NavLink href="/" active={pathname === '/'}>
              Inicio
            </NavLink>
            <NavLink href={projectHref} active={pathname === projectHref}>
              Masterplan
            </NavLink>
            <NavLink href={tourHref} active={pathname === tourHref}>
              Recorrido
            </NavLink>
            <NavLink href={amenitiesHref} active={pathname === amenitiesHref}>
              Amenities
            </NavLink>
          </div>

          {/* CTA & Mobile Menu Toggle */}
          <div className="flex items-center gap-2">
            <Link
              href={projectHref}
              className="hidden sm:inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-600 hover:bg-brand-500 text-white text-sm font-medium transition-all duration-200 hover:shadow-lg hover:shadow-brand-600/25"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
              </svg>
              Explorar Proyecto
            </Link>

            {/* Mobile menu button */}
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="md:hidden p-2 text-white/80 hover:text-white rounded-lg bg-white/5 hover:bg-white/10 transition-colors"
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
        <div className="md:hidden px-4 pt-2 pb-4 space-y-1 bg-surface-50/95 border-t border-white/10 backdrop-blur-md">
          <MobileNavLink href="/" active={pathname === '/'} onClick={() => setIsMobileMenuOpen(false)}>
            Inicio
          </MobileNavLink>
          <MobileNavLink href={projectHref} active={pathname === projectHref} onClick={() => setIsMobileMenuOpen(false)}>
            Masterplan
          </MobileNavLink>
          <MobileNavLink href={tourHref} active={pathname === tourHref} onClick={() => setIsMobileMenuOpen(false)}>
            Recorrido
          </MobileNavLink>
          <MobileNavLink href={amenitiesHref} active={pathname === amenitiesHref} onClick={() => setIsMobileMenuOpen(false)}>
            Amenities
          </MobileNavLink>
          <Link
            href={projectHref}
            onClick={() => setIsMobileMenuOpen(false)}
            className="sm:hidden flex items-center justify-center gap-2 mt-4 px-4 py-3 w-full rounded-lg bg-brand-600 hover:bg-brand-500 text-white text-sm font-medium transition-colors"
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
      className={`px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
        active
          ? 'text-white bg-white/10'
          : 'text-white/60 hover:text-white hover:bg-white/5'
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
          ? 'text-white bg-white/10'
          : 'text-white/70 hover:text-white hover:bg-white/5'
      }`}
    >
      {children}
    </Link>
  );
}
