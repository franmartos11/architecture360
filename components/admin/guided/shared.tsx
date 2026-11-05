'use client';

import { useCallback, useEffect, useState, startTransition, type ReactNode } from 'react';
import { TransitionLink as Link } from '@/components/ui/TransitionUtils';
import { useActiveProjectId, withActiveProject } from '@/lib/active-project-context';
import type { FloorKind, ProjectType, ProjectSaleMode, Room, TourData, UnitStatus } from '@/types';

// Piezas compartidas por los flujos de carga guiada (/admin/carga): el
// árbol edificios → pisos → unidades que devuelve GET /api/admin/guided,
// los helpers para escribir en lote, y los bloques visuales que se repiten
// en todos los pasos (encabezado de pasos, pie con "Siguiente", stepper
// numérico, tarjetas de "lo que falta").

// ─── Datos ─────────────────────────────────────────────────────────

export interface GuidedProject {
  id: string;
  slug: string;
  name: string;
  projectType: ProjectType;
  saleMode: ProjectSaleMode;
  masterplanImage: string | null;
  tagline: string | null;
  location: string | null;
  academicYear: string | null;
}

export interface GUnit {
  id: string;
  floor_id: string;
  code: string;
  model_name: string | null;
  type: string;
  category: string;
  bedrooms: number;
  bathrooms: number;
  total_area: number | null;
  inner_area: number | null;
  balcony_area: number;
  external_area: number;
  lot_size: number | null;
  floors_count: number;
  living_rooms: number;
  garage_spaces: number;
  hoa_fee: number | null;
  price: number | null;
  currency: string;
  status: UnitStatus;
  condition: string | null;
  features: string[];
  polygon: { x: number; y: number }[] | null;
  rooms: GRoom[] | null;
  tour_data: TourData | null;
  gallery_images: string[];
  interior_image_url: string | null;
}

/** Room + las fotos de ese ambiente (rooms es jsonb: el campo extra no requiere migración). */
export type GRoom = Room & { images?: string[] };

export interface UnitDot { unitId: string; x: number; y: number; color?: string; style?: 'pill' | 'dot' }

export interface GFloor {
  id: string;
  building_id: string;
  number: number;
  label: string;
  plan_image: string | null;
  floor_kind: FloorKind;
  floor_kind_description: string | null;
  unit_dots: UnitDot[];
  units: GUnit[];
}

export interface GBuilding {
  id: string;
  slug: string;
  name: string;
  total_floors: number;
  floors: GFloor[];
}

export interface GuidedTree {
  buildings: GBuilding[];
}

export function allUnits(tree: GuidedTree | null): GUnit[] {
  return (tree?.buildings ?? []).flatMap(b => b.floors.flatMap(f => f.units));
}

export function allFloors(tree: GuidedTree | null): GFloor[] {
  return (tree?.buildings ?? []).flatMap(b => b.floors);
}

export function useGuidedTree() {
  const projectId = useActiveProjectId();
  const [tree, setTree] = useState<GuidedTree | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback((): Promise<void> => {
    startTransition(() => setError(null));
    return fetch(withActiveProject('/api/admin/guided', projectId), { cache: 'no-store' })
      .then(async res => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? 'No se pudo cargar el proyecto');
        setTree(data as GuidedTree);
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : 'No se pudo cargar el proyecto');
      })
      .finally(() => setLoading(false));
  }, [projectId]);

  useEffect(() => { reload(); }, [reload]);

  return { tree, setTree, loading, error, reload };
}

export function useGuidedApi() {
  const projectId = useActiveProjectId();
  const call = useCallback(async <T = Record<string, unknown>>(method: 'POST' | 'PATCH', body: unknown): Promise<{ ok: true; data: T } | { ok: false; error: string }> => {
    try {
      const res = await fetch(withActiveProject('/api/admin/guided', projectId), {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return { ok: false, error: data.error ?? 'No se pudo guardar.' };
      return { ok: true, data: data as T };
    } catch {
      return { ok: false, error: 'Sin conexión. Probá de nuevo.' };
    }
  }, [projectId]);

  const patchProject = useCallback(async (body: Record<string, unknown>) => {
    const res = await fetch(withActiveProject('/api/admin/project', projectId), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    return res.ok ? { ok: true as const } : { ok: false as const, error: (data.error as string) ?? 'No se pudo guardar.' };
  }, [projectId]);

  return {
    create: <T = GuidedTree>(body: Record<string, unknown>) => call<T>('POST', body),
    patch: (body: { units?: Record<string, unknown>[]; floors?: Record<string, unknown>[] }) => call('PATCH', body),
    patchProject,
  };
}

// ─── Encabezado de pasos ───────────────────────────────────────────

export interface GuidedStepDef {
  label: string;
}

// Barra superior de la carga guiada (diseño "Encabezado guiado"): proyecto
// a la izquierda, pasos al centro, "Guardar y seguir después" a la derecha.
// No reemplaza el nav del panel — va adentro del área de contenido.
export function GuidedHeader({ project, kindLabel, steps, current, onStep, canGoTo }: {
  project: GuidedProject;
  kindLabel: string;
  steps: GuidedStepDef[];
  /** 1-based */
  current: number;
  onStep: (n: number) => void;
  /** Si se puede saltar a ese paso (ej. no hay estructura todavía → solo el 1). */
  canGoTo?: (n: number) => boolean;
}) {
  return (
    <header className="bg-gray-50 border-b border-gray-200">
      <div className="px-4 sm:px-7 py-3 min-h-[72px] flex items-center gap-x-5 gap-y-2.5 flex-wrap">
        <div className="min-w-0 flex-1 sm:flex-none flex items-center justify-between gap-3">
          <div className="min-w-0 flex flex-col leading-tight">
            <span className="font-display text-[17px] font-semibold tracking-[-0.02em] text-gray-900 truncate">{project.name}</span>
            <span className="text-[11px] text-gray-500 truncate">
              {kindLabel}{project.saleMode === 'showcase' ? ' · solo para mostrar' : ''} · carga guiada
            </span>
          </div>
          <Link href="/admin" className="sm:hidden shrink-0 text-xs font-medium text-gray-900 min-h-[40px] flex items-center px-3 rounded-[10px] border border-gray-300 bg-white">
            Guardar y salir
          </Link>
        </div>
        <ol aria-label="Pasos" className="flex-1 basis-full sm:basis-[420px] min-w-0 flex items-center sm:justify-center gap-1.5 m-0 p-0 list-none">
          {steps.map((s, i) => {
            const n = i + 1;
            const on = n === current;
            const done = n < current;
            const enabled = canGoTo ? canGoTo(n) : true;
            return (
              <li key={s.label} className={`flex items-center gap-1.5 ${on ? 'min-w-0 shrink' : 'shrink-0'}`}>
                <button
                  type="button"
                  onClick={() => enabled && onStep(n)}
                  disabled={!enabled}
                  aria-current={on ? 'step' : undefined}
                  aria-label={`Paso ${n}: ${s.label}${done ? ' (completo)' : ''}`}
                  className={`flex items-center gap-2 min-h-[40px] rounded-full text-[13px] ${
                    on ? 'bg-gray-900 text-white font-semibold pl-1.5 pr-3 min-w-0 max-w-full overflow-hidden'
                      : `${done ? 'text-gray-900 font-semibold' : 'text-gray-600'} px-[7px] sm:pl-1.5 sm:pr-3 ${enabled ? 'hover:bg-gray-100' : 'cursor-not-allowed opacity-60'}`
                  }`}
                >
                  <span className={`w-[26px] h-[26px] shrink-0 rounded-full flex items-center justify-center text-xs font-semibold box-border ${
                    on ? 'bg-white text-gray-900' : done ? 'bg-brand-700 text-white' : 'border-[1.5px] border-gray-300 text-gray-700'
                  }`}>
                    {done ? '✓' : n}
                  </span>
                  <span className={on ? 'truncate' : 'hidden sm:inline'}>{s.label}</span>
                </button>
                {i < steps.length - 1 && <span aria-hidden className="w-3 sm:w-6 h-px bg-gray-300 shrink-0" />}
              </li>
            );
          })}
        </ol>
        <Link href="/admin" className="hidden sm:flex min-h-[40px] items-center px-3.5 rounded-[10px] border border-gray-300 bg-white text-[13px] font-medium text-gray-900 hover:border-gray-400">
          Guardar y seguir después
        </Link>
      </div>
    </header>
  );
}

// ─── Layouts de un paso ────────────────────────────────────────────

/**
 * Paso "partido" (Estructura, Tipologías, Planta, Niveles…): formulario en
 * un panel claro a la izquierda y la vista en vivo ocupando el resto.
 */
export function SplitLayout({ panel, children, panelLabel, mainLabel }: { panel: ReactNode; children: ReactNode; panelLabel?: string; mainLabel?: string }) {
  return (
    <div className="flex flex-wrap items-stretch flex-1">
      <section aria-label={panelLabel} className="flex-[1_1_420px] md:max-w-[500px] min-w-0 px-4 py-8 sm:px-9 sm:py-10 flex flex-col gap-6 bg-gray-50 md:border-r border-b md:border-b-0 border-gray-200">
        {panel}
      </section>
      <main aria-label={mainLabel} className="flex-[999_1_520px] min-w-0 px-4 py-8 sm:p-10 flex flex-col gap-5">
        {children}
      </main>
    </div>
  );
}

/**
 * Paso con formulario centrado y vista previa a la derecha (Casa, Dúplex
 * conjunto…): "Así se ve la ficha" en una columna beige.
 */
export function FormWithPreview({ children, preview, previewLabel = 'Vista en vivo' }: { children: ReactNode; preview?: ReactNode; previewLabel?: string }) {
  return (
    <div className="flex flex-wrap items-stretch flex-1">
      <main className="flex-[999_1_560px] min-w-0 px-4 py-8 sm:px-12 sm:py-10">
        <div className="max-w-[720px] mx-auto flex flex-col gap-7">{children}</div>
      </main>
      {preview && (
        <aside aria-label={previewLabel} className="flex-[1_1_340px] lg:max-w-[440px] min-w-0 px-4 py-8 sm:px-6 sm:py-8 bg-[#EFECE6] border-t lg:border-t-0 lg:border-l border-gray-200 flex flex-col gap-4">
          {preview}
        </aside>
      )}
    </div>
  );
}

/** Bloque de formulario con su título ("Programa", "Superficies"…) separado por una línea. */
export function FormSection({ title, aside, children, first }: { title: string; aside?: ReactNode; children: ReactNode; first?: boolean }) {
  return (
    <section className={`flex flex-col gap-3.5 ${first ? '' : 'pt-7 border-t border-gray-200'}`}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="m-0 text-[15px] font-semibold text-gray-900">{title}</h2>
        {aside && <span className="text-xs text-gray-500">{aside}</span>}
      </div>
      {children}
    </section>
  );
}

/** Encabezado del paso: "Paso 1 de 4", título grande (Archivo) y bajada. */
export function StepIntro({ eyebrow, title, children, size = 'md' }: { eyebrow: string; title: string; children?: ReactNode; size?: 'md' | 'lg' }) {
  return (
    <div className="flex flex-col gap-2.5">
      <p className="m-0 text-[11px] font-semibold uppercase tracking-[0.1em] text-gray-500">{eyebrow}</p>
      <h1 className={`m-0 leading-[1.05] font-semibold text-gray-900 ${size === 'lg' ? 'text-[32px] sm:text-[44px]' : 'text-[30px] sm:text-[38px]'}`}>{title}</h1>
      {children && <p className="m-0 text-sm leading-relaxed text-gray-600 max-w-[620px]">{children}</p>}
    </div>
  );
}

/**
 * Pie del paso. 'bar' (default): la barra oscura del diseño con volver,
 * resumen y el botón blanco. 'plain': línea + botón oscuro a la derecha
 * (pasos de formulario centrado).
 */
export function StepFooter({ back, summary, title, primary, variant = 'bar' }: {
  back?: { label: string; onClick: () => void };
  summary?: ReactNode;
  /** Solo 'bar': línea destacada arriba del resumen (ej. "2 torres · 15 niveles · 48 unidades"). */
  title?: ReactNode;
  primary?: { label: string; onClick: () => void; disabled?: boolean; busy?: boolean; busyLabel?: string };
  variant?: 'bar' | 'plain';
}) {
  const label = primary ? (primary.busy ? (primary.busyLabel ?? 'Guardando...') : primary.label.replace(/\s*→\s*$/, '')) : '';
  if (variant === 'plain') {
    return (
      <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3 pt-6 border-t border-gray-200">
        <div className="flex items-center gap-x-4 gap-y-1 flex-wrap min-w-0">
          {back && (
            <button type="button" onClick={back.onClick} className="min-h-[44px] text-sm font-medium text-gray-700 hover:text-gray-900">← {back.label}</button>
          )}
          {summary && <div className="text-[13px] text-gray-600">{summary}</div>}
        </div>
        {primary && (
          <button type="button" onClick={primary.onClick} disabled={primary.disabled || primary.busy}
            className="w-full sm:w-auto min-h-[48px] px-5 rounded-xl bg-gray-900 text-white text-sm font-semibold inline-flex items-center justify-center gap-2.5 hover:bg-black disabled:bg-gray-200 disabled:text-gray-400">
            {label}{!primary.busy && <ArrowIcon />}
          </button>
        )}
      </div>
    );
  }
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 px-4 sm:px-5 py-4 rounded-[14px] bg-gray-900 text-white">
      <div className="flex-1 min-w-0 flex flex-col sm:flex-row sm:items-center gap-x-4 gap-y-1">
        {back && (
          <button type="button" onClick={back.onClick} className="self-start sm:self-auto min-h-[40px] text-[13px] text-[#C9C6BE] hover:text-white shrink-0">← {back.label}</button>
        )}
        <div className="min-w-0 flex flex-col gap-0.5">
          {title && <span className="text-[15px] font-semibold">{title}</span>}
          {summary && <span className={`text-[13px] ${title ? 'text-[#C9C6BE] text-xs' : 'text-[#E4E0D8]'} [&_b]:text-white`}>{summary}</span>}
        </div>
      </div>
      {primary && (
        <button type="button" onClick={primary.onClick} disabled={primary.disabled || primary.busy}
          className="w-full sm:w-auto shrink-0 min-h-[48px] px-5 rounded-xl bg-white text-gray-900 text-sm font-semibold inline-flex items-center justify-center gap-2.5 hover:bg-gray-100 disabled:opacity-50">
          {label}{!primary.busy && <ArrowIcon />}
        </button>
      )}
    </div>
  );
}

export function ArrowIcon({ className = '' }: { className?: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" className={className}>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

/**
 * Stepper numérico. 'field' (default): caja de 42px con botones grises
 * a los costados y el número en Archivo — ocupa el ancho de su celda.
 * 'card': tarjeta con el label adentro y botones redondos (programa de la casa).
 */
export function NumberStepper({ label, value, onChange, min = 0, max = 999, hideLabel, variant = 'field' }: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  hideLabel?: boolean;
  variant?: 'field' | 'card';
}) {
  const set = (n: number) => onChange(Math.min(max, Math.max(min, Number.isFinite(n) ? Math.floor(n) : min)));
  const input = (
    <input
      aria-label={label}
      inputMode="numeric"
      value={value}
      onChange={e => set(Number(e.target.value.replace(/\D/g, '') || min))}
      className={`flex-1 min-w-0 text-center font-display font-semibold text-gray-900 bg-transparent outline-none ${variant === 'card' ? 'text-[22px] w-8' : 'text-lg w-10'}`}
    />
  );
  if (variant === 'card') {
    const round = 'w-8 h-8 shrink-0 rounded-lg border border-gray-200 bg-gray-50 text-base leading-none text-gray-900 flex items-center justify-center hover:border-gray-300 disabled:text-gray-300';
    return (
      <div className="flex flex-col gap-2.5 p-3 rounded-xl border border-gray-200 bg-white min-w-0">
        <span className="text-xs text-gray-700">{label}</span>
        <div className="flex items-center justify-between gap-1">
          <button type="button" aria-label={`Menos — ${label}`} onClick={() => set(value - 1)} disabled={value <= min} className={round}>−</button>
          {input}
          <button type="button" aria-label={`Más — ${label}`} onClick={() => set(value + 1)} disabled={value >= max} className={round}>+</button>
        </div>
      </div>
    );
  }
  const btn = 'w-[42px] self-stretch bg-gray-100 text-lg text-gray-900 hover:bg-[#EAE7E0] disabled:text-gray-300 disabled:hover:bg-gray-100';
  return (
    <div className="flex flex-col gap-1.5 min-w-0">
      {!hideLabel && <span className="text-xs font-medium text-gray-700">{label}</span>}
      <div className="flex items-center min-h-[44px] rounded-[9px] border border-gray-300 bg-white overflow-hidden focus-within:ring-2 focus-within:ring-brand-500">
        <button type="button" aria-label={`Menos — ${label}`} onClick={() => set(value - 1)} disabled={value <= min} className={btn}>−</button>
        {input}
        <button type="button" aria-label={`Más — ${label}`} onClick={() => set(value + 1)} disabled={value >= max} className={btn}>+</button>
      </div>
    </div>
  );
}

/** Botón-opción grande (radio visual) — "Por manzanas", "Todas iguales", etc. */
export function ChoiceCard({ on, onClick, title, hint, className = '' }: { on: boolean; onClick: () => void; title: string; hint?: string; className?: string }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`text-left flex flex-col gap-1 min-h-[58px] px-3.5 py-3 rounded-xl transition-colors ${
        on ? 'border-[1.5px] border-brand-700 bg-brand-50' : 'border border-gray-200 bg-white hover:border-gray-300'
      } ${className}`}
    >
      <span className="text-[13px] font-semibold text-gray-900">{title}</span>
      {hint && <span className="text-xs text-gray-500 leading-snug">{hint}</span>}
    </button>
  );
}

/** Segmented control del diseño: fondo #EAE7E0, opciones de igual ancho. */
export function Segmented<T extends string>({ value, options, onChange, label, fit }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string; /** true = ancho según contenido en vez de columnas iguales a todo el ancho. */ fit?: boolean }) {
  return (
    <div role="radiogroup" aria-label={label}
      className={`${fit ? 'inline-flex flex-wrap' : 'grid'} p-[3px] rounded-[10px] bg-[#EAE7E0] gap-0.5`}
      style={fit ? undefined : { gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map(o => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={`min-h-[36px] px-3 rounded-lg text-xs truncate ${value === o.value ? 'bg-white font-semibold text-gray-900 shadow-[0_1px_2px_rgba(23,25,26,0.06)]' : 'text-gray-600 hover:text-gray-900'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function FieldLabel({ children }: { children: ReactNode }) {
  return <span className="text-xs font-medium text-gray-700">{children}</span>;
}

export const inputClass = 'min-h-[44px] px-3 rounded-[9px] border border-gray-300 bg-white text-sm text-gray-900 outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-700 w-full placeholder:text-gray-400';

/** Input numérico que acepta vacío (null) — superficies, precios. */
export function NumberField({ label, value, onChange, suffix, prefix, placeholder }: {
  label: string;
  value: number | null;
  onChange: (n: number | null) => void;
  suffix?: string;
  prefix?: string;
  placeholder?: string;
}) {
  return (
    <label className="flex flex-col gap-1.5 min-w-0">
      <FieldLabel>{label}</FieldLabel>
      <span className="flex items-center min-h-[44px] rounded-[9px] border border-gray-300 bg-white focus-within:ring-2 focus-within:ring-brand-500/30 focus-within:border-brand-700 overflow-hidden">
        {prefix && <span className="pl-3 text-xs font-semibold text-gray-700">{prefix}</span>}
        <input
          inputMode="decimal"
          value={value ?? ''}
          placeholder={placeholder ?? '—'}
          onChange={e => {
            const raw = e.target.value.replace(/[^\d.,]/g, '').replace(',', '.');
            onChange(raw === '' ? null : Number(raw));
          }}
          className="flex-1 min-w-0 h-full px-3 text-sm text-gray-900 outline-none bg-transparent placeholder:text-gray-400"
        />
        {suffix && <span className="pr-3 text-xs text-gray-500">{suffix}</span>}
      </span>
    </label>
  );
}

export function ErrorNote({ children }: { children: ReactNode }) {
  if (!children) return null;
  return <p role="alert" className="text-sm text-red-600">{children}</p>;
}

export function formatNumber(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  return new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 }).format(n);
}

export function formatMoney(n: number | null | undefined, currency = 'USD'): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  if (n >= 1_000_000) return `${currency} ${(n / 1_000_000).toLocaleString('es-AR', { maximumFractionDigits: 1 })} M`;
  return `${currency} ${formatNumber(n)}`;
}

/** Color estable por índice — mismo criterio que los delimitadores existentes. */
export const SHAPE_PALETTE = ['#37463f', '#968676', '#3b82f6', '#e11d48', '#059669', '#d97706', '#7c3aed', '#0891b2'];
