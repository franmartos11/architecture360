'use client';

import { useRef } from 'react';
import Image from 'next/image';
import { m as motion, AnimatePresence } from 'framer-motion';

export default function GaleriaTab({
  images,
  activeIndex,
  onIndexChange,
  onOpenLightbox,
}: {
  images: string[];
  activeIndex: number;
  onIndexChange: (index: number) => void;
  onOpenLightbox: (index: number) => void;
}) {
  const thumbsRef = useRef<HTMLDivElement>(null);

  const scrollThumbs = (dir: 'left' | 'right') => {
    thumbsRef.current?.scrollBy({ left: dir === 'right' ? 220 : -220, behavior: 'smooth' });
  };

  return (
    <motion.div
      key="galeria"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      className="absolute inset-0 flex flex-col"
    >
      {/* ── Main image (fills all space) ── */}
      <div
        className="relative flex-1 overflow-hidden cursor-zoom-in"
        onClick={() => onOpenLightbox(activeIndex)}
      >
        <AnimatePresence mode="wait">
          <motion.img
            key={activeIndex}
            src={images[activeIndex]}
            alt={`Imagen ${activeIndex + 1}`}
            initial={{ opacity: 0, scale: 1.03 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.4 }}
            className="absolute inset-0 w-full h-full object-cover"
          />
        </AnimatePresence>

        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-black/50 pointer-events-none" />

        {/* Expand hint */}
        <div className="absolute top-4 right-4 bg-black/40 backdrop-blur-md rounded-full w-9 h-9 flex items-center justify-center border border-white/20">
          <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
          </svg>
        </div>

        {/* Prev arrow */}
        {activeIndex > 0 && (
          <button
            onClick={e => { e.stopPropagation(); onIndexChange(activeIndex - 1); }}
            aria-label="Imagen anterior"
            className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/40 hover:bg-black/60 backdrop-blur-md border border-white/20 flex items-center justify-center text-white transition-all hover:scale-110"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
          </button>
        )}

        {/* Next arrow */}
        {activeIndex < images.length - 1 && (
          <button
            onClick={e => { e.stopPropagation(); onIndexChange(activeIndex + 1); }}
            aria-label="Imagen siguiente"
            className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/40 hover:bg-black/60 backdrop-blur-md border border-white/20 flex items-center justify-center text-white transition-all hover:scale-110"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
            </svg>
          </button>
        )}
      </div>

      {/* ── Thumbnails carousel ── */}
      <div className="relative flex-shrink-0 bg-white/95 backdrop-blur-md border-t border-gray-200">

        {/* Left scroll button */}
        <button
          onClick={() => scrollThumbs('left')}
          className="absolute left-0 top-0 bottom-0 z-10 px-3 flex items-center justify-center bg-gradient-to-r from-white via-white/90 to-transparent hover:from-gray-50 transition-colors"
          aria-label="Desplazar izquierda"
        >
          <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
        </button>

        {/* Scrollable strip */}
        <div
          ref={thumbsRef}
          className="flex items-center gap-2 px-10 py-3 overflow-x-auto scroll-smooth"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          {images.map((img, i) => (
            <button
              key={i}
              onClick={() => onIndexChange(i)}
              aria-label={`Ver foto ${i + 1} de la galería`}
              aria-current={i === activeIndex ? 'true' : undefined}
              className={`relative flex-shrink-0 rounded-lg overflow-hidden transition-all duration-200 ${
                i === activeIndex
                  ? 'ring-2 ring-gray-900 w-24 h-16 opacity-100 shadow-md'
                  : 'w-20 h-14 opacity-55 hover:opacity-90 hover:scale-105'
              }`}
            >
              <Image src={img} alt={`Thumbnail ${i + 1}`} fill sizes="100px" className="object-cover" />
            </button>
          ))}
        </div>

        {/* Right scroll button */}
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
    </motion.div>
  );
}
