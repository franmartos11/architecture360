'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import type { Unit } from '@/types';

const VirtualTour = dynamic(() => import('@/components/tour/VirtualTour'), { ssr: false });

export type CompareContentType = 'planta3d' | 'tour360' | 'plano' | 'galeria';

function EmptyPane({ text }: { text: string }) {
  return (
    <div className="w-full h-full flex items-center justify-center bg-gray-50 text-sm text-gray-400 px-6 text-center">
      {text}
    </div>
  );
}

function ImagePane({ url, emptyText, bare }: { url: string | undefined | null; emptyText: string; bare?: boolean }) {
  if (!url) return <EmptyPane text={emptyText} />;
  if (bare) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-white">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt="" className="max-w-full max-h-full object-contain" />
      </div>
    );
  }
  return (
    <div className="w-full h-full flex items-center justify-center bg-gray-100 p-4 sm:p-8 overflow-hidden">
      <div className="w-full h-full flex items-center justify-center bg-white rounded-xl shadow-md border border-gray-200 p-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt="" className="max-w-full max-h-full object-contain" />
      </div>
    </div>
  );
}

// Igual patrón que GaleriaTab.tsx (visor normal de una unidad): foto
// principal arriba + tira de miniaturas clickeables abajo, en vez de solo
// flechas — más chica porque acá el panel mide la mitad de la pantalla.
function GalleryPane({ images, bare }: { images: string[]; bare?: boolean }) {
  const [index, setIndex] = useState(0);
  if (images.length === 0) return <EmptyPane text="Esta unidad no tiene galería cargada." />;
  const safeIndex = Math.min(index, images.length - 1);

  return (
    <div className="relative w-full h-full flex flex-col bg-gray-100 overflow-hidden">
      <div className="relative flex-1 flex items-center justify-center overflow-hidden p-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={images[safeIndex]} alt="" className="max-w-full max-h-full object-contain" />
        {images.length > 1 && (
          <>
            <button
              onClick={() => setIndex(i => (i - 1 + images.length) % images.length)}
              aria-label="Foto anterior"
              className="absolute left-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/50 hover:bg-black/70 text-white flex items-center justify-center transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
              </svg>
            </button>
            <button
              onClick={() => setIndex(i => (i + 1) % images.length)}
              aria-label="Foto siguiente"
              className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/50 hover:bg-black/70 text-white flex items-center justify-center transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
              </svg>
            </button>
          </>
        )}
      </div>

      {bare && images.length > 1 && (
        <span className="absolute right-2.5 bottom-2.5 rounded-lg bg-gray-900/75 px-2 py-1 text-xs font-semibold text-white tabular-nums pointer-events-none">
          {safeIndex + 1} / {images.length}
        </span>
      )}

      {!bare && images.length > 1 && (
        <div className="flex-shrink-0 bg-white border-t border-gray-200 px-3 py-3">
          <div className="flex items-center gap-2 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
            {images.map((img, i) => (
              <button
                key={i}
                onClick={() => setIndex(i)}
                aria-label={`Ver foto ${i + 1} de ${images.length}`}
                aria-current={i === safeIndex ? 'true' : undefined}
                className={`relative flex-shrink-0 w-24 h-16 rounded-lg overflow-hidden transition-opacity duration-150 ${
                  i === safeIndex ? 'ring-2 ring-inset ring-gray-900 opacity-100' : 'opacity-50 hover:opacity-80'
                }`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={img} alt="" className="w-full h-full object-cover" />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Cada "aspecto" comparable renderiza su propio contenido liviano — no
// reutiliza los tabs completos del visor normal (Planta3DTab, PlanoTab,
// etc.) porque esos asumen un solo estado compartido a nivel UnitViewer;
// acá necesitamos dos instancias independientes, una por unidad.
// `bare`: para las tarjetas chicas del comparador mobile — sin marco ni
// tira de miniaturas.
export default function ComparePaneContent({ unit, contentType, bare = false }: { unit: Unit; contentType: CompareContentType; bare?: boolean }) {
  switch (contentType) {
    case 'tour360':
      return unit.tourImageUrl || unit.tourData
        ? <VirtualTour imageUrl={unit.tourImageUrl} tourData={unit.tourData} hideNodeNav />
        : <EmptyPane text="Esta unidad todavía no tiene recorrido 360° cargado." />;
    case 'planta3d':
      return <ImagePane url={unit.floorPlan3dUrl} emptyText="Esta unidad no tiene planta 3D cargada." bare={bare} />;
    case 'plano':
      return <ImagePane url={unit.technicalPlanUrl || unit.plan3dUrl} emptyText="Esta unidad no tiene plano técnico cargado." bare={bare} />;
    case 'galeria':
      return <GalleryPane key={unit.id} images={unit.galleryImages ?? []} bare={bare} />;
  }
}
