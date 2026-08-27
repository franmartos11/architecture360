'use client';

import { useRef } from 'react';
import Image from 'next/image';
import { m as motion } from 'framer-motion';
import type { Amenity } from '@/types';
import { shimmerDataUrl } from '@/lib/imagePlaceholder';
import { TransitionLink as Link } from '@/components/ui/TransitionUtils';
import { useProjectBasePath } from '@/lib/project-base-path-context';
import EyeIcon from '@/components/ui/icons/EyeIcon';

type AmenityViewMode = 'fotos' | '360';

export default function AmenitiesTab({
  amenities,
  activeAmenity,
  onSelectAmenity,
  imageIndex,
  onImageIndexChange,
  viewMode,
  onViewModeChange,
  listOpen,
  onListOpenChange,
  onOpenLightbox,
}: {
  amenities: Amenity[];
  activeAmenity: Amenity | null;
  onSelectAmenity: (amenity: Amenity) => void;
  imageIndex: number;
  onImageIndexChange: (index: number) => void;
  viewMode: AmenityViewMode;
  onViewModeChange: (mode: AmenityViewMode) => void;
  listOpen: boolean;
  onListOpenChange: (open: boolean) => void;
  onOpenLightbox: () => void;
}) {
  const basePath = useProjectBasePath();
  const thumbsRef = useRef<HTMLDivElement>(null);
  const detailRef = useRef<HTMLDivElement>(null);

  const scrollThumbs = (dir: 'left' | 'right') => {
    thumbsRef.current?.scrollBy({ left: dir === 'right' ? 220 : -220, behavior: 'smooth' });
  };

  const handleSelect = (a: Amenity) => {
    onSelectAmenity(a);
    detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <motion.div
      key="amenities"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      className="absolute inset-0 pt-16 flex flex-col lg:flex-row bg-white overflow-y-auto lg:overflow-hidden no-scrollbar"
    >
      {/* ── Left Sidebar: Amenities Grid ── */}
      <div
        className={`flex-shrink-0 flex flex-col order-2 lg:order-1 bg-white border-r border-gray-100 z-10 relative overflow-hidden shadow-[4px_0_24px_rgba(0,0,0,0.02)] transition-all duration-300 ${
          listOpen ? 'w-full lg:w-[420px] lg:h-auto' : 'w-full lg:w-0 h-0 lg:h-auto border-none'
        }`}
      >
        <div className="p-6 border-b border-gray-100 bg-white shrink-0 relative z-20 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-2xl font-bold text-gray-900 mb-1 tracking-tight">Amenities</h2>
            <p className="text-sm text-gray-500">Espacios del proyecto y de esta torre</p>
          </div>
          <button
            onClick={() => onListOpenChange(false)}
            aria-label="Ocultar lista de amenities"
            title="Ocultar lista"
            className="flex w-9 h-9 rounded-full bg-gray-100 hover:bg-gray-200 items-center justify-center text-gray-500 transition-colors shrink-0"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
            </svg>
          </button>
        </div>

        <div className="lg:flex-1 lg:overflow-y-auto p-4 bg-gray-50/50">
          {amenities.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">Todavía no hay amenities cargadas.</p>
          ) : (
            <div className="flex flex-col gap-3 pb-8">
              {amenities.map(a => {
                const isSelected = activeAmenity?.id === a.id;
                return (
                  <button
                    key={a.id}
                    onClick={() => handleSelect(a)}
                    aria-current={isSelected ? 'true' : undefined}
                    className={`group flex items-center gap-3 text-left rounded-xl overflow-hidden border transition-all shadow-sm p-2 ${
                      isSelected
                        ? 'border-brand-500 ring-1 ring-brand-500 bg-brand-50'
                        : 'border-gray-200 bg-white hover:border-brand-300 hover:shadow-md'
                    }`}
                  >
                    <div className="relative w-28 aspect-[4/3] shrink-0 rounded-lg overflow-hidden bg-gray-100">
                      {a.images[0] ? (
                        <Image src={a.images[0]} alt={a.name} fill sizes="160px" placeholder="blur" blurDataURL={shimmerDataUrl()} className="object-cover transition-transform duration-300 group-hover:scale-105" />
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center text-gray-300 text-[11px]">Sin foto</div>
                      )}
                      {a.tourNodeId && (
                        <span className="absolute bottom-1.5 right-1.5 flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-black/60 text-white shadow-sm backdrop-blur-sm z-10">
                          <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12z" /></svg>
                          360°
                        </span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className={`text-sm font-semibold truncate ${isSelected ? 'text-brand-700' : 'text-gray-900'}`}>
                        {a.name}
                      </p>
                      {a.description && <p className="text-xs text-gray-400 truncate mt-0.5">{a.description}</p>}
                    </div>
                    {isSelected && (
                      <svg className="w-5 h-5 text-brand-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                      </svg>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Right Side: Detail ── */}
      <div className="flex-1 relative order-1 lg:order-2 bg-white z-0 lg:h-auto lg:overflow-y-auto">
        {!listOpen && (
          <button
            onClick={() => onListOpenChange(true)}
            aria-label="Mostrar lista de amenities"
            title="Mostrar lista"
            className="flex absolute top-4 left-4 z-30 items-center gap-2 pl-2.5 pr-4 py-2 rounded-full bg-white/95 hover:bg-white shadow-lg border border-gray-200 text-sm font-semibold text-gray-700 backdrop-blur-md transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 5l7 7-7 7M5 5l7 7-7 7" />
            </svg>
            Amenities
          </button>
        )}
        {activeAmenity ? (
          <div ref={detailRef} className="min-h-full flex flex-col bg-white">
            <div className="relative w-full aspect-video lg:aspect-[21/9] bg-gray-900 flex-shrink-0">
              {viewMode === '360' && activeAmenity.tourNodeId ? (
                <iframe
                  key={activeAmenity.tourNodeId}
                  src={activeAmenity.buildingId
                    ? `${basePath}/edificio/${activeAmenity.buildingId}/recorrido?focus=${activeAmenity.tourNodeId}&embed=true`
                    : `${basePath}/recorrido?focus=${activeAmenity.tourNodeId}&embed=true`
                  }
                  className="absolute inset-0 w-full h-full border-0"
                  allowFullScreen
                  loading="lazy"
                />
              ) : activeAmenity.images.length > 0 ? (
                <>
                  <div
                    className="absolute inset-0 cursor-zoom-in"
                    onClick={onOpenLightbox}
                  >
                    <Image
                      src={activeAmenity.images[imageIndex]}
                      alt={`${activeAmenity.name} ${imageIndex + 1}`}
                      fill sizes="(max-width: 1024px) 100vw, 1200px"
                      placeholder="blur" blurDataURL={shimmerDataUrl()}
                      className="object-cover"
                    />
                  </div>
                  {/* Expand hint */}
                  <div className="absolute top-4 right-4 bg-black/40 backdrop-blur-md rounded-full w-9 h-9 flex items-center justify-center border border-white/20 pointer-events-none">
                    <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
                    </svg>
                  </div>
                  {activeAmenity.images.length > 1 && (
                    <>
                      <button onClick={() => onImageIndexChange((imageIndex - 1 + activeAmenity.images.length) % activeAmenity.images.length)} aria-label="Anterior" className="absolute left-4 lg:left-8 top-1/2 -translate-y-1/2 w-10 h-10 lg:w-12 lg:h-12 rounded-full bg-black/20 hover:bg-black/40 border border-white/20 backdrop-blur-md flex items-center justify-center text-white transition-all shadow-xl">
                        <svg className="w-5 h-5 lg:w-6 lg:h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
                      </button>
                      <button onClick={() => onImageIndexChange((imageIndex + 1) % activeAmenity.images.length)} aria-label="Siguiente" className="absolute right-4 lg:right-8 top-1/2 -translate-y-1/2 w-10 h-10 lg:w-12 lg:h-12 rounded-full bg-black/20 hover:bg-black/40 border border-white/20 backdrop-blur-md flex items-center justify-center text-white transition-all shadow-xl">
                        <svg className="w-5 h-5 lg:w-6 lg:h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
                      </button>
                    </>
                  )}
                </>
              ) : (
                <div className="absolute inset-0 flex items-center justify-center text-gray-500 text-sm">Sin renders todavía</div>
              )}
              {viewMode === 'fotos' && (
                <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/60 to-transparent pointer-events-none" />
              )}
            </div>

            {/* ── Thumbnails carousel (igual que en la Galería) ── */}
            {viewMode === 'fotos' && activeAmenity.images.length > 1 && (
              <div className="relative flex-shrink-0 bg-white/95 backdrop-blur-md border-b border-gray-100">
                <button
                  onClick={() => scrollThumbs('left')}
                  className="absolute left-0 top-0 bottom-0 z-10 px-3 flex items-center justify-center bg-gradient-to-r from-white via-white/90 to-transparent hover:from-gray-50 transition-colors"
                  aria-label="Desplazar izquierda"
                >
                  <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
                  </svg>
                </button>
                <div
                  ref={thumbsRef}
                  className="flex items-center gap-2 px-10 py-3 overflow-x-auto scroll-smooth"
                  style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
                >
                  {activeAmenity.images.map((img, i) => (
                    <button
                      key={i}
                      onClick={() => onImageIndexChange(i)}
                      aria-label={`Ver foto ${i + 1} de ${activeAmenity.name}`}
                      aria-current={i === imageIndex ? 'true' : undefined}
                      className={`relative flex-shrink-0 rounded-lg overflow-hidden transition-all duration-200 ${
                        i === imageIndex
                          ? 'ring-2 ring-gray-900 w-24 h-16 opacity-100 shadow-md'
                          : 'w-20 h-14 opacity-55 hover:opacity-90 hover:scale-105'
                      }`}
                    >
                      <Image src={img} alt={`Thumbnail ${i + 1}`} fill sizes="100px" className="object-cover" />
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => scrollThumbs('right')}
                  className="absolute right-0 top-0 bottom-0 z-10 px-3 flex items-center justify-center bg-gradient-to-l from-white via-white/90 to-transparent hover:from-gray-50 transition-colors"
                  aria-label="Desplazar derecha"
                >
                  <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                  </svg>
                </button>
              </div>
            )}

            <div className="p-6 lg:p-12 max-w-4xl w-full flex-1">
              {activeAmenity.tourNodeId && (
                <div className="inline-flex bg-gray-100 rounded-xl p-1 mb-6 gap-1">
                  <button
                    onClick={() => onViewModeChange('fotos')}
                    aria-current={viewMode === 'fotos' ? 'true' : undefined}
                    className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                      viewMode === 'fotos' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
                    </svg>
                    Fotos
                  </button>
                  <button
                    onClick={() => onViewModeChange('360')}
                    aria-current={viewMode === '360' ? 'true' : undefined}
                    className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                      viewMode === '360' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12zm14.024-.983a1.125 1.125 0 010 1.966l-5.603 3.113A1.125 1.125 0 019 15.113V8.887c0-.857.921-1.4 1.671-.983l5.603 3.113z" />
                    </svg>
                    Recorrido 360°
                  </button>
                </div>
              )}

              <h2 className="text-3xl lg:text-4xl font-bold text-gray-900 mb-4 tracking-tight">{activeAmenity.name}</h2>
              {activeAmenity.description && <p className="text-base lg:text-lg text-gray-600 leading-relaxed mb-8">{activeAmenity.description}</p>}

              {activeAmenity.tourNodeId && (
                <Link
                  href={activeAmenity.buildingId
                    ? `${basePath}/edificio/${activeAmenity.buildingId}/recorrido?focus=${activeAmenity.tourNodeId}`
                    : `${basePath}/recorrido?focus=${activeAmenity.tourNodeId}`
                  }
                  className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl bg-gray-900 hover:bg-gray-800 text-white text-[15px] font-semibold transition-all shadow-lg hover:shadow-xl hover:-translate-y-0.5"
                >
                  <EyeIcon className="w-5 h-5" strokeWidth={2} />
                  Ver en pantalla completa
                </Link>
              )}
            </div>
          </div>
        ) : (
          <div className="min-h-[40vh] lg:absolute lg:inset-0 flex items-center justify-center text-gray-400 bg-gray-50">
            <div className="text-center">
              <svg className="w-8 h-8 mx-auto mb-3 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" /></svg>
              <p className="text-sm font-medium">Seleccioná un amenity para ver los detalles</p>
            </div>
          </div>
        )}
        {/* Gradient shadow for depth */}
        <div className="absolute inset-y-0 left-0 w-4 bg-gradient-to-r from-black/[0.03] to-transparent pointer-events-none hidden lg:block" />
      </div>
    </motion.div>
  );
}
