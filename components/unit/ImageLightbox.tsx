'use client';

import { useEffect, useState } from 'react';
import { m as motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import ModalPortal from '@/components/ui/ModalPortal';
import { BACKDROP, DIALOG_OUT, EASE_OUT, REDUCED_FADE, SWAP } from '@/lib/motion';

// Lightbox de imagen a pantalla completa con prev/next/contador — usado
// por la Galería de la unidad, las fotos de amenities y de ambientes, y la
// galería de proceso del proyecto.
//
// Al abrir, la foto sale DESDE la miniatura que se tocó (`originRect`) y
// crece hasta su lugar: así se entiende que es la misma imagen, más grande,
// y no una pantalla nueva. Es un FLIP a mano (sin layoutId, que no existe
// con LazyMotion+domAnimation): se calcula dónde va a quedar la foto, y el
// `initial` la pone encima de la miniatura con translate + scale, recortada
// con clip-path al mismo encuadre que tenía (la miniatura es object-cover,
// la foto grande object-contain). Al cerrar hace el camino inverso, salvo
// que la persona haya pasado a otra foto: esa no tiene miniatura a la que
// volver, y se va con un fundido.

/** Viaje miniatura → pantalla: un poco más largo que un modal, porque la
 *  foto recorre distancia; misma curva que todo el sitio. (Token local: no
 *  hay uno equivalente en lib/motion.ts.) */
const FLIP_IN = { duration: 0.34, ease: EASE_OUT } as const;
/** La vuelta a la miniatura: más corta, el cierre no hace esperar. */
const FLIP_OUT = { duration: 0.24, ease: EASE_OUT } as const;
/** Si la foto grande no está en caché a este tiempo, no se espera más: se
 *  abre con el fundido de siempre en vez de dejar la pantalla negra. */
const FLIP_WAIT_MS = 250;
/** Radio de la foto grande (rounded-2xl). */
const RADIUS = 16;

type Natural = { w: number; h: number } | 'fallback' | null;

interface FlipFrame {
  x: number;
  y: number;
  scale: number;
  clipPath: string;
}

/** Tamaño final de la foto (contain dentro de 90vw × 85vh, sin agrandarla
 *  más que su tamaño real — igual que max-w/max-h sobre un <img>) y el
 *  frame que la pone exactamente sobre la miniatura. */
function flipFrom(origin: DOMRect, nat: { w: number; h: number }) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const f = Math.min(1, (vw * 0.9) / nat.w, (vh * 0.85) / nat.h);
  const fw = nat.w * f;
  const fh = nat.h * f;
  // Escala que cubre la miniatura (como su object-cover)…
  const s = Math.max(origin.width / fw, origin.height / fh);
  // …y el recorte, en coordenadas de la foto sin escalar, que deja ver solo
  // lo que mostraba la miniatura.
  const insetX = Math.max(0, (fw - origin.width / s) / 2);
  const insetY = Math.max(0, (fh - origin.height / s) / 2);
  const frame: FlipFrame = {
    x: origin.left + origin.width / 2 - vw / 2,
    y: origin.top + origin.height / 2 - vh / 2,
    scale: s,
    clipPath: `inset(${insetY}px ${insetX}px ${insetY}px ${insetX}px round 0px)`,
  };
  return { size: { width: fw, height: fh }, frame };
}

/** El rect sirve si mide algo y todavía se ve en pantalla. */
function rectUsable(r: DOMRect | null | undefined): r is DOMRect {
  if (!r || r.width < 1 || r.height < 1) return false;
  return r.bottom > 0 && r.right > 0 && r.top < window.innerHeight && r.left < window.innerWidth;
}

export default function ImageLightbox({
  isOpen,
  images,
  index,
  onIndexChange,
  onClose,
  altPrefix = 'Imagen',
  originRect,
}: {
  isOpen: boolean;
  images: string[];
  index: number;
  onIndexChange: (index: number) => void;
  onClose: () => void;
  altPrefix?: string;
  /** Rect de la miniatura tocada (getBoundingClientRect al abrir). Sin él,
   *  la foto abre con un fundido. */
  originRect?: DOMRect | null;
}) {
  const open = isOpen && images.length > 0;
  return (
    <ModalPortal open={open}>
      <AnimatePresence>
        {open && (
          <LightboxBody
            key="lightbox"
            images={images}
            index={index}
            onIndexChange={onIndexChange}
            onClose={onClose}
            altPrefix={altPrefix}
            originRect={originRect ?? null}
          />
        )}
      </AnimatePresence>
    </ModalPortal>
  );
}

// Cuerpo montado solo mientras está abierto: así el índice con el que se
// abrió y el tamaño de la foto se toman una vez por apertura, sin resetear
// estado a mano.
function LightboxBody({
  images,
  index,
  onIndexChange,
  onClose,
  altPrefix,
  originRect,
}: {
  images: string[];
  index: number;
  onIndexChange: (index: number) => void;
  onClose: () => void;
  altPrefix: string;
  originRect: DOMRect | null;
}) {
  const reduced = !!useReducedMotion();
  const [openedAt] = useState(index);
  // Con movimiento reducido no hay viaje: ni siquiera hace falta medir.
  const [wantsFlip] = useState(() => !reduced && rectUsable(originRect));
  const [natural, setNatural] = useState<Natural>(wantsFlip ? null : 'fallback');

  // El tamaño real de la foto define dónde termina. Casi siempre ya está en
  // caché (es la que se veía en la miniatura) y responde enseguida.
  useEffect(() => {
    if (!wantsFlip) return;
    let done = false;
    const img = new window.Image();
    img.onload = () => {
      if (done) return;
      done = true;
      setNatural(img.naturalWidth > 0 ? { w: img.naturalWidth, h: img.naturalHeight } : 'fallback');
    };
    img.onerror = () => { if (!done) { done = true; setNatural('fallback'); } };
    img.src = images[openedAt];
    const t = window.setTimeout(() => { if (!done) { done = true; setNatural('fallback'); } }, FLIP_WAIT_MS);
    return () => { done = true; window.clearTimeout(t); };
  }, [wantsFlip, images, openedAt]);

  // Escape cierra (además de los atajos que tenga quien lo usa: llamar a
  // onClose dos veces es inofensivo).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Si la persona pasa a otra foto, la que se abrió ya no "sale" de la
  // miniatura al volver a ella: entra con el cambio de siempre. (Ajuste de
  // estado durante el render, el patrón de React para derivar de props.)
  const [navigated, setNavigated] = useState(false);
  if (!navigated && index !== openedAt) setNavigated(true);

  const flip = wantsFlip && originRect && natural && natural !== 'fallback'
    ? flipFrom(originRect, natural)
    : null;
  // Mientras se mide la foto (pocos ms), solo entra el fondo.
  const waiting = wantsFlip && natural === null;
  // Es la foto que se abrió: viaja desde su miniatura (solo la primera vez)
  // y vuelve a ella al cerrar.
  const flyIn = flip !== null && index === openedAt && !navigated;
  const flyBack = flip !== null && index === openedAt;
  const settled = { x: 0, y: 0, scale: 1, clipPath: `inset(0px 0px 0px 0px round ${RADIUS}px)`, opacity: 1 };

  const fade = reduced ? REDUCED_FADE : BACKDROP;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center" onClick={onClose}>
      <motion.div
        aria-hidden="true"
        className="absolute inset-0 bg-black/95"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0, transition: reduced ? REDUCED_FADE : DIALOG_OUT }}
        transition={fade}
      />

      {!waiting && (
        <motion.img
          key={index}
          src={images[index]}
          alt={`${altPrefix} ${index + 1}`}
          initial={
            flyIn && flip ? { ...flip.frame, opacity: 1 }
              // Prev/next (o abrir sin miniatura): el cambio de siempre.
              : reduced ? { opacity: 0 } : { opacity: 0, scale: 0.98 }
          }
          animate={flip ? settled : { opacity: 1, scale: 1 }}
          exit={
            flyBack && flip ? { ...flip.frame, opacity: 1, transition: FLIP_OUT }
              : { opacity: 0, transition: reduced ? REDUCED_FADE : DIALOG_OUT }
          }
          transition={flyIn ? FLIP_IN : reduced ? REDUCED_FADE : SWAP}
          // Con FLIP el tamaño final se fija en px (es el que se usó para
          // calcular el viaje); sin él, el contain de siempre.
          style={flip ? { width: flip.size.width, height: flip.size.height } : undefined}
          className={'relative object-contain rounded-2xl shadow-2xl' + (flip ? '' : ' max-w-[90vw] max-h-[85vh]')}
          onClick={e => e.stopPropagation()}
        />
      )}

      {/* Los controles acompañan al fondo, no a la foto. La capa no toma
          clics (el clic en el vacío cierra); los botones sí. */}
      <motion.div
        className="absolute inset-0 pointer-events-none [&>*]:pointer-events-auto"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0, transition: reduced ? REDUCED_FADE : DIALOG_OUT }}
        transition={fade}
      >
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
    </div>
  );
}
