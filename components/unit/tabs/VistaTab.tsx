'use client';

import { etiquetaPiso } from '@/lib/i18n/catalogo';
import { useState } from 'react';
import dynamic from 'next/dynamic';
import { directionCode, directionLabel, type UnitView } from '@/lib/floor-views';
import { useLocale, useT } from '@/lib/i18n/client';

// Pestaña "Vista": lo que se ve desde el piso de la unidad (fotos por
// orientación y/o panorámica 360°). Arranca por la orientación de la unidad.
// Spec: docs/superpowers/specs/2026-11-24-vista-por-piso-design.md

const VirtualTour = dynamic(() => import('@/components/tour/VirtualTour'), { ssr: false });

export default function VistaTab({ view }: { view: UnitView }) {
  const t = useT();
  const { locale } = useLocale();
  const hasPhotos = view.photos.length > 0;
  const [index, setIndex] = useState(view.initialIndex);
  const [mode, setMode] = useState<'fotos' | '360'>(hasPhotos ? 'fotos' : '360');
  const current = view.photos[index] ?? view.photos[0];
  const showToggle = hasPhotos && !!view.panorama;

  const pill = (active: boolean) =>
    `min-h-[36px] px-3.5 rounded-full text-[13px] font-semibold transition-colors ${active ? 'bg-white text-gray-900' : 'bg-black/45 text-white hover:bg-black/60'}`;

  // El nombre de la orientación sale del código (el `label` de lib/floor-views viene en castellano).
  const nombre = (p: UnitView['photos'][number]) => directionLabel(p.direction, locale);
  const piso = etiquetaPiso(view.floorLabel, locale);
  const en360 = mode === '360';
  const enFotos = mode === 'fotos';
  const where = en360
    ? t(view.approximate ? 'unidad.vista.360Aprox' : 'unidad.vista.360', { piso })
    : current
      ? t(view.approximate ? 'unidad.vista.haciaAprox' : 'unidad.vista.hacia', { direccion: nombre(current), piso })
      : t(view.approximate ? 'unidad.vista.desdeAprox' : 'unidad.vista.desde', { piso });

  return (
    <div className="absolute inset-0 flex flex-col bg-gray-900">
      <div className="relative flex-1 overflow-hidden">
        {en360 && view.panorama ? (
          <VirtualTour imageUrl={view.panorama} />
        ) : current ? (
          // eslint-disable-next-line @next/next/no-img-element -- mismas imágenes que la galería, que también usa <img>
          <img
            key={current.url}
            src={current.url}
            alt={t('unidad.vista.alt', { direccion: nombre(current), piso })}
            className="absolute inset-0 w-full h-full object-cover"
          />
        ) : null}

        {/* Abajo y no arriba: en escritorio la barra superior del visor (migas, "Cambiar planta") tapa esa franja. */}
        <div className="absolute bottom-3 left-3 right-3 md:right-20 z-10 flex flex-col gap-2 pointer-events-none">
          {enFotos && view.photos.length > 1 && (
            <div className="pointer-events-auto flex flex-wrap justify-center gap-1.5">
              {view.photos.map((p, i) => (
                <button key={p.direction} type="button" aria-label={nombre(p)} aria-pressed={i === index} onClick={() => setIndex(i)} className={pill(i === index)}>
                  <span className="sm:hidden">{directionCode(p.direction, locale)}</span>
                  <span className="hidden sm:inline">{nombre(p)}</span>
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
                <button type="button" aria-pressed={enFotos} onClick={() => setMode('fotos')} className={pill(enFotos)}>{t('unidad.media.fotos')}</button>
                <button type="button" aria-pressed={en360} onClick={() => setMode('360')} className={pill(en360)}>360°</button>
              </div>
            )}
          </div>
        </div>
      </div>
      <p className="m-0 px-4 py-2.5 text-[12px] text-white/75 bg-gray-900">
        {t('unidad.vista.aviso')}
      </p>
    </div>
  );
}
