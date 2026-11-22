'use client';

import { useEffect } from 'react';
import { formatUpdateDate, stageLabelOf } from '@/lib/construction-progress';
import { updateAnchorId, updateIdFromHash } from '@/lib/construction-progress-view';
import type { ConstructionProgress, ConstructionUpdate } from '@/types';
import UpdateCover from './UpdateCover';

/**
 * Carrusel (mobile y sin movimiento): para deslizar, la más nueva primero.
 * Acá entran todas — deslizar 30 tarjetas no cuesta lo que scrollear 21
 * pantallas. Cada tarjeta lleva el ancla `#avance-<id>` para compartir
 * una entrada puntual.
 */
export default function StoryCarousel({ progress, updates }: { progress: ConstructionProgress; updates: ConstructionUpdate[] }) {
  const items = [...updates].reverse();

  // El navegador busca el ancla antes de que la página termine de
  // hidratar y, dentro de un carrusel horizontal, no siempre la trae a la
  // vista. Se repite acá, solo si el carrusel se ve (en pantallas anchas
  // la posición la pone la historia con scroll).
  useEffect(() => {
    const id = updateIdFromHash(window.location.hash);
    const el = id ? document.getElementById(updateAnchorId(id)) : null;
    if (!el || el.offsetParent === null) return;
    const raf = requestAnimationFrame(() => el.scrollIntoView({ block: 'start', inline: 'start' }));
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <ol className="flex gap-3 overflow-x-auto snap-x snap-mandatory scroll-px-4 sm:scroll-px-6 -mx-4 px-4 sm:-mx-6 sm:px-6 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label="Actualizaciones de obra, la más nueva primero">
      {items.map((up, i) => {
        const stage = stageLabelOf(progress, up.stageId);
        return (
          <li key={up.id} id={updateAnchorId(up.id)} className="snap-start shrink-0 w-[82%] sm:w-[46%] flex flex-col gap-3 scroll-mt-24">
            <div className="relative aspect-[4/3] rounded-[var(--theme-radius)] overflow-hidden bg-[var(--theme-border)]">
              <UpdateCover update={up} sizes="(min-width: 640px) 46vw, 82vw" />
              {i === 0 && <span className="absolute top-3 left-3 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-white text-black">Lo último</span>}
              {up.images.length > 1 && <span className="absolute top-3 right-3 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-black/55 text-white">{up.images.length} fotos</span>}
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[13px] text-[var(--theme-text-muted)]">{formatUpdateDate(up.date)}{stage ? ` · ${stage}` : ''}</span>
              {up.title && <span className="text-[17px] font-semibold leading-snug">{up.title}</span>}
              {up.body && <span className="text-sm leading-relaxed text-[var(--theme-text-muted)] whitespace-pre-line">{up.body}</span>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
