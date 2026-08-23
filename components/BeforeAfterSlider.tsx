'use client';

import { useRef, useState } from 'react';
import Image from 'next/image';
import { shimmerDataUrl } from '@/lib/imagePlaceholder';
import type { BeforeAfterPair } from '@/types';

// Slider comparador de una foto "antes" contra una "después" del mismo
// lugar — típico de un reciclaje/rehabilitación. La imagen "antes" se
// recorta con clip-path según la posición del divisor en vez de
// escalarla, así ninguna de las dos fotos se deforma al arrastrar.
export default function BeforeAfterSlider({ label, beforeImage, afterImage }: BeforeAfterPair) {
  const [percent, setPercent] = useState(50);
  const containerRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);

  const updateFromClientX = (clientX: number) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const pct = ((clientX - rect.left) / rect.width) * 100;
    setPercent(Math.min(100, Math.max(0, pct)));
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    draggingRef.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    updateFromClientX(e.clientX);
  };
  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    updateFromClientX(e.clientX);
  };
  const handlePointerUp = () => {
    draggingRef.current = false;
  };

  return (
    <div className="space-y-3">
      {label && <p className="text-sm font-medium text-[var(--theme-text-muted)]">{label}</p>}
      <div
        ref={containerRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        className="relative aspect-[16/10] rounded-[var(--theme-radius)] overflow-hidden select-none touch-none cursor-ew-resize shadow-lg"
      >
        {/* Después — de fondo, ocupa todo el marco */}
        <Image
          src={afterImage}
          alt="Después"
          fill
          sizes="(min-width: 768px) 800px, 100vw"
          placeholder="blur"
          blurDataURL={shimmerDataUrl()}
          className="object-cover pointer-events-none"
        />
        <span className="absolute top-4 right-4 text-[11px] font-bold uppercase tracking-wide text-white bg-black/50 backdrop-blur px-2.5 py-1 rounded-full pointer-events-none">
          Después
        </span>

        {/* Antes — recortada con clip-path, no escalada, para que ninguna de las dos fotos se deforme */}
        <div className="absolute inset-0" style={{ clipPath: `inset(0 ${100 - percent}% 0 0)` }}>
          <Image
            src={beforeImage}
            alt="Antes"
            fill
            sizes="(min-width: 768px) 800px, 100vw"
            placeholder="blur"
            blurDataURL={shimmerDataUrl()}
            className="object-cover pointer-events-none"
          />
          <span className="absolute top-4 left-4 text-[11px] font-bold uppercase tracking-wide text-white bg-black/50 backdrop-blur px-2.5 py-1 rounded-full pointer-events-none">
            Antes
          </span>
        </div>

        {/* Divisor arrastrable */}
        <div
          className="absolute inset-y-0 z-10 w-1 bg-white/80 pointer-events-none"
          style={{ left: `${percent}%`, transform: 'translateX(-50%)' }}
        >
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white shadow-lg flex items-center justify-center">
            <svg className="w-4 h-4 text-[var(--theme-text)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l-6 7.5 6 7.5m7.5-15l6 7.5-6 7.5" />
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
}
