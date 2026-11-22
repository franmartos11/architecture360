'use client';

import { useState } from 'react';
import Image from 'next/image';
import { TransitionLink as Link } from '@/components/ui/TransitionUtils';
import Popover from '@/components/ui/Popover';
import { exploreCardsFor } from '@/components/ui/ProjectMenu';
import { useProjectBasePath } from '@/lib/project-base-path-context';
import type { ProjectNavInfo } from '@/lib/project-nav';

// Ítem "Explorar 3D ▾" de la barra completa (≥1200px): despliega las vistas
// con miniatura y una línea que explica cada una. `current` es el label de
// la vista actual (ver projectSectionFor), o undefined fuera de Explorar 3D.
export default function ExploreSwitcher({ info, current }: { info: ProjectNavInfo; current?: string }) {
  const basePath = useProjectBasePath();
  const [open, setOpen] = useState(false);
  const cards = exploreCardsFor(info, basePath);

  // Con un solo destino no hay nada que desplegar: link directo.
  if (cards.length < 2) {
    return cards[0] ? (
      <Link href={cards[0].href} className={navItemClass(!!current)}>
        Explorar 3D
      </Link>
    ) : null;
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={current ? `Explorar 3D: ${current}. Cambiar de vista` : 'Explorar 3D: elegir vista'}
        // Abierto se ve como activo (raya fija) — el resaltado lo lleva el panel.
        className={`flex items-center gap-1.5 ${navItemClass(!!current || open)}`}
      >
        Explorar 3D
        <svg className={`w-[15px] h-[15px] shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {/* Vidrio líquido (onda Apple): tinte oscuro translúcido para que se lea
          sobre fondos claros y oscuros, desenfoque con saturación, borde y
          brillo especular arriba. Sin backdrop-filter (navegadores viejos)
          queda el tinte casi opaco del fallback. Los "!" pisan lo del Popover (fondo blanco, padding, radio, z, margen)
          y la animación CSS propia de lg-glass, que si no se pelearía con la
          de framer-motion: la entrada/salida la maneja el Popover. */}
      <Popover
        open={open}
        onClose={() => setOpen(false)}
        role="menu"
        align="start"
        ariaLabel="Explorar 3D"
        className="lg-glass !animate-none !mt-3 !z-[55] w-[380px] !p-2 !rounded-[26px] flex flex-col gap-0.5 !text-white"
      >
          {cards.map(card => {
            const active = card.label === current;
            return (
              <Link
                key={card.href}
                href={card.href}
                role="menuitem"
                onClick={() => setOpen(false)}
                aria-current={active ? 'page' : undefined}
                aria-label={card.detail ? `${card.label} — ${card.detail}` : card.label}
                className={`group flex items-center gap-3.5 p-2.5 rounded-[18px] text-white transition-colors ${active ? 'bg-white/[.14]' : 'hover:bg-white/[.09]'}`}
              >
                <span className="relative w-[72px] h-[50px] shrink-0 overflow-hidden rounded-lg bg-white/10">
                  {card.image && <Image src={card.image} alt="" fill sizes="72px" className="object-cover" />}
                </span>
                <span className="flex-1 min-w-0 flex flex-col gap-0.5">
                  <span className="text-[15px] font-semibold truncate">{card.label}</span>
                  {card.detail && <span className="text-[13px] text-white/60 truncate">{card.detail}</span>}
                </span>
                <svg className={`w-4 h-4 shrink-0 text-white/60 transition-opacity ${active ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="m9 6 6 6-6 6" />
                </svg>
              </Link>
            );
          })}
      </Popover>
    </div>
  );
}

// Ítem de la barra completa, estilo aspasoftware.com: solo texto, atenuado,
// con una raya fina que se dibuja de izquierda a derecha al pasar el mouse
// y queda fija en la sección activa. Exportado para que Navbar pinte sus
// links igual. El color sale de --nav-fg (lo define Navbar según el fondo).
// (Clases escritas completas: Tailwind no ve las que se arman con variables.)
export function navItemClass(active: boolean) {
  return [
    'relative px-3 py-2.5 rounded-lg text-[15px] font-medium whitespace-nowrap transition-colors duration-300',
    "after:content-[''] after:absolute after:left-3 after:right-3 after:bottom-1.5 after:h-px after:bg-current",
    'after:transition-transform after:duration-[600ms] after:ease-[cubic-bezier(.16,1,.3,1)]',
    active
      ? 'text-[var(--nav-fg,var(--theme-text-on-dark))] after:origin-left after:scale-x-100'
      : 'text-[var(--nav-fg,var(--theme-text-on-dark))]/75 hover:text-[var(--nav-fg,var(--theme-text-on-dark))] after:origin-right after:scale-x-0 hover:after:origin-left hover:after:scale-x-100',
  ].join(' ');
}
