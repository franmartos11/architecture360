import type { ReactNode } from 'react';
import { TransitionLink } from '@/components/ui/TransitionUtils';

// Piezas visuales compartidas por las secciones de la landing pública.
// Todo sale de las variables --theme-*: el diseño base es claro con tinta
// oscura, pero cada desarrolladora puede cambiar paleta, tipografía y
// radio desde /admin/sitio, así que nada de colores fijos acá.

export function ArrowIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

type PillVariant = 'dark' | 'ghost' | 'light';

const PILL_BASE =
  'group/pill inline-flex items-center gap-3 rounded-full text-sm sm:text-[15px] font-semibold no-underline transition-colors duration-300 focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-[var(--theme-accent)]';

const PILL_VARIANT: Record<PillVariant, string> = {
  // Tinta sobre fondo: --theme-text siempre contrasta con --theme-bg (invariante de los presets).
  dark: 'bg-[var(--theme-text)] text-[var(--theme-bg)] hover:opacity-90',
  ghost: 'border border-[var(--theme-border)] text-[var(--theme-text)] hover:bg-[var(--theme-text)]/5',
  // Para usar encima de un fondo oscuro (--theme-bg-alt).
  light: 'bg-[var(--theme-text-on-dark)] text-[var(--theme-bg-alt)] hover:opacity-90',
};

const ARROW_VARIANT: Record<PillVariant, string> = {
  dark: 'bg-[var(--theme-bg)] text-[var(--theme-text)]',
  ghost: 'bg-[var(--theme-text)] text-[var(--theme-bg)]',
  light: 'bg-[var(--theme-bg-alt)] text-[var(--theme-text-on-dark)]',
};

interface PillProps {
  href?: string;
  onClick?: () => void;
  type?: 'button' | 'submit';
  disabled?: boolean;
  variant?: PillVariant;
  /** Círculo con flecha a la derecha — los CTA principales lo llevan. */
  arrow?: boolean;
  size?: 'md' | 'lg';
  /** Ocupa todo el ancho y separa texto y flecha. */
  block?: boolean;
  className?: string;
  children: ReactNode;
}

export function Pill({ href, onClick, type = 'button', disabled, variant = 'dark', arrow = false, size = 'md', block = false, className = '', children }: PillProps) {
  const height = size === 'lg' ? 'h-[52px]' : 'h-12';
  const pad = arrow ? (size === 'lg' ? 'pl-6 pr-1.5' : 'pl-[22px] pr-1.5') : 'px-[22px]';
  const cls = `${PILL_BASE} ${PILL_VARIANT[variant]} ${height} ${pad} ${block ? 'w-full justify-between' : ''} ${className}`;
  const content = (
    <>
      <span>{children}</span>
      {arrow && (
        <span className={`${size === 'lg' ? 'w-10 h-10' : 'w-9 h-9'} shrink-0 rounded-full flex items-center justify-center transition-transform duration-[450ms] ease-[cubic-bezier(.2,.7,.2,1)] group-hover/pill:translate-x-1 ${ARROW_VARIANT[variant]}`}>
          <ArrowIcon size={size === 'lg' ? 16 : 14} />
        </span>
      )}
    </>
  );
  // Rutas internas con transición de página; anclas y externos, <a> común.
  if (href) return href.startsWith('/') ? <TransitionLink href={href} className={cls}>{content}</TransitionLink> : <a href={href} className={cls}>{content}</a>;
  return <button type={type} onClick={onClick} disabled={disabled} className={`${cls} cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed`}>{content}</button>;
}

/** Contenedor común: mismo ancho y gutter en todas las secciones. */
export function Container({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`max-w-[1360px] mx-auto px-4 sm:px-6 ${className}`}>{children}</div>;
}

/**
 * Encabezado en dos columnas: etiqueta chica a la izquierda y título grande
 * a la derecha (en mobile se apilan). El título puede llevar una segunda
 * parte atenuada — `muted`.
 */
export function SectionHeading({
  eyebrow, title, muted, onDark = false, className = '', children,
}: {
  eyebrow: string;
  title?: ReactNode;
  muted?: ReactNode;
  onDark?: boolean;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div className={`flex flex-wrap gap-x-8 gap-y-4 ${className}`}>
      <p className={`flex-[1_1_220px] m-0 text-[13px] font-semibold ${onDark ? 'text-[var(--theme-text-on-dark-muted)]' : 'text-[var(--theme-text-muted)]'}`}>
        {eyebrow}
      </p>
      <div className="flex-[999_1_640px] min-w-0">
        {title && (
          <h2 className={`m-0 font-[family-name:var(--theme-font-heading)] text-[clamp(34px,4.6vw,68px)] leading-[1.02] font-medium tracking-[-0.035em] text-balance ${onDark ? 'text-[var(--theme-text-on-dark-muted)]' : 'text-[var(--theme-text)]'}`}>
            {onDark ? <><span>{title}</span>{muted && <> <span className="text-[var(--theme-text-on-dark)]">{muted}</span></>}</> : <>{title}{muted && <> <span className="text-[var(--theme-text-muted)]">{muted}</span></>}</>}
          </h2>
        )}
        {children}
      </div>
    </div>
  );
}
