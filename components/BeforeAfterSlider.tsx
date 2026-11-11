'use client';

import { useRef, useState } from 'react';
import Image from 'next/image';
import { shimmerDataUrl } from '@/lib/imagePlaceholder';
import type { BeforeAfterPair } from '@/types';

// Slider comparador de una foto "antes" contra una "después" del mismo
// lugar — típico de un reciclaje/rehabilitación. La imagen "antes" se
// recorta con clip-path según la posición del divisor en vez de
// escalarla, así ninguna de las dos fotos se deforma al arrastrar.
//
// `beforeLabel`/`afterLabel` reemplazan los "Antes"/"Después" de las
// esquinas (el avance de obra pone las fechas: "ago 2025 · Mes 2 de obra");
// sin ellos queda como siempre. Con teclado se mueve con las flechas.
interface BeforeAfterSliderProps extends BeforeAfterPair {
  beforeLabel?: string;
  afterLabel?: string;
  sizes?: string;
}

export default function BeforeAfterSlider({ label, beforeImage, afterImage, beforeLabel, afterLabel, sizes = '(min-width: 768px) 800px, 100vw' }: BeforeAfterSliderProps) {
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
  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const d = e.key === 'ArrowLeft' ? -5 : e.key === 'ArrowRight' ? 5 : 0;
    if (!d) return;
    e.preventDefault();
    setPercent(p => Math.min(100, Math.max(0, p + d)));
  };
  // Las etiquetas de siempre van en mayúsculas chicas; las propias (fechas)
  // se leen mejor tal cual y, en un celular, pasan a dos renglones antes
  // que pisarse entre ellas.
  const tagClass = (custom: boolean) =>
    `absolute top-4 text-white bg-black/50 backdrop-blur px-2.5 py-1 pointer-events-none ${custom ? 'max-w-[calc(50%-1.5rem)] rounded-xl text-xs leading-snug font-semibold' : 'rounded-full text-[11px] font-bold uppercase tracking-wide'}`;

  return (
    <div className="space-y-3">
      {label && <p className="text-sm font-medium text-[var(--theme-text-muted)]">{label}</p>}
      <div
        ref={containerRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onKeyDown={handleKeyDown}
        role="slider"
        tabIndex={0}
        aria-label={label || 'Comparar antes y después'}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(percent)}
        className="relative aspect-[16/10] rounded-[var(--theme-radius)] overflow-hidden select-none touch-none cursor-ew-resize shadow-lg focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-[var(--theme-accent)]"
      >
        {/* Después — de fondo, ocupa todo el marco */}
        <Image
          src={afterImage}
          alt={afterLabel ?? 'Después'}
          fill
          sizes={sizes}
          placeholder="blur"
          blurDataURL={shimmerDataUrl()}
          className="object-cover pointer-events-none"
        />
        <span className={`${tagClass(!!afterLabel)} right-4`}>
          {afterLabel ?? 'Después'}
        </span>

        {/* Antes — recortada con clip-path, no escalada, para que ninguna de las dos fotos se deforme */}
        <div className="absolute inset-0" style={{ clipPath: `inset(0 ${100 - percent}% 0 0)` }}>
          <Image
            src={beforeImage}
            alt={beforeLabel ?? 'Antes'}
            fill
            sizes={sizes}
            placeholder="blur"
            blurDataURL={shimmerDataUrl()}
            className="object-cover pointer-events-none"
          />
          <span className={`${tagClass(!!beforeLabel)} left-4`}>
            {beforeLabel ?? 'Antes'}
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
