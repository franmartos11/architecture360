'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import type { UnitView } from '@/lib/floor-views';

// Pestaña "Vista": lo que se ve desde el piso de la unidad (fotos por
// orientación y/o panorámica 360°). Arranca por la orientación de la unidad.
// Spec: docs/superpowers/specs/2026-11-24-vista-por-piso-design.md

const VirtualTour = dynamic(() => import('@/components/tour/VirtualTour'), { ssr: false });

export default function VistaTab({ view }: { view: UnitView }) {
  const hasPhotos = view.photos.length > 0;
  const [index, setIndex] = useState(view.initialIndex);
  const [mode, setMode] = useState<'fotos' | '360'>(hasPhotos ? 'fotos' : '360');
  const current = view.photos[index] ?? view.photos[0];
  const showToggle = hasPhotos && !!view.panorama;

  const pill = (active: boolean) =>
    `min-h-[36px] px-3.5 rounded-full text-[13px] font-semibold transition-colors ${active ? 'bg-white text-gray-900' : 'bg-black/45 text-white hover:bg-black/60'}`;

  const where = `${view.approximate ? 'Vista aproximada' : 'Vista'} ${mode === '360' ? '360°' : current ? `al ${current.label}` : ''} desde ${view.floorLabel}`.replace(/\s+/g, ' ');

  return (
    <div className="absolute inset-0 flex flex-col bg-gray-900">
      <div className="relative flex-1 overflow-hidden">
        {mode === '360' && view.panorama ? (
          <VirtualTour imageUrl={view.panorama} />
        ) : current ? (
          // eslint-disable-next-line @next/next/no-img-element -- mismas imágenes que la galería, que también usa <img>
          <img
            key={current.url}
            src={current.url}
            alt={`Vista hacia el ${current.label} desde ${view.floorLabel}`}
            className="absolute inset-0 w-full h-full object-cover"
          />
        ) : null}

        {/* Abajo y no arriba: en escritorio la barra superior del visor (migas, "Cambiar planta") tapa esa franja. */}
        <div className="absolute bottom-3 left-3 right-3 md:right-20 z-10 flex flex-col gap-2 pointer-events-none">
          {mode === 'fotos' && view.photos.length > 1 && (
            <div className="pointer-events-auto flex flex-wrap justify-center gap-1.5">
              {view.photos.map((p, i) => (
                <button key={p.direction} type="button" aria-label={p.label} aria-pressed={i === index} onClick={() => setIndex(i)} className={pill(i === index)}>
                  <span className="sm:hidden">{p.direction}</span>
                  <span className="hidden sm:inline">{p.label}</span>
                </button>
              ))}
            </div>
          )}
          <div className="flex items-end justify-between gap-2">
            <span className="pointer-events-auto rounded-full bg-black/55 backdrop-blur-md px-3 py-1.5 text-[13px] font-semibold text-white">
              {where}
            </span>
            {showToggle && (
              <div className="pointer-events-auto flex gap-1.5">
                <button type="button" aria-pressed={mode === 'fotos'} onClick={() => setMode('fotos')} className={pill(mode === 'fotos')}>Fotos</button>
                <button type="button" aria-pressed={mode === '360'} onClick={() => setMode('360')} className={pill(mode === '360')}>360°</button>
              </div>
            )}
          </div>
        </div>
      </div>
      <p className="m-0 px-4 py-2.5 text-[12px] text-white/75 bg-gray-900">
        Imagen tomada a la altura del piso. La vista real puede variar.
      </p>
    </div>
  );
}
