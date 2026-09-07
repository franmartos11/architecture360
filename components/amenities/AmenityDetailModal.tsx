'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { m as motion, AnimatePresence } from 'framer-motion';
import { TransitionLink as Link } from '@/components/ui/TransitionUtils';
import { useProjectBasePath } from '@/lib/project-base-path-context';
import { shimmerDataUrl } from '@/lib/imagePlaceholder';
import EyeIcon from '@/components/ui/icons/EyeIcon';
import type { Amenity, Building } from '@/types';

interface AmenityDetailModalProps {
  amenity: Amenity | null;
  building: Building | undefined;
  onClose: () => void;
  /** Abre el modal de consulta con un mensaje que ya menciona esta amenity. */
  onRequestVisit: (amenityName: string) => void;
  /** Navegación entre amenities dentro de la lista actualmente filtrada — ausentes si hay una sola. */
  prevName?: string;
  nextName?: string;
  onPrev?: () => void;
  onNext?: () => void;
}

export default function AmenityDetailModal({ amenity, building, onClose, onRequestVisit, prevName, nextName, onPrev, onNext }: AmenityDetailModalProps) {
  const basePath = useProjectBasePath();
  const [index, setIndex] = useState(0);

  // Reset del índice del carrusel al cambiar de amenity — ajustado durante
  // el render comparando contra el id anterior, en vez de en un efecto.
  const [prevAmenityId, setPrevAmenityId] = useState(amenity?.id);
  if (amenity?.id !== prevAmenityId) {
    setPrevAmenityId(amenity?.id);
    setIndex(0);
  }

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (!amenity || amenity.images.length < 2) return;
      if (e.key === 'ArrowRight') setIndex(i => (i + 1) % amenity.images.length);
      if (e.key === 'ArrowLeft') setIndex(i => (i - 1 + amenity.images.length) % amenity.images.length);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [amenity, onClose]);

  const tourHref = amenity?.tourNodeId
    ? building
      ? `${basePath}/edificio/${building.id}/recorrido?focus=${amenity.tourNodeId}`
      : `${basePath}/recorrido?focus=${amenity.tourNodeId}`
    : null;

  return (
    <AnimatePresence>
      {amenity && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ duration: 0.25 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none"
          >
            <div
              className="glass rounded-2xl w-full max-w-2xl overflow-hidden pointer-events-auto"
              onClick={e => e.stopPropagation()}
            >
              {/* Carrusel de renders */}
              <div className="relative w-full aspect-[16/10] bg-black/40">
                {amenity.images.length > 0 ? (
                  <>
                    <AnimatePresence mode="wait">
                      <motion.div
                        key={index}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.4 }}
                        className="absolute inset-0"
                      >
                        <Image
                          src={amenity.images[index]}
                          alt={`${amenity.name} ${index + 1}`}
                          fill
                          sizes="(min-width: 672px) 672px, 100vw"
                          placeholder="blur"
                          blurDataURL={shimmerDataUrl()}
                          className="object-cover"
                        />
                      </motion.div>
                    </AnimatePresence>
                    {amenity.images.length > 1 && (
                      <>
                        <button
                          onClick={() => setIndex(i => (i - 1 + amenity.images.length) % amenity.images.length)}
                          aria-label="Imagen anterior"
                          className="absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/40 hover:bg-black/60 backdrop-blur flex items-center justify-center text-white transition-colors"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
                          </svg>
                        </button>
                        <button
                          onClick={() => setIndex(i => (i + 1) % amenity.images.length)}
                          aria-label="Imagen siguiente"
                          className="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/40 hover:bg-black/60 backdrop-blur flex items-center justify-center text-white transition-colors"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                          </svg>
                        </button>
                        <div className="absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-black/50 to-transparent pointer-events-none" />
                        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1">
                          {amenity.images.map((_, i) => (
                            <button
                              key={i}
                              onClick={() => setIndex(i)}
                              aria-label={`Ver foto ${i + 1}`}
                              className="p-2 flex items-center justify-center"
                            >
                              <span className={`block rounded-full transition-all duration-200 ${i === index ? 'w-5 h-1.5 bg-white' : 'w-1.5 h-1.5 bg-white/50 hover:bg-white/80'}`} />
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                  </>
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center text-white/30 text-sm">
                    Sin renders todavía
                  </div>
                )}
                <button
                  onClick={onClose}
                  aria-label="Cerrar"
                  className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/40 hover:bg-black/60 backdrop-blur flex items-center justify-center text-white transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Info */}
              <div className="p-[22px_26px_26px] grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-[26px]">
                <div className="flex flex-col gap-[12px]">
                  <div className="flex items-center gap-[9px] flex-wrap">
                    <h3 className="font-normal text-[24px] text-white">{amenity.name}</h3>
                    {amenity.category && (
                      <span className="h-[22px] px-[10px] flex items-center rounded-full bg-white/[.12] text-[10.5px] font-medium text-white/80">
                        {amenity.category}
                      </span>
                    )}
                    <span className="h-[22px] px-[10px] flex items-center rounded-full bg-white/[.12] text-[10.5px] font-medium text-white/80">
                      {building ? building.name : 'Todo el complejo'}
                    </span>
                  </div>
                  {amenity.description && (
                    <p className="font-light text-[13px] leading-[1.7] text-white/65">{amenity.description}</p>
                  )}

                  <div className="flex flex-wrap gap-[9px] mt-[4px]">
                    {tourHref && (
                      <Link
                        href={tourHref}
                        className="h-[40px] px-[18px] flex items-center gap-[8px] bg-brand-700 hover:bg-brand-600 rounded-[11px] text-[12.5px] font-semibold text-white transition-colors"
                      >
                        <EyeIcon className="w-[15px] h-[15px]" strokeWidth={1.8} />
                        Recorrer en 360°
                      </Link>
                    )}
                    {amenity.tour3dUrl && (
                      <a
                        href={amenity.tour3dUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="h-[40px] px-[18px] flex items-center gap-[8px] border border-white/20 rounded-[11px] text-[12.5px] font-medium text-white"
                      >
                        <EyeIcon className="w-[15px] h-[15px]" strokeWidth={1.8} />
                        Ver recorrido 3D
                      </a>
                    )}
                    <button
                      onClick={() => onRequestVisit(amenity.name)}
                      className="h-[40px] px-[18px] flex items-center border border-white/20 rounded-[11px] text-[12.5px] font-medium text-white"
                    >
                      Agendar visita
                    </button>
                  </div>
                </div>

                {!!amenity.specs?.length && (
                  <div className="flex flex-col gap-[2px]">
                    {amenity.specs.map(s => (
                      <div key={s.key} className="flex items-center justify-between gap-[14px] p-[10px_0] border-b border-white/[.08]">
                        <div className="font-medium text-[10.5px] tracking-[.12em] text-white/45">{s.key}</div>
                        <div className="font-normal text-[12.5px] text-white text-right">{s.value}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {(onPrev || onNext) && (
                <div className="p-[14px_26px_22px] flex items-center justify-between gap-[14px] flex-wrap border-t border-white/[.08]">
                  {onPrev ? (
                    <button onClick={onPrev} className="flex items-center gap-[9px] min-w-0 text-left">
                      <span className="w-[30px] h-[30px] flex-none flex items-center justify-center rounded-[9px] border border-white/[.18] text-white">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M15 19L8 12l7-7" /></svg>
                      </span>
                      <span className="min-w-0">
                        <span className="block font-medium text-[9.5px] tracking-[.12em] text-white/40">ANTERIOR</span>
                        <span className="block font-normal text-[12.5px] text-white mt-[2px] truncate">{prevName}</span>
                      </span>
                    </button>
                  ) : <div />}
                  {onNext && (
                    <button onClick={onNext} className="flex items-center gap-[9px] min-w-0 text-right">
                      <span className="min-w-0">
                        <span className="block font-medium text-[9.5px] tracking-[.12em] text-white/40">SIGUIENTE</span>
                        <span className="block font-normal text-[12.5px] text-white mt-[2px] truncate">{nextName}</span>
                      </span>
                      <span className="w-[30px] h-[30px] flex-none flex items-center justify-center rounded-[9px] border border-white/[.18] text-white">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M9 5l7 7-7 7" /></svg>
                      </span>
                    </button>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
