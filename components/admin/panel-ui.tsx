import type { ReactNode } from 'react';

// Piezas visuales del panel de un proyecto, sacadas del diseño (Dashboard,
// Ficha, Leads, Configuración…). Los colores salen del tema `.atrium-ui`
// (ver app/globals.css): gray-* y brand-* ya son los tonos del diseño.

/** Encabezado de pantalla: "VISIÓN GENERAL", título grande en Archivo, bajada y acciones a la derecha. */
export function PageHeader({ eyebrow, title, description, actions, back }: {
  eyebrow?: string;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  /** Link de vuelta arriba del eyebrow (ej. "← Proyecto"). */
  back?: ReactNode;
}) {
  return (
    <div className="flex items-end justify-between gap-x-6 gap-y-4 flex-wrap">
      <div className="min-w-0 flex flex-col gap-2.5 flex-[1_1_420px]">
        {back && <div className="text-[13px] text-gray-600">{back}</div>}
        {eyebrow && <p className="m-0 text-[11px] font-semibold uppercase tracking-[0.1em] text-gray-500">{eyebrow}</p>}
        <h1 className="m-0 text-[34px] sm:text-[44px] leading-[1.05] font-semibold text-gray-900">{title}</h1>
        {description && <p className="m-0 text-[15px] leading-relaxed text-gray-600 max-w-[640px]">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 flex-wrap">{actions}</div>}
    </div>
  );
}

/** Tarjeta blanca del diseño (borde #E4E0D8, radio 14–16). */
export function Card({ children, className = '', padded = true }: { children: ReactNode; className?: string; padded?: boolean }) {
  return <div className={`rounded-2xl border border-gray-200 bg-white ${padded ? 'p-5 sm:p-6' : ''} ${className}`}>{children}</div>;
}

/** Título de tarjeta con link/acción a la derecha ("Inventario · 48 unidades … Ver inventario →"). */
export function CardHeader({ title, action }: { title: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 flex-wrap">
      <h2 className="m-0 text-[15px] font-semibold text-gray-900">{title}</h2>
      {action && <div className="text-[13px] font-semibold text-gray-900 [&_a]:underline [&_a]:underline-offset-2">{action}</div>}
    </div>
  );
}

/**
 * Fila de formulario de la Ficha: título + explicación a la izquierda,
 * campos a la derecha, separada por una línea.
 */
export function SectionRow({ title, description, badge, children, first }: { title: string; description?: ReactNode; badge?: ReactNode; children: ReactNode; first?: boolean }) {
  return (
    <section className={`grid gap-x-8 gap-y-4 md:grid-cols-[220px_minmax(0,1fr)] ${first ? '' : 'pt-7 border-t border-gray-200'}`}>
      <div className="flex flex-col gap-1.5">
        <h2 className="m-0 text-[15px] font-semibold text-gray-900">{title}</h2>
        {description && <p className="m-0 text-[13px] leading-relaxed text-gray-600">{description}</p>}
        {badge && <div className="mt-1">{badge}</div>}
      </div>
      <div className="min-w-0 flex flex-col gap-3.5">{children}</div>
    </section>
  );
}

/** Franja de cifras (KPIs) en una tarjeta dividida. */
export function StatStrip({ stats }: { stats: { label: string; value: ReactNode; hint?: ReactNode; tone?: 'default' | 'warn' }[] }) {
  return (
    <div className="grid rounded-2xl border border-gray-200 bg-white overflow-hidden" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(200px, 100%), 1fr))' }}>
      {stats.map((s, i) => (
        <div key={s.label} className={`px-5 sm:px-6 py-5 flex flex-col gap-1.5 border-gray-200 ${i > 0 ? 'border-t sm:border-t-0 sm:border-l' : ''} ${s.tone === 'warn' ? 'bg-amber-50' : ''}`}>
          <span className={`text-xs ${s.tone === 'warn' ? 'text-amber-800 font-semibold' : 'text-gray-700'}`}>{s.label}</span>
          <span className="font-display text-[26px] sm:text-[32px] leading-none font-semibold text-gray-900">{s.value}</span>
          {s.hint && <span className="text-xs text-gray-600">{s.hint}</span>}
        </div>
      ))}
    </div>
  );
}

/** Pastilla de estado ("Nuevo", "Contactado", "Requerido para publicar"…). */
export function Pill({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'dark' | 'green' | 'warn' }) {
  const tones = {
    neutral: 'bg-gray-100 text-gray-700 border border-gray-200',
    dark: 'bg-brand-700 text-white',
    green: 'bg-brand-100 text-brand-800',
    warn: 'bg-amber-100 text-amber-800',
  };
  return <span className={`inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${tones[tone]}`}>{children}</span>;
}

export const btnPrimary = 'inline-flex items-center justify-center gap-2 min-h-[44px] px-4 rounded-[10px] bg-gray-900 text-white text-sm font-semibold hover:bg-black disabled:bg-gray-200 disabled:text-gray-400 transition-colors';
export const btnSecondary = 'inline-flex items-center justify-center gap-2 min-h-[44px] px-4 rounded-[10px] border border-gray-300 bg-white text-gray-900 text-sm font-medium hover:border-gray-400 disabled:opacity-50 transition-colors';
export const btnGreen = 'inline-flex items-center justify-center gap-2 min-h-[48px] px-5 rounded-xl bg-brand-700 text-white text-sm font-semibold hover:bg-brand-800 transition-colors';
export const fieldClass = 'w-full min-h-[44px] px-3.5 rounded-[10px] border border-gray-300 bg-white text-sm text-gray-900 outline-none focus:border-brand-700 focus:ring-2 focus:ring-brand-500/30 placeholder:text-gray-400';

/** Segmented del diseño (7 días / 30 días / Todo, Todos / Nuevos…). */
export function SegmentedTabs<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: ReactNode }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex p-[3px] rounded-[10px] bg-[#EAE7E0] flex-wrap">
      {options.map(o => (
        <button key={o.value} type="button" role="radio" aria-checked={value === o.value} onClick={() => onChange(o.value)}
          className={`min-h-[36px] px-3 rounded-lg text-[13px] ${value === o.value ? 'bg-white font-semibold text-gray-900 shadow-[0_1px_2px_rgba(23,25,26,0.06)]' : 'text-gray-600 hover:text-gray-900'}`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
