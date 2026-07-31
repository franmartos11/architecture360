'use client';

import { useState, useEffect } from 'react';
import { TransitionLink as Link } from '@/components/ui/TransitionUtils';
import { usePathname } from 'next/navigation';

export default function Navbar() {
  const pathname = usePathname();

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

          {/* Navigation Links */}
          <div className="flex items-center gap-1">
            <NavLink href="/" active={pathname === '/'}>
              Inicio
            </NavLink>
            <NavLink href="/proyecto/demo" active={pathname.startsWith('/proyecto')}>
              Masterplan
            </NavLink>
          </div>

          {/* CTA */}
          <Link
            href="/proyecto/demo"
            className="hidden sm:inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-600 hover:bg-brand-500 text-white text-sm font-medium transition-all duration-200 hover:shadow-lg hover:shadow-brand-600/25"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
            </svg>
            Explorar Proyecto
          </Link>
        </div>
      </div>
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
