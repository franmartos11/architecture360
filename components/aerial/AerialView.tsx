'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { m as motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import type { Project, AerialSlide, AerialHotspot } from '@/types';
import { shimmerDataUrl } from '@/lib/imagePlaceholder';

interface AerialViewProps {
  project: Project;
}

export default function AerialView({ project }: AerialViewProps) {
  const router = useRouter();
  const [currentSlide, setCurrentSlide] = useState(0);
  const [activeHotspot, setActiveHotspot] = useState<AerialHotspot | null>(null);
  const [hoveredBuildingId, setHoveredBuildingId] = useState<string | null>(null);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [userInteracted, setUserInteracted] = useState(false);
  const [showTutorial, setShowTutorial] = useState(true);

  const slide: AerialSlide = project.aerialSlides[currentSlide];
  const building = activeHotspot
    ? project.buildings.find(b => b.id === activeHotspot.buildingId)
    : null;

  // ── Corrección de coordenadas por el recorte de object-cover ──────
  // La foto llena la pantalla completa con object-cover (recorta en vez
  // de deformar), y ese recorte cambia con el tamaño de ventana. Los
  // puntos de los polígonos/hotspots están guardados en % de la imagen
  // ORIGINAL sin recortar, así que hay que recalcular en qué % del
  // contenedor visible cae cada punto, en vivo, cada vez que cambia el
  // tamaño del contenedor o se carga una imagen nueva.
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 });
  const [naturalSize, setNaturalSize] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => setContainerSize({ w: el.clientWidth, h: el.clientHeight });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const handleImageLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    setNaturalSize({ w: img.naturalWidth, h: img.naturalHeight });
  }, []);

  const mapPoint = useCallback((px: number, py: number) => {
    const { w: cw, h: ch } = containerSize;
    const { w: nw, h: nh } = naturalSize;
    if (!cw || !ch || !nw || !nh) return { x: px, y: py };

    // Con object-fit: cover, la imagen se escala al mayor factor que
    // cubra ambos ejes del contenedor, y se recorta el sobrante
    // centrado (object-position: center, el default).
    const scale = Math.max(cw / nw, ch / nh);
    const displayedW = nw * scale;
    const displayedH = nh * scale;
    const offsetX = (displayedW - cw) / 2;
    const offsetY = (displayedH - ch) / 2;

    const pixelX = (px / 100) * displayedW - offsetX;
    const pixelY = (py / 100) * displayedH - offsetY;

    return { x: (pixelX / cw) * 100, y: (pixelY / ch) * 100 };
  }, [containerSize, naturalSize]);

  // Autoplay carousel
  useEffect(() => {
    if (userInteracted || activeHotspot) return;
    const interval = setInterval(() => {
      setCurrentSlide(i => (i + 1) % project.aerialSlides.length);
    }, 5000);
    return () => clearInterval(interval);
  }, [userInteracted, activeHotspot, project.aerialSlides.length]);

  // Hide tutorial after a few seconds or on interaction
  useEffect(() => {
    if (userInteracted || activeHotspot) {
      setShowTutorial(false);
      return;
    }
    const timeout = setTimeout(() => setShowTutorial(false), 8000);
    return () => clearTimeout(timeout);
  }, [userInteracted, activeHotspot]);

  // Close popup on click outside
  const handleBackgroundClick = useCallback(() => {
    setActiveHotspot(null);
  }, []);

  // Navigate to building floor plan
  const handleEnterBuilding = useCallback(() => {
    if (!activeHotspot) return;
    setIsTransitioning(true);
    setTimeout(() => {
      router.push(`/proyecto/${project.slug}/edificio/${activeHotspot.buildingId}`);
    }, 500);
  }, [activeHotspot, project.slug, router]);

  // Prev/Next slide
  const goNext = useCallback(() => {
    setUserInteracted(true);
    setActiveHotspot(null);
    setCurrentSlide(i => (i + 1) % project.aerialSlides.length);
  }, [project.aerialSlides.length]);

  const goPrev = useCallback(() => {
    setUserInteracted(true);
    setActiveHotspot(null);
    setCurrentSlide(i => (i - 1 + project.aerialSlides.length) % project.aerialSlides.length);
  }, [project.aerialSlides.length]);

  // Keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') goNext();
      if (e.key === 'ArrowLeft') goPrev();
      if (e.key === 'Escape') setActiveHotspot(null);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [goNext, goPrev]);

  return (
    <div
      ref={containerRef}
      className={`relative w-full h-screen overflow-hidden bg-black transition-all duration-500 ${isTransitioning ? 'scale-110 opacity-0' : 'scale-100 opacity-100'}`}
      onClick={handleBackgroundClick}
    >
      {/* ── Image carousel ─────────────────────────────────────── */}
      <AnimatePresence mode="wait">
        <motion.div
          key={slide.id}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.6 }}
          className="absolute inset-0"
        >
          <Image
            src={slide.imageUrl}
            alt={slide.label}
            fill
            sizes="100vw"
            priority
            placeholder="blur"
            blurDataURL={shimmerDataUrl(1920, 1080)}
            className="object-cover"
            draggable={false}
            onLoad={handleImageLoad}
          />
          {/* Gradient vignette */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-black/20 pointer-events-none" />
        </motion.div>
      </AnimatePresence>

      {/* ── Siluetas de las torres (delimitación) ──────────────────
          El estilo se maneja 100% por estado de React (no CSS :hover)
          para que se comporte igual en mouse y en touch: en celular no
          existe "hover" real, así que si dependiera de :hover el
          resaltado queda pegado de forma inconsistente después de tocar. */}
      {slide.hotspots.some(h => h.polygon && h.polygon.length > 0) && (
        <svg
          className="absolute inset-0 w-full h-full z-10"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
        >
          {slide.hotspots.filter(h => h.polygon && h.polygon.length > 0).map(hotspot => {
            const isActive = activeHotspot?.buildingId === hotspot.buildingId;
            const isHovered = hoveredBuildingId === hotspot.buildingId;
            return (
              <polygon
                key={hotspot.buildingId}
                points={hotspot.polygon!.map(p => { const m = mapPoint(p.x, p.y); return `${m.x},${m.y}`; }).join(' ')}
                fill={isActive ? 'rgba(255,255,255,0.16)' : isHovered ? 'rgba(255,255,255,0.08)' : 'transparent'}
                stroke={isActive || isHovered ? 'rgba(255,255,255,0.85)' : 'transparent'}
                strokeWidth={isActive ? 1.5 : 1}
                vectorEffect="non-scaling-stroke"
                style={{ cursor: 'pointer', transition: 'fill 0.25s ease-out, stroke 0.25s ease-out, stroke-width 0.25s ease-out' }}
                onMouseEnter={() => setHoveredBuildingId(hotspot.buildingId)}
                onMouseLeave={() => setHoveredBuildingId(null)}
                onClick={e => {
                  e.stopPropagation();
                  setActiveHotspot(isActive ? null : hotspot);
                }}
                role="button"
                aria-label={`Seleccionar ${project.buildings.find(b => b.id === hotspot.buildingId)?.name}`}
              />
            );
          })}
        </svg>
      )}

      {/* ── Building hotspots ──────────────────────────────────── */}
      {slide.hotspots.map(hotspot => {
        const b = project.buildings.find(b => b.id === hotspot.buildingId);
        const isActive = activeHotspot?.buildingId === hotspot.buildingId;
        const pos = mapPoint(hotspot.x, hotspot.y);

        return (
          <button
            key={hotspot.buildingId}
            className="absolute z-20 group"
            style={{ left: `${pos.x}%`, top: `${pos.y}%`, transform: 'translate(-50%, -50%)' }}
            onClick={e => {
              e.stopPropagation();
              setActiveHotspot(isActive ? null : hotspot);
            }}
            aria-label={`Seleccionar ${b?.name}`}
          >
            {/* Outer pulse ring */}
            <span className={`absolute inset-0 rounded-full animate-ping opacity-40 ${isActive ? 'bg-white scale-150' : 'bg-white/70'}`} />
            {/* Dot */}
            <span className={`relative flex w-5 h-5 rounded-full border-2 transition-all duration-200 ${isActive ? 'bg-white border-white scale-125' : 'bg-black/70 border-white group-hover:bg-white/80 group-hover:scale-110'}`} />
          </button>
        );
      })}

      {/* ── Building popup ─────────────────────────────────────── */}
      <AnimatePresence>
        {activeHotspot && building && (
          <div
            className="absolute z-30 pointer-events-none"
            style={{
              left: `${mapPoint(activeHotspot.x, activeHotspot.y).x}%`,
              top: `${mapPoint(activeHotspot.x, activeHotspot.y).y}%`,
              transform: 'translate(-50%, calc(-100% - 16px))',
            }}
          >
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.95 }}
              transition={{ type: 'spring', stiffness: 300, damping: 20 }}
              className="pointer-events-auto"
              onClick={e => e.stopPropagation()}
            >
              <div className="bg-white rounded-2xl shadow-2xl overflow-hidden w-64">
              {/* Building name */}
              <div className="px-5 pt-5 pb-4 text-center">
                <p className="text-xs text-gray-400 uppercase tracking-widest mb-1">
                  {project.name}
                </p>
                <h3 className="text-xl font-bold text-gray-900">
                  {building.name}
                </h3>
                <p className="text-sm text-gray-500 mt-1">
                  {building.totalFloors} pisos · {project.amenities.slice(0, 2).join(' · ')}
                </p>
              </div>
              {/* Ingresar button */}
              <div className="px-5 pb-5">
                <button
                  onClick={handleEnterBuilding}
                  className="w-full py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-600 text-white font-semibold text-sm transition-colors duration-200"
                >
                  Ingresar
                </button>
              </div>
              {/* Caret */}
              <div className="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0 border-x-8 border-x-transparent border-t-8 border-t-white" />
            </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── Tutorial Hint ──────────────────────────────────────── */}
      <AnimatePresence>
        {showTutorial && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.5, delay: 1 }}
            className="absolute top-28 left-1/2 -translate-x-1/2 z-40 pointer-events-none"
          >
            <div className="bg-white/90 backdrop-blur-md text-gray-800 px-6 py-3 rounded-full shadow-2xl font-medium text-sm flex items-center gap-3 border border-white/40">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
              </span>
              Selecciona un edificio para explorar
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Top bar ────────────────────────────────────────────── */}
      <motion.div
        initial="hidden"
        animate="visible"
        variants={{
          hidden: { opacity: 0 },
          visible: {
            opacity: 1,
            transition: { staggerChildren: 0.15 }
          }
        }}
        className="absolute top-0 left-0 right-0 z-40 flex items-center justify-between px-6 pt-6"
      >
        {/* Left: Branding & Controls */}
        <motion.div variants={{ hidden: { opacity: 0, y: -20 }, visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: 'easeOut' } } }} className="flex items-center gap-6">
          <div className="flex items-center gap-3">
            {/* Logo placeholder */}
            <div className="w-10 h-10 rounded-xl bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center text-white font-bold text-xl shadow-lg">
              R
            </div>
            <div>
              <h1 className="text-white font-bold text-lg leading-tight tracking-wide drop-shadow-md">{project.name}</h1>
              <p className="text-white/80 text-xs font-medium tracking-widest uppercase drop-shadow-md">{project.location}</p>
            </div>
          </div>
        </motion.div>


      </motion.div>

      {/* ── Slide navigation arrows ────────────────────────────── */}
      <button
        onClick={e => { e.stopPropagation(); goPrev(); }}
        className="absolute left-4 top-1/2 -translate-y-1/2 z-40 w-10 h-10 rounded-full bg-white/90 hover:bg-white shadow-lg flex items-center justify-center text-gray-800 transition-all hover:scale-110"
        aria-label="Vista anterior"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
        </svg>
      </button>
      <button
        onClick={e => { e.stopPropagation(); goNext(); }}
        className="absolute right-4 top-1/2 -translate-y-1/2 z-40 w-10 h-10 rounded-full bg-white/90 hover:bg-white shadow-lg flex items-center justify-center text-gray-800 transition-all hover:scale-110"
        aria-label="Vista siguiente"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
        </svg>
      </button>

      {/* ── Bottom: slide label + dots + "Giro 360" hint ─────── */}
      <div className="absolute bottom-5 right-5 z-40 flex flex-col items-end gap-3">
        {/* Slide label */}
        <div className="bg-white/90 backdrop-blur-sm rounded-full px-3 py-1 text-xs font-medium text-gray-600">
          {slide.label}
        </div>

        {/* Slide dots */}
        <div className="flex items-center gap-1.5">
          {project.aerialSlides.map((_, i) => (
            <button
              key={i}
              onClick={e => { e.stopPropagation(); setCurrentSlide(i); setActiveHotspot(null); }}
              className={`rounded-full transition-all duration-200 ${i === currentSlide ? 'w-6 h-2 bg-white' : 'w-2 h-2 bg-white/50 hover:bg-white/80'}`}
              aria-label={`Vista ${i + 1}`}
            />
          ))}
        </div>
      </div>

    </div>
  );
}

// ── Reusable small components ────────────────────────────────────
function ControlBtn({ title, onClick, children }: { title: string; onClick?: () => void; children: React.ReactNode }) {
  return (
    <button
      title={title}
      onClick={onClick}
      className="w-9 h-9 rounded-full bg-white/90 hover:bg-white shadow flex items-center justify-center text-gray-700 transition-all hover:scale-105"
    >
      {children}
    </button>
  );
}

function PillBtn({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="px-4 py-2 rounded-full bg-white/90 hover:bg-white shadow text-gray-800 text-sm font-medium transition-all hover:scale-105"
    >
      {label}
    </button>
  );
}
