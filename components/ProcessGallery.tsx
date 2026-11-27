'use client';

import { useState } from 'react';
import Image from 'next/image';
import { shimmerDataUrl } from '@/lib/imagePlaceholder';
import ImageLightbox from './unit/ImageLightbox';
import { useT } from '@/lib/i18n/client';

// Valor de la prop de next/image, no texto (el guardián de i18n mira los placeholder escritos a mano).
const BLUR = 'blur' as const;

// Grilla de bocetos/maquetas/diagramas con lightbox — mismo patrón que la
// galería de una unidad, pero a nivel proyecto (no depende de haber
// entrado a ninguna unidad puntual).
export default function ProcessGallery({ images }: { images: string[] }) {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const t = useT();
  const [index, setIndex] = useState(0);
  // La miniatura tocada: el lightbox abre (y cierra) desde ahí.
  const [origin, setOrigin] = useState<DOMRect | null>(null);

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4">
        {images.map((src, i) => (
          <button
            key={i}
            onClick={e => { setOrigin(e.currentTarget.getBoundingClientRect()); setIndex(i); setLightboxOpen(true); }}
            className="relative aspect-[4/3] rounded-[var(--theme-radius)] overflow-hidden bg-[var(--theme-border)] group"
          >
            <Image
              src={src}
              alt={t('sitio.proceso.imagen', { n: i + 1 })}
              fill
              sizes="(min-width: 768px) 33vw, 50vw"
              placeholder={BLUR}
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
        altPrefix={t('sitio.proceso.titulo')}
        originRect={origin}
      />
    </>
  );
}
