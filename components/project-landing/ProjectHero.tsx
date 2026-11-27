'use client';

import { useLayoutEffect, useRef, useState, useId } from 'react';
import Image from 'next/image';
import { m, useScroll, useTransform, useReducedMotion, transform, type MotionValue } from 'framer-motion';
import { shimmerDataUrl } from '@/lib/imagePlaceholder';
import { EASE_OUT } from '@/lib/motion';
import { Container, Pill } from './ui';
import { useT } from '@/lib/i18n/client';

import type { WebTemplateKey } from '@/types';

// Valor de la prop de next/image, no texto (el guardián de i18n mira los placeholder escritos a mano).
const BLUR = 'blur' as const;

interface ProjectHeroProps {
  name: string;
  image: string;
  /** Variante de diseño (de lib/web-templates.ts). Por defecto "inmersiva". */
  variant?: WebTemplateKey;
  /** Chip corto arriba del título en las variantes Comercial y Editorial. */
  badge?: string;
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
  /** PDF del brief: link discreto al lado de los botones (abre en otra pestaña). */
  briefUrl?: string;
  /** En el modal de vista previa del admin evita los 230svh de scroll. */
  previewCompact?: boolean;
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
export default function ProjectHero(props: ProjectHeroProps) {
  if (props.variant === 'comercial') return <ComercialHero {...props} />;
  if (props.variant === 'editorial') return <EditorialHero {...props} />;
  return <InmersivaHero {...props} />;
}

function HeroBriefLink({ briefUrl }: { briefUrl: string }) {
  const t = useT();
  return (
    <a
      href={briefUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-2 h-[52px] px-2 text-sm sm:text-[15px] font-semibold text-[var(--theme-text)] underline-offset-4 decoration-1 hover:underline focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-[var(--theme-accent)] rounded-full"
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 4v11m0 0l-4.5-4.5M12 15l4.5-4.5M5 19h14" />
      </svg>
      {t('sitio.menu.descargarBrief')}
    </a>
  );
}

function ComercialHero({ name, image, badge, tagline, meta, primary, secondary, progress, briefUrl }: ProjectHeroProps) {
  const reduce = useReducedMotion();
  const t = useT();
  const enter = (delay = 0) =>
    reduce
      ? {}
      : {
          initial: { opacity: 0, y: 14 },
          animate: { opacity: 1, y: 0 },
          transition: { duration: 0.36, delay, ease: EASE_OUT },
        };

  return (
    <header className="pt-28 pb-14 sm:pt-32 sm:pb-20 bg-[var(--theme-bg)] border-b border-[var(--theme-border)]">
      <Container className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.08fr)] lg:items-center">
        <div className="flex flex-col gap-5">
          {badge && (
            <m.span {...enter(0)} className="self-start inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-[var(--theme-surface)] border border-[var(--theme-border)] text-[var(--theme-text)]">
              <span aria-hidden="true" className="w-2 h-2 rounded-full bg-[var(--theme-accent)] motion-safe:animate-pulse" />
              {badge}
            </m.span>
          )}
          <m.h1 {...enter(0.05)} className="m-0 font-[family-name:var(--theme-font-heading)] text-[clamp(38px,5.2vw,68px)] leading-[0.98] font-bold tracking-[-0.035em] text-[var(--theme-text)] text-balance">
            {name}
          </m.h1>
          {(tagline || meta) && (
            <m.div {...enter(0.1)} className="flex flex-col gap-2 max-w-[560px]">
              {tagline && (
                <p className="m-0 text-lg sm:text-[21px] leading-[1.35] font-medium text-[var(--theme-text)]">
                  {tagline}
                </p>
              )}
              {meta && (
                <p className="m-0 text-sm sm:text-base text-[var(--theme-text-muted)]">
                  {meta}
                </p>
              )}
            </m.div>
          )}
          {progress && (
            <m.div {...enter(0.14)}>
              <HeroProgressLink {...progress} />
            </m.div>
          )}
          {(primary || secondary || briefUrl) && (
            <m.div {...enter(0.18)} className="flex gap-2.5 flex-wrap items-center pt-1">
              {primary && <Pill href={primary.href} arrow size="lg">{primary.label}</Pill>}
              {secondary && <Pill href={secondary.href} variant="ghost" size="lg">{secondary.label}</Pill>}
              {briefUrl && <HeroBriefLink briefUrl={briefUrl} />}
            </m.div>
          )}
        </div>

        <m.div
          initial={reduce ? false : { opacity: 0, scale: 0.965 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={reduce ? { duration: 0 } : { duration: 0.5, delay: 0.08, ease: EASE_OUT }}
          className="group relative aspect-[16/11] w-full overflow-hidden rounded-[var(--theme-radius)] border border-[var(--theme-border)] bg-[var(--theme-surface)] shadow-sm"
        >
          <Image
            src={image}
            alt={t('sitio.hero.render', { nombre: name })}
            fill
            sizes="(min-width: 1024px) 52vw, 100vw"
            placeholder={BLUR}
            blurDataURL={shimmerDataUrl(1920, 1080)}
            className="object-cover transition-transform duration-700 ease-out motion-safe:group-hover:scale-[1.03]"
            priority
          />
        </m.div>
      </Container>
    </header>
  );
}

function EditorialHero({ name, image, badge, tagline, meta, primary, secondary, progress, briefUrl }: ProjectHeroProps) {
  const reduce = useReducedMotion();
  const t = useT();

  return (
    <header className="pt-28 pb-12 sm:pt-36 sm:pb-16 bg-[var(--theme-bg)]">
      <Container className="flex flex-col gap-8">
        <div className="flex flex-col gap-4 pb-8 relative">
          <m.div
            initial={reduce ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={reduce ? { duration: 0 } : { duration: 0.6, ease: EASE_OUT }}
            className="flex items-center justify-between gap-4 flex-wrap text-xs font-semibold uppercase tracking-[0.14em] text-[var(--theme-text-muted)]"
          >
            <span>{meta || name}</span>
            {badge && <span className="text-[var(--theme-accent)]">{badge}</span>}
          </m.div>
          <m.h1
            initial={reduce ? false : { opacity: 0, y: 26 }}
            animate={{ opacity: 1, y: 0 }}
            transition={reduce ? { duration: 0 } : { duration: 0.72, delay: 0.08, ease: EASE_OUT }}
            className="m-0 font-[family-name:var(--theme-font-heading)] text-[clamp(44px,7vw,104px)] leading-[0.94] font-medium tracking-[-0.04em] text-[var(--theme-text)] text-balance"
          >
            {name}
          </m.h1>
          <m.div
            initial={reduce ? false : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={reduce ? { duration: 0 } : { duration: 0.68, delay: 0.18, ease: EASE_OUT }}
            className="flex flex-wrap items-end justify-between gap-6 pt-2"
          >
            <div className="flex flex-col gap-2 max-w-[600px]">
              {tagline && (
                <p className="m-0 text-lg sm:text-[22px] leading-[1.35] text-[var(--theme-text-muted)]">
                  {tagline}
                </p>
              )}
              {progress && <HeroProgressLink {...progress} />}
            </div>
            {(primary || secondary || briefUrl) && (
              <div className="flex gap-2.5 flex-wrap items-center">
                {primary && <Pill href={primary.href} variant="ghost" arrow size="md">{primary.label}</Pill>}
                {secondary && <Pill href={secondary.href} variant="ghost" size="md">{secondary.label}</Pill>}
                {briefUrl && <HeroBriefLink briefUrl={briefUrl} />}
              </div>
            )}
          </m.div>
          <m.div
            aria-hidden="true"
            initial={reduce ? false : { scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={reduce ? { duration: 0 } : { duration: 0.8, delay: 0.2, ease: EASE_OUT }}
            className="absolute inset-x-0 bottom-0 h-px bg-[var(--theme-border)] origin-left"
          />
        </div>

        <m.div
          initial={reduce ? false : { clipPath: 'inset(0 0 18% 0)', opacity: 0.4 }}
          animate={{ clipPath: 'inset(0 0 0% 0)', opacity: 1 }}
          transition={reduce ? { duration: 0 } : { duration: 0.95, delay: 0.16, ease: EASE_OUT }}
          className="relative aspect-[16/9] sm:aspect-[21/9] w-full overflow-hidden rounded-[var(--theme-radius)] border border-[var(--theme-border)] bg-[var(--theme-surface)]"
        >
          <m.div
            initial={reduce ? false : { scale: 1.07 }}
            animate={{ scale: 1 }}
            transition={reduce ? { duration: 0 } : { duration: 1.15, delay: 0.16, ease: EASE_OUT }}
            className="w-full h-full relative"
          >
            <Image
              src={image}
              alt={t('sitio.hero.render', { nombre: name })}
              fill
              sizes="100vw"
              placeholder={BLUR}
              blurDataURL={shimmerDataUrl(1920, 1080)}
              className="object-cover"
              priority
            />
          </m.div>
        </m.div>
      </Container>
    </header>
  );
}

function InmersivaHero({ name, image, tagline, meta, primary, secondary, progress, briefUrl, previewCompact = false }: ProjectHeroProps) {
  const ref = useRef<HTMLElement>(null);
  const textRef = useRef<SVGTextElement>(null);
  const maskId = `hero-mask-${useId().replace(/:/g, '')}`;
  const reduce = useReducedMotion();
  const t = useT();

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
    <header ref={ref} className={`relative ${previewCompact ? 'h-[660px]' : reduce ? 'h-[100svh]' : 'h-[230svh]'}`}>
      <div className={`${previewCompact ? 'relative h-full' : 'sticky top-0 h-[100svh]'} overflow-hidden bg-[var(--theme-bg)]`}>
        <m.div className="absolute inset-0" style={reduce ? undefined : { scale: photoScale }}>
          <Image
            src={image}
            alt={t('sitio.hero.render', { nombre: name })}
            fill
            sizes="100vw"
            placeholder={BLUR}
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
            {(primary || secondary || briefUrl) && (
              <div className="flex gap-2.5 flex-wrap items-center">
                {primary && <Pill href={primary.href} arrow size="lg">{primary.label}</Pill>}
                {secondary && <Pill href={secondary.href} variant="ghost" size="lg" className="bg-[var(--theme-bg)]">{secondary.label}</Pill>}
                {/* Más callado que los botones: no compite con el CTA principal. */}
                {briefUrl && (
                  <a
                    href={briefUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 h-[52px] px-2 text-sm sm:text-[15px] font-semibold text-[var(--theme-text)] underline-offset-4 decoration-1 hover:underline focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-[var(--theme-accent)] rounded-full"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M12 4v11m0 0l-4.5-4.5M12 15l4.5-4.5M5 19h14" />
                    </svg>
                    {t('sitio.menu.descargarBrief')}
                  </a>
                )}
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
