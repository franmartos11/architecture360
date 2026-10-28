'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { m as motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import type { Project, AerialSlide, AerialHotspot } from '@/types';
import { shimmerDataUrl } from '@/lib/imagePlaceholder';
import { TransitionLink as Link } from '@/components/ui/TransitionUtils';
import { useProjectBasePath } from '@/lib/project-base-path-context';
import { getProjectTypeConfig } from '@/lib/project-types';

import { pluralize } from '@/lib/units';
import { useProjectNav } from '@/lib/project-nav-context';
import { placePopover } from '@/lib/popover-placement';
interface AerialViewProps {
  project: Project;
}

export default function AerialView({ project }: AerialViewProps) {
  const basePath = useProjectBasePath();
  // Dentro del sitio del proyecto la barra global reemplaza a la barra
  // propia de la vista, que solo queda fuera de él.
  const inSite = !!useProjectNav();
  const router = useRouter();
  const typeConfig = getProjectTypeConfig(project.projectType, project.saleMode);
  // "casa": es UNA sola, así que el chip de arriba lleva directo a ella y
  // se llama como la casa, no "Unidades" (una lista de 1).
  const singleUnit = !typeConfig.hasUnitStep && project.units[0]
    ? { href: `${basePath}/edificio/${project.units[0].buildingId}/unidad/${project.units[0].id}`, label: typeConfig.unitLabel }
    : null;
  const [currentSlide, setCurrentSlide] = useState(0);
  const [activeHotspot, setActiveHotspot] = useState<AerialHotspot | null>(null);
  const [hoveredBuildingId, setHoveredBuildingId] = useState<string | null>(null);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [userInteracted, setUserInteracted] = useState(false);

  // ── Bloqueo de interacción hasta que cargue el medio y la animación ──
  // Ambas condiciones deben cumplirse para habilitar hover/click en hotspots.
  const [mediaLoaded, setMediaLoaded] = useState(false);
  const [animationDone, setAnimationDone] = useState(false);
  const isReady = mediaLoaded && animationDone;

  // Si no se cargó ninguna vista aérea/frontal como slide propio pero sí
  // hay una imagen de masterplan, se arma un slide sintético a partir de
  // ella con un pin por cada edificio (para una casa: un pin al centro,
  // que lleva a la casa). Antes esto era una pantalla vacía sin salida.
  const slides: AerialSlide[] = project.aerialSlides.length > 0
    ? project.aerialSlides
    : project.masterplanImage
      ? [{
          id: 'masterplan-fallback',
          imageUrl: project.masterplanImage,
          label: '',
          hotspots: project.buildings.map((b, i) => ({
            buildingId: b.id,
            x: project.buildings.length === 1 ? 50 : (100 / (project.buildings.length + 1)) * (i + 1),
            y: 55,
          })),
        }]
      : [];

  const slide: AerialSlide | undefined = slides[currentSlide];

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
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 });
  // Alto real de la tarjeta de la torre (lo mide su ref), para ubicarla
  // donde entre completa — ver placePopover.
  const [popupH, setPopupH] = useState(190);
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
    setMediaLoaded(true);
  }, []);

  const handleVideoLoad = useCallback((e: React.SyntheticEvent<HTMLVideoElement>) => {
    const video = e.currentTarget;
    setNaturalSize({ w: video.videoWidth, h: video.videoHeight });
    setMediaLoaded(true);
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

  // Reset interacción al cambiar de slide — ajustado durante el render
  // (no en un efecto) comparando contra el valor anterior de currentSlide,
  // como recomienda la doc de React para "adjusting state on a prop change".
  const [prevSlideForReset, setPrevSlideForReset] = useState(currentSlide);
  if (currentSlide !== prevSlideForReset) {
    setPrevSlideForReset(currentSlide);
    setMediaLoaded(false);
    setAnimationDone(false);
    setHoveredBuildingId(null);
  }

  // Autoplay carousel
  useEffect(() => {
    if (userInteracted || activeHotspot || slides.length === 0) return;
    const interval = setInterval(() => {
      setCurrentSlide(i => (i + 1) % slides.length);
    }, 5000);
    return () => clearInterval(interval);
  }, [userInteracted, activeHotspot, slides.length]);

  // Close popup on click outside
  const handleBackgroundClick = useCallback(() => {
    setActiveHotspot(null);
  }, []);

  // Navigate to building floor plan — o directo a la casa si es tipo "casa".
  const handleEnterBuilding = useCallback(() => {
    if (!activeHotspot) return;
    setIsTransitioning(true);
    setTimeout(() => {
      router.push(singleUnit ? singleUnit.href : `${basePath}/edificio/${activeHotspot.buildingId}`);
    }, 500);
  }, [activeHotspot, basePath, router, singleUnit]);

  // Prev/Next slide
  const goNext = useCallback(() => {
    setUserInteracted(true);
    setActiveHotspot(null);
    setCurrentSlide(i => (i + 1) % slides.length);
  }, [slides.length]);

  const goPrev = useCallback(() => {
    setUserInteracted(true);
    setActiveHotspot(null);
    setCurrentSlide(i => (i - 1 + slides.length) % slides.length);
  }, [slides.length]);

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

  // Swipe navigation (mobile) — umbral horizontal para no interferir con
  // el tap sobre un hotspot ni con el scroll vertical de la página.
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const t = e.touches[0];
    touchStartRef.current = { x: t.clientX, y: t.clientY };
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    const start = touchStartRef.current;
    touchStartRef.current = null;
    if (!start) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      if (dx < 0) goNext(); else goPrev();
    }
  }, [goNext, goPrev]);

  // Sin vista aérea cargada (proyecto nuevo, o el índice cayó fuera de
  // rango) no hay nada que mostrar acá — antes esto devolvía null y dejaba
  // una pantalla en blanco sin salida, que un visitante lee como que la
  // página se quedó colgada cargando. Va después de todos los hooks (y no
  // donde se calcula `slide`) porque los hooks de React no pueden quedar
  // atrás de un return condicional.
  if (!slide) {
    const aerialLower = getProjectTypeConfig(project.projectType, project.saleMode).aerialLabel.toLowerCase();
    return (
      <div className="w-full min-h-screen flex flex-col items-center justify-center gap-4 bg-white px-4 text-center">
        <p className="text-gray-400 text-sm">Todavía no hay {aerialLower} cargada para este proyecto.</p>
        <Link href={basePath || '/'} className="text-sm font-medium text-brand-600 hover:text-brand-700">
          ← Volver a {project.name}
        </Link>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`relative w-full h-[calc(100dvh-4rem)] overflow-hidden bg-black transition-all duration-500 ${isTransitioning ? 'scale-110 opacity-0' : 'scale-100 opacity-100'}`}
      onClick={handleBackgroundClick}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
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
          onAnimationComplete={(def) => {
            // Solo en la animación de entrada (animate), no en exit
            if (def === 'animate' || (typeof def === 'object' && 'opacity' in (def as object))) {
              setAnimationDone(true);
            }
          }}
        >
          {slide.videoUrl ? (
            <video
              key={slide.videoUrl}
              src={slide.videoUrl}
              poster={slide.imageUrl}
              className="absolute inset-0 w-full h-full object-cover"
              autoPlay
              muted
              loop
              playsInline
              onLoadedMetadata={handleVideoLoad}
            />
          ) : (
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
          )}
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
          style={{ pointerEvents: isReady ? 'auto' : 'none' }}
        >
          {slide.hotspots.filter(h => h.polygon && h.polygon.length > 0).map(hotspot => {
            const isActive = activeHotspot?.buildingId === hotspot.buildingId;
            const isHovered = isReady && hoveredBuildingId === hotspot.buildingId;
            return (
              <polygon
                key={hotspot.buildingId}
                points={hotspot.polygon!.map(p => { const m = mapPoint(p.x, p.y); return `${m.x},${m.y}`; }).join(' ')}
                fill={isActive ? 'rgba(255,255,255,0.16)' : isHovered ? 'rgba(255,255,255,0.08)' : 'transparent'}
                stroke={isActive || isHovered ? 'rgba(255,255,255,0.85)' : 'transparent'}
                strokeWidth={isActive ? 1.5 : 1}
                vectorEffect="non-scaling-stroke"
                style={{ cursor: isReady ? 'pointer' : 'default', transition: 'fill 0.25s ease-out, stroke 0.25s ease-out, stroke-width 0.25s ease-out' }}
                onMouseEnter={() => { if (isReady) setHoveredBuildingId(hotspot.buildingId); }}
                onMouseLeave={() => { if (isReady) setHoveredBuildingId(null); }}
                onClick={e => {
                  if (!isReady) return;
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
            className="absolute z-20 group flex items-center justify-center w-11 h-11"
            style={{
              left: `${pos.x}%`,
              top: `${pos.y}%`,
              transform: 'translate(-50%, -50%)',
              pointerEvents: isReady ? 'auto' : 'none',
            }}
            onClick={e => {
              if (!isReady) return;
              e.stopPropagation();
              setActiveHotspot(isActive ? null : hotspot);
            }}
            aria-label={`Seleccionar ${b?.name}`}
          >
            {/* Outer pulse ring — sized to match the dot, not the larger touch target */}
            <span className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-5 h-5 rounded-full animate-ping opacity-40 ${isActive ? 'bg-white scale-150' : 'bg-white/70'}`} />
            {/* Dot */}
            <span className={`relative flex w-5 h-5 rounded-full border-2 transition-all duration-200 ${isActive ? 'bg-white border-white scale-125' : isReady ? 'bg-black/70 border-white group-hover:bg-white/80 group-hover:scale-110' : 'bg-black/70 border-white'}`} />
            {/* Nombre de la torre: un círculo solo no decía que se podía tocar
                ni qué era. Es parte del botón, así que también se toca. */}
            {!isActive && b?.name && (
              <span className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 whitespace-nowrap px-2.5 py-1 rounded-full bg-black/70 backdrop-blur-sm text-white text-xs font-semibold shadow-lg">
                {b.name}
              </span>
            )}
          </button>
        );
      })}

      {/* ── Building popup ─────────────────────────────────────── */}
      <AnimatePresence>
        {activeHotspot && building && (() => {
          const anchor = mapPoint(activeHotspot.x, activeHotspot.y);
          const place = placePopover({
            anchorX: (anchor.x / 100) * containerSize.w,
            anchorY: (anchor.y / 100) * containerSize.h,
            width: 256,
            height: popupH,
            containerW: containerSize.w,
            containerH: containerSize.h,
          });
          return (
          <div
            className="absolute z-30 pointer-events-none"
            style={{ left: place.left, top: place.top }}
          >
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.95 }}
              transition={{ type: 'spring', stiffness: 300, damping: 20 }}
              className="pointer-events-auto"
              onClick={e => e.stopPropagation()}
            >
              <div
                ref={el => { if (el && el.offsetHeight !== popupH) setPopupH(el.offsetHeight); }}
                className="relative bg-white rounded-2xl shadow-2xl w-64"
              >
              {/* Building name */}
              <div className="px-5 pt-5 pb-4 text-center">
                {/* El proyecto arriba solo si no se llama igual que la torre
                    (Torre I / Torre I repetía lo mismo). */}
                {project.name.trim().toLowerCase() !== building.name.trim().toLowerCase() && (
                  <p className="text-xs text-gray-500 uppercase tracking-widest mb-1">
                    {project.name}
                  </p>
                )}
                <h3 className="text-xl font-bold text-gray-900">
                  {building.name}
                </h3>
                <p className="text-sm text-gray-500 mt-1">
                  {[
                    typeConfig.hasFloorStep ? `${building.totalFloors} pisos` : null,
                    project.amenities.length > 0
                      ? project.amenities
                          .filter(a => !a.buildingId || a.buildingId === building.id)
                          .slice(0, 2)
                          .map(a => a.name)
                          .join(' · ')
                      : null,
                  ].filter(Boolean).join(' · ')}
                </p>
              </div>
              {/* Ingresar button */}
              <div className="px-5 pb-5">
                <button
                  onClick={handleEnterBuilding}
                  className="w-full h-11 rounded-xl bg-[var(--theme-accent)] hover:opacity-85 text-[var(--theme-text-on-accent)] font-semibold text-sm transition-opacity duration-200"
                >
                  {typeConfig.hasFloorStep ? 'Ver plantas' : 'Ver el plano'}
                </button>
              </div>
              {/* Flecha hacia el pin, del lado donde quedó la tarjeta. */}
              {place.caretOffset != null && place.side === 'above' && (
                <div className="absolute -translate-x-1/2 top-full w-0 h-0 border-x-8 border-x-transparent border-t-8 border-t-white" style={{ left: place.caretOffset }} />
              )}
              {place.caretOffset != null && place.side === 'below' && (
                <div className="absolute -translate-x-1/2 bottom-full w-0 h-0 border-x-8 border-x-transparent border-b-8 border-b-white" style={{ left: place.caretOffset }} />
              )}
              {place.caretOffset != null && place.side === 'right' && (
                <div className="absolute -translate-y-1/2 right-full w-0 h-0 border-y-8 border-y-transparent border-r-8 border-r-white" style={{ top: place.caretOffset }} />
              )}
              {place.caretOffset != null && place.side === 'left' && (
                <div className="absolute -translate-y-1/2 left-full w-0 h-0 border-y-8 border-y-transparent border-l-8 border-l-white" style={{ top: place.caretOffset }} />
              )}
            </div>
            </motion.div>
          </div>
          );
        })()}
      </AnimatePresence>

      {/* ── Top bar — solo fuera del sitio del proyecto ──────────── */}
      {!inSite && (
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
        className="absolute top-0 left-0 right-0 z-40 flex items-center justify-between gap-2 px-3 sm:px-6 pt-3 sm:pt-6"
      >
        {/* Left: Branding & Controls */}
        <motion.div variants={{ hidden: { opacity: 0, y: -20 }, visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: 'easeOut' } } }} className="min-w-0 flex-1 flex items-center gap-6">
          {/* Nombre del proyecto → inicio del sitio (sin la nav global, es el
              camino de vuelta más obvio). */}
          <Link href={basePath || '/'} className="min-w-0 rounded-lg focus-visible:outline-2 focus-visible:outline-white" title={`Ir al inicio de ${project.name}`}>
            <h1 className="text-white font-bold text-sm sm:text-lg leading-tight tracking-wide drop-shadow-md truncate">{project.name}</h1>
            <p className="text-white/80 text-[10px] sm:text-xs font-medium tracking-widest uppercase drop-shadow-md truncate">{project.location}</p>
          </Link>
        </motion.div>

        {/* Right: Unidades / Amenities / Ubicación */}
        <motion.div
          variants={{ hidden: { opacity: 0, y: -20 }, visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: 'easeOut' } } }}
          onClick={e => e.stopPropagation()}
          className="flex items-center gap-1.5 sm:gap-3 shrink-0"
        >
          {(singleUnit || project.units.length > 0) && (
            <Link
              href={singleUnit ? singleUnit.href : `${basePath}/unidades`}
              aria-label={singleUnit ? singleUnit.label : `${pluralize(typeConfig.unitLabel)}`}
              className="flex items-center gap-2 bg-white/10 backdrop-blur-md border border-white/20 hover:bg-white/20 text-white text-sm font-medium p-2.5 sm:px-4 sm:py-2.5 rounded-xl transition-colors shadow-lg"
            >
              <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" />
              </svg>
              <span className="hidden sm:inline">{singleUnit ? singleUnit.label : `${pluralize(typeConfig.unitLabel)}`}</span>
            </Link>
          )}
          {project.amenities.length > 0 && (
            <Link
              href={`${basePath}/amenities`}
              aria-label="Amenities"
              className="flex items-center gap-2 bg-white/10 backdrop-blur-md border border-white/20 hover:bg-white/20 text-white text-sm font-medium p-2.5 sm:px-4 sm:py-2.5 rounded-xl transition-colors shadow-lg"
            >
              <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 4.5l7.5 7.5-7.5 7.5m-6-15l7.5 7.5-7.5 7.5" />
              </svg>
              <span className="hidden sm:inline">Amenities</span>
            </Link>
          )}
          {project.pointsOfInterest.length > 0 && (
            <Link
              href={`${basePath}/ubicacion`}
              aria-label="Ubicación"
              className="flex items-center gap-2 bg-white/10 backdrop-blur-md border border-white/20 hover:bg-white/20 text-white text-sm font-medium p-2.5 sm:px-4 sm:py-2.5 rounded-xl transition-colors shadow-lg"
            >
              <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
              </svg>
              <span className="hidden sm:inline">Ubicación</span>
            </Link>
          )}
        </motion.div>
      </motion.div>
      )}

      {/* ── Controles de la escena: un solo grupo abajo al centro —
          flechas, nombre del ángulo y puntos. Con un solo ángulo no hay a
          dónde ir: las flechas no hacían nada, así que no se muestran. ── */}
      {slides.length > 1 && (
      <div
        onClick={e => e.stopPropagation()}
        className="absolute bottom-4 sm:bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-1 p-1.5 rounded-2xl bg-[#121312]/[.76] backdrop-blur-md border border-white/[.14]"
      >
        <button
          onClick={goPrev}
          className="w-11 h-11 rounded-[10px] flex items-center justify-center text-white bg-white/[.08] hover:bg-white/15 transition-colors"
          aria-label="Ángulo anterior"
        >
          <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m15 6-6 6 6 6" />
          </svg>
        </button>
        <div className="flex flex-col items-center gap-1.5 px-3 sm:px-[18px] min-w-[120px] sm:min-w-[150px]">
          <span className="text-[13px] sm:text-sm font-semibold text-white whitespace-nowrap" aria-live="polite">{slide.label}</span>
          {slides.length > 1 && (
            <span className="flex items-center gap-[5px]">
              {slides.map((s, i) => (
                <button
                  key={s.id}
                  onClick={() => { setCurrentSlide(i); setActiveHotspot(null); }}
                  className={`h-1 rounded-sm transition-all duration-200 ${i === currentSlide ? 'w-4 bg-white' : 'w-1 bg-white/40 hover:bg-white/70'}`}
                  aria-label={`${s.label} (${i + 1} de ${slides.length})`}
                  aria-current={i === currentSlide ? 'true' : undefined}
                />
              ))}
            </span>
          )}
        </div>
        <button
          onClick={goNext}
          className="w-11 h-11 rounded-[10px] flex items-center justify-center text-white bg-white/[.08] hover:bg-white/15 transition-colors"
          aria-label="Ángulo siguiente"
        >
          <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m9 6 6 6-6 6" />
          </svg>
        </button>
      </div>
      )}

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
