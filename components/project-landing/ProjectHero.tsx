'use client';

import { useLayoutEffect, useRef, useState, useId } from 'react';
import Image from 'next/image';
import { m, useScroll, useTransform, useReducedMotion, transform, type MotionValue } from 'framer-motion';
import { shimmerDataUrl } from '@/lib/imagePlaceholder';
import { Container, Pill } from './ui';

interface ProjectHeroProps {
  name: string;
  image: string;
  /** Línea chica del estado inicial, ej. "SALTA · EDIFICIO". */
  kicker?: string;
  /** Frase principal del estado final (la bajada del proyecto). */
  tagline?: string;
  /** Datos atenuados al lado de la frase: ubicación · cantidad · precio desde. */
  meta?: string;
  primary?: { href: string; label: string };
  secondary?: { href: string; label: string };
}

// Coordenadas del SVG de la máscara — el texto se dibuja sobre este lienzo
// y el SVG se escala al alto/ancho de la pantalla con `meet`.
const VB_W = 1600;
const VB_H = 900;
const MAX_TEXT_W = 1480;

// Divide un nombre largo en dos renglones parejos. "Torre I" queda en uno;
// "Residencial Los Álamos" en dos. Más de dos no: las letras quedarían tan
// finas que la foto ya no se lee adentro.
function splitName(name: string): string[] {
  const words = name.trim().split(/\s+/);
  if (name.length <= 12 || words.length < 2) return [name.trim()];
  let best = [name, ''];
  let bestDiff = Infinity;
  for (let i = 1; i < words.length; i++) {
    const a = words.slice(0, i).join(' ');
    const b = words.slice(i).join(' ');
    const diff = Math.abs(a.length - b.length);
    if (diff < bestDiff) { bestDiff = diff; best = [a, b]; }
  }
  return best;
}

// Tamaño estimado antes de medir (SSR y primer frame): ~0.56em por letra
// en una sans bold. Después de montar se mide el ancho real y se corrige.
function estimateFontSize(lines: string[]): number {
  const longest = Math.max(...lines.map(l => l.length), 1);
  const byWidth = MAX_TEXT_W / (longest * 0.56);
  const byHeight = (lines.length === 1 ? 430 : 600 / lines.length);
  return Math.min(430, byWidth, byHeight);
}

// useTransform con función en vez de rangos: con rangos, framer intenta
// acelerar opacity con ScrollTimeline nativo y, con `target`, lo mapea mal
// (la opacidad quedaba clavada en su valor inicial). Con función siempre
// corre en JS, que para 6 valores es nada.
function useRamp(v: MotionValue<number>, input: number[], output: number[]) {
  return useTransform(v, x => transform(x, input, output));
}

/**
 * Hero a pantalla completa: arranca con la foto entera y, al scrollear, la
 * foto queda "metida" adentro del nombre del proyecto — el resto se llena
 * con el color de fondo del tema. La sección mide ~2,3 pantallas y el
 * contenido queda fijo (sticky) mientras dura el efecto.
 *
 * Sin movimiento (prefers-reduced-motion) se muestra directo el estado final.
 */
export default function ProjectHero({ name, image, kicker, tagline, meta, primary, secondary }: ProjectHeroProps) {
  const ref = useRef<HTMLElement>(null);
  const textRef = useRef<SVGTextElement>(null);
  const maskId = `hero-mask-${useId().replace(/:/g, '')}`;
  const reduce = useReducedMotion();

  const lines = splitName(name);
  const [fontSize, setFontSize] = useState(() => estimateFontSize(lines));

  // Ajuste fino con la tipografía real del tema (cada desarrolladora elige
  // la suya; el ancho por letra varía mucho entre una condensada y una ancha).
  useLayoutEffect(() => {
    const el = textRef.current;
    if (!el) return;
    const fit = () => {
      const w = el.getBBox().width;
      if (w > 0) setFontSize(fs => Math.min(430 * (lines.length === 1 ? 1 : 0.7), fs * (MAX_TEXT_W / w)));
    };
    fit();
    document.fonts?.ready.then(fit).catch(() => {});
  }, [name, lines.length]);

  // Recorte horizontal del lienzo al ancho real del texto: en pantallas
  // verticales (mobile) `meet` queda limitado por el ancho, y sin esto el
  // nombre ocupaba apenas un tercio de la pantalla.
  const [textW, setTextW] = useState(MAX_TEXT_W);
  useLayoutEffect(() => {
    const w = textRef.current?.getBBox().width ?? 0;
    if (w > 0) setTextW(Math.min(MAX_TEXT_W, w));
  }, [fontSize]);
  const pad = 40;
  const viewBox = `${VB_W / 2 - textW / 2 - pad} 0 ${textW + pad * 2} ${VB_H}`;

  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end end'] });
  const photoScale = useRamp(scrollYProgress, [0, 0.7], [1.15, 1]);
  const maskScale = useRamp(scrollYProgress, [0, 0.12, 0.7], [2.4, 2.4, 1]);
  const maskOpacity = useRamp(scrollYProgress, [0, 0.12, 0.35], [0, 0, 1]);
  const introOpacity = useRamp(scrollYProgress, [0, 0.14], [1, 0]);
  const tagOpacity = useRamp(scrollYProgress, [0, 0.7, 0.88], [0, 0, 1]);
  const tagY = useRamp(scrollYProgress, [0, 0.7, 0.88], [24, 24, 0]);

  const lineHeight = fontSize * 0.92;
  // Baseline del primer renglón: el bloque queda apenas por encima del centro
  // para dejar lugar abajo a la frase y los botones.
  const firstBaseline = VB_H * 0.52 - ((lines.length - 1) * lineHeight) / 2 + fontSize * 0.34;

  return (
    <header ref={ref} className={`relative ${reduce ? 'h-[100svh]' : 'h-[230svh]'}`}>
      <div className="sticky top-0 h-[100svh] overflow-hidden bg-[var(--theme-bg)]">
        <m.div className="absolute inset-0" style={reduce ? undefined : { scale: photoScale }}>
          <Image
            src={image}
            alt={`Render de ${name}`}
            fill
            sizes="100vw"
            placeholder="blur"
            blurDataURL={shimmerDataUrl(1920, 1080)}
            className="object-cover object-[50%_45%]"
            priority
          />
        </m.div>

        <m.svg
          viewBox={viewBox}
          preserveAspectRatio="xMidYMid meet"
          aria-hidden="true"
          className="absolute inset-0 w-full h-full origin-[50%_52%] overflow-visible"
          style={reduce ? undefined : { scale: maskScale, opacity: maskOpacity }}
        >
          <defs>
            <mask id={maskId} maskUnits="userSpaceOnUse" x={-3000} y={-3000} width={7600} height={6900}>
              <rect x={-3000} y={-3000} width={7600} height={6900} fill="#fff" />
              <text
                ref={textRef}
                x={VB_W / 2}
                textAnchor="middle"
                fontWeight={700}
                fontSize={fontSize}
                letterSpacing={-fontSize * 0.045}
                fill="#000"
                style={{ fontFamily: 'var(--theme-font-heading)' }}
              >
                {lines.map((l, i) => (
                  <tspan key={i} x={VB_W / 2} y={firstBaseline + i * lineHeight}>{l}</tspan>
                ))}
              </text>
            </mask>
          </defs>
          <rect x={-3000} y={-3000} width={7600} height={6900} mask={`url(#${maskId})`} style={{ fill: 'var(--theme-bg)' }} />
        </m.svg>

        <h1 className="sr-only">{name}</h1>

        {!reduce && (
          <m.div
            style={{ opacity: introOpacity }}
            className="absolute inset-x-0 bottom-10 flex flex-col items-center gap-3.5 text-white [text-shadow:0_2px_16px_rgba(0,0,0,0.35)] pointer-events-none"
          >
            {kicker && <span className="px-4 text-center text-xs sm:text-sm font-semibold tracking-[0.2em]">{kicker}</span>}
            <span className="w-11 h-11 rounded-full border border-white/70 flex items-center justify-center" aria-hidden="true">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M6 13l6 6 6-6" /></svg>
            </span>
          </m.div>
        )}

        <m.div
          style={reduce ? undefined : { opacity: tagOpacity, y: tagY }}
          className="absolute inset-x-0 bottom-6 sm:bottom-10"
        >
          <Container className="flex flex-wrap gap-6 items-end justify-between">
            {(tagline || meta) && (
              <p className="m-0 max-w-[580px] text-lg sm:text-[22px] leading-[1.3] font-medium tracking-[-0.01em] text-[var(--theme-text)]">
                {tagline && <>{tagline.replace(/[.\s]+$/, '')}. </>}
                {meta && <span className="text-[var(--theme-text-muted)]">{meta}</span>}
              </p>
            )}
            {(primary || secondary) && (
              <div className="flex gap-2.5 flex-wrap">
                {primary && <Pill href={primary.href} arrow size="lg">{primary.label}</Pill>}
                {secondary && <Pill href={secondary.href} variant="ghost" size="lg" className="bg-[var(--theme-bg)]">{secondary.label}</Pill>}
              </div>
            )}
          </Container>
        </m.div>
      </div>
    </header>
  );
}
