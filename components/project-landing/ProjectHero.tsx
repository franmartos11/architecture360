'use client';

import { useLayoutEffect, useRef, useState, useId } from 'react';
import Image from 'next/image';
import { m, useScroll, useTransform, useReducedMotion, transform, type MotionValue } from 'framer-motion';
import { shimmerDataUrl } from '@/lib/imagePlaceholder';
import { Container, Pill } from './ui';

interface ProjectHeroProps {
  name: string;
  image: string;
  /** Frase principal del estado final (la bajada del proyecto). */
  tagline?: string;
  /** Datos atenuados al lado de la frase: ubicación · cantidad · precio desde. */
  meta?: string;
  primary?: { href: string; label: string };
  secondary?: { href: string; label: string };
  /**
   * Línea del avance de obra ("72% de avance · Terminaciones · Entrega
   * estimada diciembre 2027") que lleva a la sección. Solo cuando la
   * sección está en la landing; sin esto el hero queda como siempre.
   */
  progress?: { href: string; text: string };
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
 * Hero a pantalla completa: arranca con el nombre del proyecto con la foto
 * "metida" adentro de las letras (el resto con el color de fondo del tema)
 * y, al scrollear, las letras crecen hasta dejar la foto entera. La sección
 * mide ~2,3 pantallas y el contenido queda fijo (sticky) mientras dura.
 *
 * Sin movimiento (prefers-reduced-motion) queda fijo el nombre con la frase.
 */
export default function ProjectHero({ name, image, tagline, meta, primary, secondary, progress }: ProjectHeroProps) {
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
  // Arranca con el nombre (la foto adentro de las letras) y al scrollear las
  // letras crecen y se desvanecen hasta dejar la foto entera. El tramo final
  // queda quieto sobre la foto antes de pasar a la sección siguiente.
  const photoScale = useRamp(scrollYProgress, [0.1, 0.8], [1, 1.15]);
  const maskScale = useRamp(scrollYProgress, [0.1, 0.7], [1, 2.4]);
  const maskOpacity = useRamp(scrollYProgress, [0.45, 0.7], [1, 0]);
  const tagOpacity = useRamp(scrollYProgress, [0, 0.15], [1, 0]);
  const tagY = useRamp(scrollYProgress, [0, 0.15], [0, 24]);
  // Invisibles, los botones no tienen que seguir atrapando clics sobre la foto.
  const tagPointer = useTransform(tagOpacity, o => (o < 0.05 ? 'none' : 'auto'));

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

        <m.div
          style={reduce ? undefined : { opacity: tagOpacity, y: tagY, pointerEvents: tagPointer }}
          className="absolute inset-x-0 bottom-6 sm:bottom-10"
        >
          <Container className="flex flex-wrap gap-6 items-end justify-between">
            {(tagline || meta || progress) && (
              <div className="flex flex-col gap-3 max-w-[580px]">
                {(tagline || meta) && (
                  <p className="m-0 text-lg sm:text-[22px] leading-[1.3] font-medium tracking-[-0.01em] text-[var(--theme-text)]">
                    {tagline && <>{tagline.replace(/[.\s]+$/, '')}. </>}
                    {meta && <span className="text-[var(--theme-text-muted)]">{meta}</span>}
                  </p>
                )}
                {/* Para quien compra en pozo esto es el argumento: va arriba,
                    pero callado — un renglón, sin botón, con el punto de
                    "en curso" de la tira de etapas. */}
                {progress && <HeroProgressLink {...progress} />}
              </div>
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

/** El renglón del avance de obra del hero (exportado para el laboratorio). */
export function HeroProgressLink({ href, text }: { href: string; text: string }) {
  return (
    <a
      href={href}
      className="self-start inline-flex items-center gap-2.5 text-sm sm:text-[15px] font-medium text-[var(--theme-text)] no-underline hover:underline underline-offset-4 decoration-[var(--theme-text-muted)]"
    >
      <span aria-hidden="true" className="shrink-0 w-2 h-2 rounded-full bg-[var(--theme-accent)]" />
      {text}
    </a>
  );
}
