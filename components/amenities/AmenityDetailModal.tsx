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
}

export default function AmenityDetailModal({ amenity, building, onClose }: AmenityDetailModalProps) {
  const basePath = useProjectBasePath();
  const [index, setIndex] = useState(0);

  useEffect(() => {
    setIndex(0);
  }, [amenity?.id]);

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
              <div className="p-6">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="text-xl font-semibold text-white">{amenity.name}</h3>
                  <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-white/10 text-white/60">
                    {building ? building.name : 'Todo el complejo'}
                  </span>
                </div>
                {amenity.description && (
                  <p className="text-sm text-white/60 mt-2 leading-relaxed">{amenity.description}</p>
                )}

                {(tourHref || amenity.tour3dUrl) && (
                  <div className="mt-5 flex flex-wrap gap-3">
                    {tourHref && (
                      <Link
                        href={tourHref}
                        className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-sm font-medium transition-all duration-200 hover:shadow-lg hover:shadow-brand-600/25"
                      >
                        <EyeIcon className="w-4 h-4" strokeWidth={2} />
                        Recorrer en 360°
                      </Link>
                    )}
                    {amenity.tour3dUrl && (
                      <a
                        href={amenity.tour3dUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 text-white text-sm font-medium transition-colors duration-200"
                      >
                        <EyeIcon className="w-4 h-4" strokeWidth={2} />
                        Ver recorrido 3D
                      </a>
                    )}
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
