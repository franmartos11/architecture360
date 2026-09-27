'use client';

import { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import { m as motion, AnimatePresence } from 'framer-motion';
import { TransitionLink as Link } from '@/components/ui/TransitionUtils';
import { useProjectBasePath } from '@/lib/project-base-path-context';
import { shimmerDataUrl } from '@/lib/imagePlaceholder';
import EyeIcon from '@/components/ui/icons/EyeIcon';
import ModalPortal from '@/components/ui/ModalPortal';
import type { Amenity, Building } from '@/types';

interface AmenityDetailScreenProps {
  amenity: Amenity | null;
  building: Building | undefined;
  /** "03 / 12" — posición dentro de la lista filtrada. */
  position: string;
  prev: Amenity | null;
  next: Amenity | null;
  onSelect: (id: string) => void;
  onClose: () => void;
  onRequestVisit: (amenityName: string) => void;
}

const pad = (n: number) => String(n).padStart(2, '0');
export const amenityPosition = (i: number, total: number) => `${pad(i + 1)} / ${pad(total)}`;

const STRIPES = { background: 'repeating-linear-gradient(120deg, rgba(255,255,255,.035) 0 10px, rgba(255,255,255,.06) 10px 20px)' };

function Chevron({ dir }: { dir: 'left' | 'right' }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d={dir === 'left' ? 'M15 19L8 12l7-7' : 'M9 5l7 7-7 7'} />
    </svg>
  );
}

const ROUND_BTN = 'w-[34px] h-[34px] flex-none flex items-center justify-center border border-white/20 rounded-full text-white transition-colors hover:border-white/[.55]';

export default function AmenityDetailScreen({ amenity, building, position, prev, next, onSelect, onClose, onRequestVisit }: AmenityDetailScreenProps) {
  const basePath = useProjectBasePath();
  const [index, setIndex] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Reset del carrusel al cambiar de amenity — ajustado durante el render
  // comparando contra el id anterior, en vez de en un efecto.
  const [prevAmenityId, setPrevAmenityId] = useState(amenity?.id);
  if (amenity?.id !== prevAmenityId) {
    setPrevAmenityId(amenity?.id);
    setIndex(0);
  }

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [amenity?.id]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!amenity) return;
      if (e.key === 'Escape') onClose();
      if (amenity.images.length < 2) return;
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

  const images = amenity?.images ?? [];
  const i = Math.min(index, Math.max(0, images.length - 1));
  const shift = (d: number) => setIndex((i + d + images.length) % images.length);
  const specs = amenity?.specs ?? [];
  const ficha = amenity?.location ? [{ key: 'UBICACIÓN', value: amenity.location }, ...specs] : specs;
  const neighbors = [
    prev && { label: 'ANTERIOR', a: prev },
    next && next.id !== prev?.id && { label: 'SIGUIENTE', a: next },
  ].filter((n): n is { label: string; a: Amenity } => !!n);

  return (
    <ModalPortal open={!!amenity}>
      <AnimatePresence>
        {amenity && (
          <motion.div
            key="amenity-screen"
            ref={scrollRef}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-0 z-[60] bg-trevo-dark overflow-y-auto"
            role="dialog"
            aria-modal="true"
            aria-label={amenity.name}
          >
            {/* ── Barra superior ─────────────────────────────── */}
            <div className="sticky top-0 z-[3] bg-trevo-dark/90 backdrop-blur-md border-b border-white/[.08]">
              <div className="max-w-[1240px] mx-auto px-[16px] sm:px-[28px] py-[12px] flex items-center gap-[10px]">
                <button
                  onClick={onClose}
                  className="h-[34px] pl-[11px] pr-[15px] flex items-center gap-[7px] border border-white/20 rounded-full text-[11.5px] font-medium text-white transition-colors hover:border-white/[.55]"
                >
                  <Chevron dir="left" />
                  Espacios comunes
                </button>
                <div className="flex-1" />
                <div className="hidden sm:block font-medium text-[10.5px] tracking-[.16em] text-white/45 mr-[6px]">{position}</div>
                {prev && (
                  <button onClick={() => onSelect(prev.id)} aria-label="Amenidad anterior" className={ROUND_BTN}><Chevron dir="left" /></button>
                )}
                {next && (
                  <button onClick={() => onSelect(next.id)} aria-label="Amenidad siguiente" className={ROUND_BTN}><Chevron dir="right" /></button>
                )}
                <button onClick={onClose} aria-label="Cerrar" className={`${ROUND_BTN} ml-[6px]`}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
                </button>
              </div>
            </div>

            <motion.div
              key={amenity.id}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.24 }}
              className="max-w-[1240px] mx-auto px-[16px] sm:px-[28px] pt-[22px] pb-[80px]"
            >
              {/* ── Portada ──────────────────────────────────── */}
              <div className="relative rounded-[20px] overflow-hidden bg-[#26302b] min-h-[min(64vh,600px)] flex items-end">
                {images.length > 0 ? (
                  <AnimatePresence initial={false}>
                    <motion.div
                      key={i}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.4 }}
                      className="absolute inset-0"
                    >
                      <Image
                        src={images[i]}
                        alt={images.length > 1 ? `${amenity.name} ${i + 1}` : amenity.name}
                        fill
                        sizes="(min-width: 1240px) 1184px, 100vw"
                        placeholder="blur"
                        blurDataURL={shimmerDataUrl(1240, 600)}
                        className="object-cover"
                        priority
                      />
                    </motion.div>
                  </AnimatePresence>
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center text-[11px] text-white/45" style={STRIPES}>Render en camino</div>
                )}
                <div className="absolute inset-0 bg-gradient-to-r from-[#0f1210]/90 via-[#0f1210]/50 to-[#0f1210]/10 pointer-events-none" />
                <div className="relative p-[24px] sm:p-[32px_34px] max-w-[600px] flex flex-col gap-[12px]">
                  <h1 className="font-light text-[clamp(32px,4.4vw,48px)] leading-[1.08] text-white text-pretty">{amenity.name}</h1>
                  {specs.length > 0 && (
                    <div className="flex gap-[22px] flex-wrap mt-[4px]">
                      {specs.slice(0, 3).map(s => (
                        <div key={s.key}>
                          <div className="font-medium text-[9.5px] tracking-[.14em] uppercase text-white/50">{s.key}</div>
                          <div className="font-normal text-[13px] text-white mt-[4px]">{s.value}</div>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="flex gap-[9px] flex-wrap mt-[10px]">
                    {tourHref && (
                      <Link
                        href={tourHref}
                        className="h-[42px] px-[20px] flex items-center gap-[8px] bg-white rounded-full text-[12.5px] font-semibold text-trevo-dark"
                      >
                        <EyeIcon className="w-[15px] h-[15px]" strokeWidth={1.8} />
                        Recorrer en 360°
                      </Link>
                    )}
                    {amenity.tour3dUrl && (
                      <a
                        href={amenity.tour3dUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="h-[42px] px-[20px] flex items-center gap-[8px] border border-white/[.28] rounded-full text-[12.5px] font-medium text-white"
                      >
                        Ver recorrido 3D
                      </a>
                    )}
                    <button
                      onClick={() => onRequestVisit(amenity.name)}
                      className="h-[42px] px-[20px] flex items-center border border-white/[.28] rounded-full text-[12.5px] font-medium text-white"
                    >
                      Agendar visita
                    </button>
                  </div>
                </div>
                {images.length > 1 && (
                  <div className="absolute right-[18px] bottom-[18px] flex items-center gap-[4px] p-[4px] bg-black/50 backdrop-blur-md rounded-full">
                    <button onClick={() => shift(-1)} aria-label="Foto anterior" className="w-[32px] h-[32px] flex items-center justify-center rounded-full text-white hover:bg-white/[.14]"><Chevron dir="left" /></button>
                    <div className="font-medium text-[11px] text-white min-w-[40px] text-center">{i + 1} / {images.length}</div>
                    <button onClick={() => shift(1)} aria-label="Foto siguiente" className="w-[32px] h-[32px] flex items-center justify-center rounded-full text-white hover:bg-white/[.14]"><Chevron dir="right" /></button>
                  </div>
                )}
              </div>

              {/* ── El espacio + Ficha ───────────────────────── */}
              {(amenity.description || ficha.length > 0) && (
                <div className="grid grid-cols-[repeat(auto-fit,minmax(min(300px,100%),1fr))] gap-[44px] mt-[40px]">
                  {amenity.description && (
                    <div className="flex flex-col gap-[14px]">
                      <div className="font-semibold text-[11px] tracking-[.2em] text-trevo-lightgreen">EL ESPACIO</div>
                      <p className="font-light text-[clamp(17px,1.6vw,20px)] leading-[1.6] text-white/[.82] text-pretty max-w-[520px] whitespace-pre-line">{amenity.description}</p>
                    </div>
                  )}
                  {ficha.length > 0 && (
                    <div className="flex flex-col">
                      <div className="font-semibold text-[11px] tracking-[.2em] text-trevo-lightgreen">FICHA</div>
                      <div className="mt-[6px]">
                        {ficha.map(s => (
                          <div key={s.key} className="flex items-baseline justify-between gap-[16px] py-[13px] border-b border-white/[.08]">
                            <div className="font-medium text-[10px] tracking-[.16em] uppercase text-white/45">{s.key}</div>
                            <div className="font-normal text-[13px] text-white text-right">{s.value}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ── Fotos ────────────────────────────────────── */}
              {images.length > 1 && (
                <div className="mt-[44px]">
                  <div className="font-semibold text-[11px] tracking-[.2em] text-trevo-lightgreen">FOTOS · {images.length}</div>
                  <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] sm:grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-[12px] mt-[14px]">
                    {images.map((src, m) => (
                      <button
                        key={src + m}
                        onClick={() => { setIndex(m); scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' }); }}
                        aria-label={`Ver foto ${m + 1}`}
                        className={
                          'relative aspect-[4/3] rounded-[14px] overflow-hidden transition-all duration-200 ' +
                          (m === i ? 'outline outline-2 outline-white outline-offset-[3px]' : 'opacity-70 hover:opacity-100')
                        }
                      >
                        <Image src={src} alt="" fill sizes="240px" className="object-cover" />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* ── Seguir explorando ────────────────────────── */}
              {neighbors.length > 0 && (
                <div className="mt-[52px] pt-[28px] border-t border-white/[.08]">
                  <div className="font-semibold text-[11px] tracking-[.2em] text-trevo-lightgreen">SEGUIR EXPLORANDO</div>
                  <div className="grid grid-cols-[repeat(auto-fit,minmax(min(260px,100%),1fr))] gap-[16px] mt-[14px]">
                    {neighbors.map(({ label, a }) => (
                      <button
                        key={label}
                        onClick={() => onSelect(a.id)}
                        className="relative text-left rounded-[18px] overflow-hidden aspect-[21/9] bg-[#26302b] border border-white/[.1] transition-all duration-300 hover:border-white/30 hover:-translate-y-[3px]"
                      >
                        {a.images[0] ? (
                          <Image src={a.images[0]} alt="" fill sizes="(min-width: 1240px) 600px, 100vw" className="object-cover" />
                        ) : (
                          <div className="absolute inset-0" style={STRIPES} />
                        )}
                        <div className="absolute inset-0 bg-gradient-to-b from-black/0 from-20% to-black/80" />
                        <div className="absolute left-[18px] right-[18px] bottom-[16px] flex items-end justify-between gap-[12px]">
                          <div>
                            <div className="font-medium text-[9.5px] tracking-[.16em] text-white/60">{label}</div>
                            <div className="font-normal text-[18px] text-white mt-[4px]">{a.name}</div>
                          </div>
                          <div className="font-semibold text-[11.5px] text-brand-300 whitespace-nowrap">Ver →</div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </ModalPortal>
  );
}
