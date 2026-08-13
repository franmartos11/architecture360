'use client';

import { m as motion, AnimatePresence } from 'framer-motion';

// Lightbox de imagen a pantalla completa con prev/next/contador — usado
// tanto por la Galería de la unidad como por el detalle de una amenity.
export default function ImageLightbox({
  isOpen,
  images,
  index,
  onIndexChange,
  onClose,
  altPrefix = 'Imagen',
}: {
  isOpen: boolean;
  images: string[];
  index: number;
  onIndexChange: (index: number) => void;
  onClose: () => void;
  altPrefix?: string;
}) {
  return (
    <AnimatePresence>
      {isOpen && images.length > 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          className="fixed inset-0 z-[200] bg-black/95 flex items-center justify-center"
          onClick={onClose}
        >
          <motion.img
            key={index}
            src={images[index]}
            alt={`${altPrefix} ${index + 1}`}
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.92 }}
            transition={{ duration: 0.3 }}
            className="max-w-[90vw] max-h-[85vh] object-contain rounded-2xl shadow-2xl"
            onClick={e => e.stopPropagation()}
          />

          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="absolute top-6 right-6 w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 border border-white/20 flex items-center justify-center text-white transition-colors backdrop-blur"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          {index > 0 && (
            <button
              onClick={e => { e.stopPropagation(); onIndexChange(index - 1); }}
              aria-label="Imagen anterior"
              className="absolute left-6 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 border border-white/20 flex items-center justify-center text-white transition-colors backdrop-blur"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
              </svg>
            </button>
          )}

          {index < images.length - 1 && (
            <button
              onClick={e => { e.stopPropagation(); onIndexChange(index + 1); }}
              aria-label="Imagen siguiente"
              className="absolute right-6 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 border border-white/20 flex items-center justify-center text-white transition-colors backdrop-blur"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
              </svg>
            </button>
          )}

          {images.length > 1 && (
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-white/10 backdrop-blur rounded-full px-4 py-1.5 text-white/80 text-sm font-medium border border-white/20">
              {index + 1} / {images.length}
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
