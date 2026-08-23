'use client';

import { useState } from 'react';
import Image from 'next/image';
import { shimmerDataUrl } from '@/lib/imagePlaceholder';
import ImageLightbox from './unit/ImageLightbox';

// Grilla de bocetos/maquetas/diagramas con lightbox — mismo patrón que la
// galería de una unidad, pero a nivel proyecto (no depende de haber
// entrado a ninguna unidad puntual).
export default function ProcessGallery({ images }: { images: string[] }) {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [index, setIndex] = useState(0);

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4">
        {images.map((src, i) => (
          <button
            key={i}
            onClick={() => { setIndex(i); setLightboxOpen(true); }}
            className="relative aspect-[4/3] rounded-[var(--theme-radius)] overflow-hidden bg-[var(--theme-border)] group"
          >
            <Image
              src={src}
              alt={`Proceso ${i + 1}`}
              fill
              sizes="(min-width: 768px) 33vw, 50vw"
              placeholder="blur"
              blurDataURL={shimmerDataUrl()}
              className="object-cover transition-transform duration-300 group-hover:scale-105"
            />
          </button>
        ))}
      </div>

      <ImageLightbox
        isOpen={lightboxOpen}
        images={images}
        index={index}
        onIndexChange={setIndex}
        onClose={() => setLightboxOpen(false)}
        altPrefix="Proceso"
      />
    </>
  );
}
