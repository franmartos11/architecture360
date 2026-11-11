'use client';

import { useEffect, useRef } from 'react';
import Image from 'next/image';
import { useInView, useReducedMotion } from 'framer-motion';
import { shimmerDataUrl } from '@/lib/imagePlaceholder';
import type { ConstructionUpdate } from '@/types';

/**
 * Portada de una entrada en la historia y el carrusel: el clip si lo hay
 * (en lugar de la foto), si no la primera foto. `visibleUpdates` ya sacó
 * las entradas sin ninguna de las dos, así que siempre hay algo.
 */
export default function UpdateCover({ update, sizes, priority }: { update: ConstructionUpdate; sizes: string; priority?: boolean }) {
  const alt = update.title || 'Avance de obra';
  if (update.video) return <CoverClip src={update.video} poster={update.images[0]} label={alt} />;
  if (!update.images[0]) return null;
  return <Image src={update.images[0]} alt={alt} fill sizes={sizes} placeholder="blur" blurDataURL={shimmerDataUrl()} className="object-cover" priority={priority} />;
}

/**
 * Clip mudo en loop. Se reproduce solo mientras está a la vista: con un
 * carrusel de 30 entradas no queremos 30 videos corriendo fuera de
 * pantalla. Con movimiento reducido queda quieto en el poster (o en el
 * primer fotograma si no hay foto) — la persona lo puede ver igual en el
 * time-lapse, donde lo arranca ella.
 */
function CoverClip({ src, poster, label }: { src: string; poster?: string; label: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  const reduce = useReducedMotion();
  const inView = useInView(ref, { amount: 0.4 });

  useEffect(() => {
    const v = ref.current;
    if (!v || reduce) return;
    // play() devuelve una promesa que se rechaza si el navegador no deja
    // (ahorro de datos, pestaña en segundo plano): queda el poster, sin ruido.
    if (inView) v.play()?.catch(() => {});
    else v.pause();
  }, [inView, reduce]);

  return (
    <video
      ref={ref}
      src={src}
      poster={poster}
      muted
      loop
      playsInline
      autoPlay={!reduce}
      preload={reduce ? 'metadata' : 'auto'}
      aria-label={label}
      className="absolute inset-0 w-full h-full object-cover"
    />
  );
}
