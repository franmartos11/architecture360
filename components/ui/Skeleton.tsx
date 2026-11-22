import type { CSSProperties, ReactNode } from 'react';

// Placeholders con la forma real del contenido, en lugar del spinner
// centrado que deja la pantalla en blanco mientras carga. El brillo que
// cruza (`.skeleton-shimmer`, en globals.css) da la sensación de app viva;
// con movimiento reducido queda un color fijo.
//
// Las piezas de abajo reproducen la UI del panel (components/admin/panel-ui):
// PageHeader → PageSkeleton, Card → SkeletonCard, StatStrip →
// SkeletonStatStrip, SectionRow/fieldClass → SkeletonForm, tablas →
// SkeletonTable. Se combinan: <PageSkeleton><SkeletonStatStrip count={3} />
// <SkeletonTable rows={6} cols={4} /></PageSkeleton>. Todo es decorativo
// (`aria-hidden`); el que habla por la pantalla es PageSkeleton
// (`role="status"`, "Cargando"). Para cambiar al contenido real, ver
// components/ui/Loaded.tsx.

export function Skeleton({ className = '', style }: { className?: string; style?: CSSProperties }) {
  return <div aria-hidden="true" className={`skeleton-shimmer rounded-md ${className}`} style={style} />;
}

export function SkeletonAvatar({ size = 'w-10 h-10' }: { size?: string }) {
  return <Skeleton className={`${size} rounded-full shrink-0`} />;
}

export function PostSkeleton() {
  return (
    <div aria-hidden="true" className="bg-white rounded-2xl border border-trevo-dark/10 p-5">
      <div className="flex items-start gap-3">
        <SkeletonAvatar />
        <div className="min-w-0 flex-1 space-y-2">
          <Skeleton className="h-3.5 w-32" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-2/3" />
        </div>
      </div>
    </div>
  );
}

export function CommentSkeleton() {
  return (
    <div aria-hidden="true" className="flex gap-3">
      <SkeletonAvatar size="w-9 h-9" />
      <div className="min-w-0 flex-1 space-y-2 pt-0.5">
        <Skeleton className="h-3 w-28" />
        <Skeleton className="h-3 w-4/5" />
      </div>
    </div>
  );
}

// ── Piezas del panel ─────────────────────────────────────────────

// Anchos de las líneas de un párrafo cuando no se pasan: la última, corta,
// para que se lea como texto y no como una caja.
const TEXT_WIDTHS = ['100%', '92%', '96%', '88%', '70%'];
function lineWidth(i: number, total: number, widths?: string[]) {
  if (widths?.length) return widths[i % widths.length];
  if (i === total - 1 && total > 1) return '55%';
  return TEXT_WIDTHS[i % TEXT_WIDTHS.length];
}

/** Párrafo: `lines` líneas de 12 px; `widths` fija el ancho de cada una (CSS). */
export function SkeletonText({ lines = 3, widths, className = '' }: { lines?: number; widths?: string[]; className?: string }) {
  return (
    <div aria-hidden="true" className={`flex flex-col gap-2 ${className}`}>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} className="h-3" style={{ width: lineWidth(i, lines, widths) }} />
      ))}
    </div>
  );
}

/** Tarjeta blanca del panel (como `Card`): título corto y `lines` líneas. */
export function SkeletonCard({ lines = 3, className = '' }: { lines?: number; className?: string }) {
  return (
    <div aria-hidden="true" className={`rounded-2xl border border-gray-200 bg-white p-5 sm:p-6 flex flex-col gap-4 ${className}`}>
      <Skeleton className="h-4 w-2/5 max-w-[180px]" />
      <SkeletonText lines={lines} />
    </div>
  );
}

/** Tabla: cabecera de `cols` títulos cortos y `rows` filas separadas por línea. */
export function SkeletonTable({ rows = 5, cols = 4, className = '' }: { rows?: number; cols?: number; className?: string }) {
  const grid = { gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` };
  return (
    <div aria-hidden="true" className={`rounded-2xl border border-gray-200 bg-white overflow-hidden ${className}`}>
      <div className="grid gap-4 px-5 py-3 border-b border-gray-200 bg-gray-50" style={grid}>
        {Array.from({ length: cols }, (_, i) => <Skeleton key={i} className="h-2.5 w-16 max-w-full" />)}
      </div>
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className={`grid gap-4 items-center px-5 h-14 ${r > 0 ? 'border-t border-gray-100' : ''}`} style={grid}>
          {Array.from({ length: cols }, (_, c) => (
            <Skeleton key={c} className={`h-3 ${c === 0 ? 'w-4/5' : 'w-3/5'} max-w-full`} />
          ))}
        </div>
      ))}
    </div>
  );
}

/** Formulario: `rows` filas de etiqueta corta + campo de 44 px (como `fieldClass`). */
export function SkeletonForm({ rows = 4, className = '' }: { rows?: number; className?: string }) {
  return (
    <div aria-hidden="true" className={`flex flex-col gap-3.5 ${className}`}>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex flex-col gap-1.5">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-11 w-full rounded-[10px]" />
        </div>
      ))}
    </div>
  );
}

/** Franja de cifras (como `StatStrip`): `count` celdas con etiqueta y número grande. */
export function SkeletonStatStrip({ count = 3, className = '' }: { count?: number; className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`grid rounded-2xl border border-gray-200 bg-white overflow-hidden ${className}`}
      style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(200px, 100%), 1fr))' }}
    >
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className={`px-5 sm:px-6 py-5 flex flex-col gap-2.5 border-gray-200 ${i > 0 ? 'border-t sm:border-t-0 sm:border-l' : ''}`}>
          <Skeleton className="h-2.5 w-20" />
          <Skeleton className="h-7 sm:h-8 w-24" />
          <Skeleton className="h-2.5 w-16" />
        </div>
      ))}
    </div>
  );
}

/**
 * Pantalla entera del panel mientras carga: la cabecera (`PageHeader`:
 * eyebrow corto, título de 34–44 px, bajada y `actions` botones a la
 * derecha) y, debajo, lo que se le pase — con el mismo `gap-6` que usan las
 * pantallas reales. Es lo único que se anuncia ("Cargando").
 */
export function PageSkeleton({ eyebrow = true, actions = 0, className = '', children }: {
  eyebrow?: boolean;
  /** Cantidad de botones fantasma a la derecha del título. */
  actions?: number;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div role="status" aria-label="Cargando" className={`flex flex-col gap-6 ${className}`}>
      <div aria-hidden="true" className="flex items-end justify-between gap-x-6 gap-y-4 flex-wrap">
        <div className="min-w-0 flex flex-col gap-2.5 flex-[1_1_420px]">
          {eyebrow && <Skeleton className="h-2.5 w-24" />}
          <Skeleton className="h-[34px] sm:h-[44px] w-[280px] max-w-full rounded-lg" />
          <Skeleton className="h-3.5 w-[360px] max-w-full" />
        </div>
        {actions > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            {Array.from({ length: actions }, (_, i) => <Skeleton key={i} className="h-11 w-[120px] rounded-[10px]" />)}
          </div>
        )}
      </div>
      {children != null && <div aria-hidden="true" className="contents">{children}</div>}
    </div>
  );
}
