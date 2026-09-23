'use client';

import { useState } from 'react';
import Image from 'next/image';
import { shimmerDataUrl } from '@/lib/imagePlaceholder';

export default function BimGallery({ images, title }: { images: string[]; title: string }) {
  const [active, setActive] = useState(0);
  if (images.length === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      <div className="relative w-full aspect-[16/10] rounded-2xl overflow-hidden bg-gray-100">
        <Image
          src={images[active]}
          alt={`${title} — imagen ${active + 1}`}
          fill
          sizes="(min-width: 1024px) 900px, 100vw"
          placeholder="blur"
          blurDataURL={shimmerDataUrl()}
          className="object-contain"
          priority={active === 0}
        />
      </div>

      {images.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {images.map((src, i) => (
            <button
              key={`${src}-${i}`}
              type="button"
              onClick={() => setActive(i)}
              aria-label={`Ver imagen ${i + 1}`}
              aria-current={i === active}
              className={`relative w-20 h-14 rounded-lg overflow-hidden shrink-0 border-2 transition-colors ${
                i === active ? 'border-gray-900' : 'border-transparent hover:border-gray-300'
              }`}
            >
              <Image src={src} alt="" fill sizes="80px" className="object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
