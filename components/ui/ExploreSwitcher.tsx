'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { TransitionLink as Link } from '@/components/ui/TransitionUtils';
import { exploreCardsFor } from '@/components/ui/ProjectMenu';
import { useProjectBasePath } from '@/lib/project-base-path-context';
import type { ProjectNavInfo } from '@/lib/project-nav';

// Ítem "Explorar 3D ▾" de la barra completa (≥1200px): despliega las vistas
// con miniatura y una línea que explica cada una. `current` es el label de
// la vista actual (ver projectSectionFor), o undefined fuera de Explorar 3D.
export default function ExploreSwitcher({ info, current }: { info: ProjectNavInfo; current?: string }) {
  const basePath = useProjectBasePath();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const cards = exploreCardsFor(info, basePath);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', onPointer);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // Con un solo destino no hay nada que desplegar: link directo.
  if (cards.length < 2) {
    return cards[0] ? (
      <Link href={cards[0].href} className={`px-3.5 py-2.5 rounded-lg text-[15px] font-medium whitespace-nowrap transition-colors ${navItemClass(!!current)}`}>
        Explorar 3D
      </Link>
    ) : null;
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        aria-haspopup="true"
        aria-label={current ? `Explorar 3D: ${current}. Cambiar de vista` : 'Explorar 3D: elegir vista'}
        className={`flex items-center gap-1.5 pl-3.5 pr-3 py-2.5 rounded-lg text-[15px] whitespace-nowrap transition-colors ${
          open ? 'bg-white text-gray-900 font-semibold' : `font-medium ${navItemClass(!!current)}`
        }`}
      >
        Explorar 3D
        <svg className={`w-[15px] h-[15px] shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-2 z-[55] w-[380px] p-2 rounded-2xl bg-[#1A1B1A] border border-white/[.12] shadow-[0_24px_60px_rgba(0,0,0,0.5)] flex flex-col gap-0.5">
          {cards.map(card => {
            const active = card.label === current;
            return (
              <Link
                key={card.href}
                href={card.href}
                onClick={() => setOpen(false)}
                aria-current={active ? 'page' : undefined}
                aria-label={card.detail ? `${card.label} — ${card.detail}` : card.label}
                className={`group flex items-center gap-3.5 p-2.5 rounded-xl text-white transition-colors ${active ? 'bg-white/[.07]' : 'hover:bg-white/[.05]'}`}
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
        </div>
      )}
    </div>
  );
}

// Ítem de la barra completa — el activo con fondo, el resto atenuado.
// Exportado para que Navbar pinte sus links igual.
export function navItemClass(active: boolean) {
  return active
    ? 'bg-[var(--theme-text-on-dark)]/15 text-[var(--theme-text-on-dark)]'
    : 'text-[var(--theme-text-on-dark)]/85 hover:text-[var(--theme-text-on-dark)] hover:bg-[var(--theme-text-on-dark)]/5';
}
