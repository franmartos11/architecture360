'use client';

import { useState, useEffect, useMemo } from 'react';
import Image from 'next/image';
import { m as motion, AnimatePresence } from 'framer-motion';
import { TransitionLink as Link } from '@/components/ui/TransitionUtils';
import { shimmerDataUrl } from '@/lib/imagePlaceholder';
import type { Amenity } from '@/types';

interface AmenitiesModalProps {
  isOpen: boolean;
  onClose: () => void;
  amenities: Amenity[];
  buildingId: string;
  projectSlug: string;
}

export default function AmenitiesModal({ isOpen, onClose, amenities, buildingId, projectSlug }: AmenitiesModalProps) {
  const [active, setActive] = useState<Amenity | null>(null);
  const [imageIndex, setImageIndex] = useState(0);

  // Relevantes para esta torre: las de todo el complejo + las exclusivas de esta torre.
  const relevant = useMemo(
    () => amenities.filter(a => !a.buildingId || a.buildingId === buildingId),
    [amenities, buildingId]
  );

  useEffect(() => {
    if (!isOpen) {
      setActive(null);
      setImageIndex(0);
    }
  }, [isOpen]);

  const tourHref = active?.tourNodeId
    ? active.buildingId
      ? `/proyecto/${projectSlug}/edificio/${active.buildingId}/recorrido?focus=${active.tourNodeId}`
      : `/proyecto/${projectSlug}/recorrido?focus=${active.tourNodeId}`
    : null;

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-gray-900/40 backdrop-blur-sm"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]"
          >
            <div className="flex items-center justify-between p-5 border-b border-gray-100 bg-gray-50/50 shrink-0">
              <div>
                {active ? (
                  <button
                    onClick={() => setActive(null)}
                    className="flex items-center gap-1.5 text-sm font-semibold text-gray-900 hover:text-gray-600 transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
                    </svg>
                    {active.name}
                  </button>
                ) : (
                  <>
                    <h3 className="text-lg font-bold text-gray-900">Amenities</h3>
                    <p className="text-xs text-gray-500">Espacios del proyecto y de esta torre</p>
                  </>
                )}
              </div>
              <button
                onClick={onClose}
                aria-label="Cerrar"
                className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500 transition-colors shrink-0"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="overflow-y-auto">
              {active ? (
                <div>
                  <div className="relative w-full aspect-video bg-gray-100">
                    {active.images.length > 0 ? (
                      <>
                        <Image
                          src={active.images[imageIndex]}
                          alt={`${active.name} ${imageIndex + 1}`}
                          fill
                          sizes="512px"
                          placeholder="blur"
                          blurDataURL={shimmerDataUrl()}
                          className="object-cover"
                        />
                        {active.images.length > 1 && (
                          <>
                            <button
                              onClick={() => setImageIndex(i => (i - 1 + active.images.length) % active.images.length)}
                              aria-label="Imagen anterior"
                              className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/90 hover:bg-white shadow flex items-center justify-center text-gray-700 transition-colors"
                            >
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
                              </svg>
                            </button>
                            <button
                              onClick={() => setImageIndex(i => (i + 1) % active.images.length)}
                              aria-label="Imagen siguiente"
                              className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/90 hover:bg-white shadow flex items-center justify-center text-gray-700 transition-colors"
                            >
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                              </svg>
                            </button>
                          </>
                        )}
                      </>
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center text-gray-300 text-sm">Sin renders todavía</div>
                    )}
                  </div>
                  <div className="p-5 space-y-4">
                    {active.description && <p className="text-sm text-gray-600 leading-relaxed">{active.description}</p>}
                    {tourHref && (
                      <Link
                        href={tourHref}
                        className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-gray-900 hover:bg-gray-800 text-white text-sm font-medium transition-colors"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                        Recorrer en 360°
                      </Link>
                    )}
                  </div>
                </div>
              ) : relevant.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-10">Todavía no hay amenities cargadas.</p>
              ) : (
                <div className="grid grid-cols-2 gap-3 p-5">
                  {relevant.map(a => (
                    <button
                      key={a.id}
                      onClick={() => { setActive(a); setImageIndex(0); }}
                      className="group text-left rounded-xl overflow-hidden border border-gray-100 hover:border-gray-300 transition-colors"
                    >
                      <div className="relative aspect-[4/3] bg-gray-100">
                        {a.images[0] ? (
                          <Image
                            src={a.images[0]}
                            alt={a.name}
                            fill
                            sizes="220px"
                            placeholder="blur"
                            blurDataURL={shimmerDataUrl()}
                            className="object-cover transition-transform duration-300 group-hover:scale-105"
                          />
                        ) : (
                          <div className="absolute inset-0 flex items-center justify-center text-gray-300 text-[11px]">Sin foto</div>
                        )}
                        {a.tourNodeId && (
                          <span className="absolute top-2 right-2 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-black/60 text-white">360°</span>
                        )}
                      </div>
                      <p className="text-xs font-semibold text-gray-900 px-2.5 py-2 truncate">{a.name}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
