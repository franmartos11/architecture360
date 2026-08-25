'use client';

import { useState } from 'react';
import { TransitionLink as Link } from '@/components/ui/TransitionUtils';
import { Menu, X } from 'lucide-react';

const ANCHOR_LINKS = [
  { href: '#producto', label: 'Producto' },
  { href: '#portfolio', label: 'Portfolio' },
  { href: '#comunidad', label: 'Comunidad' },
  { href: '#como-funciona', label: 'Cómo funciona' },
];

export default function LandingNav() {
  const [open, setOpen] = useState(false);

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-stone-950/80 backdrop-blur-xl border-b border-white/10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <Link href="/" className="flex items-center gap-2.5 shrink-0">
            <div className="w-8 h-8 rounded-lg bg-brand-400 flex items-center justify-center text-brand-900 font-bold text-sm">
              A
            </div>
            <span className="font-display font-bold tracking-tight text-white">Atrium</span>
          </Link>

          <nav className="hidden md:flex items-center gap-8">
            {ANCHOR_LINKS.map((link) => (
              <a key={link.href} href={link.href} className="text-sm text-white/60 hover:text-white transition-colors">
                {link.label}
              </a>
            ))}
          </nav>

          <div className="hidden md:flex items-center gap-3">
            <Link href="/admin/login" className="text-sm text-white/70 hover:text-white transition-colors px-3 py-2">
              Ingresar
            </Link>
            <Link href="/admin/signup" className="px-4 py-2 rounded-lg bg-white text-stone-900 text-sm font-medium hover:bg-white/90 transition-colors">
              Registrarme
            </Link>
          </div>

          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? 'Cerrar menú' : 'Abrir menú'}
            aria-expanded={open}
            className="md:hidden p-2 text-white/80 hover:text-white"
          >
            {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {open && (
        <div className="md:hidden border-t border-white/10 bg-stone-950 px-4 py-4 flex flex-col gap-1">
          {ANCHOR_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              onClick={() => setOpen(false)}
              className="text-sm text-white/70 hover:text-white py-2.5"
            >
              {link.label}
            </a>
          ))}
          <div className="flex items-center gap-3 mt-3 pt-3 border-t border-white/10">
            <Link href="/admin/login" className="flex-1 text-center text-sm text-white/70 border border-white/15 rounded-lg py-2.5">
              Ingresar
            </Link>
            <Link href="/admin/signup" className="flex-1 text-center text-sm font-medium bg-white text-stone-900 rounded-lg py-2.5">
              Registrarme
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
