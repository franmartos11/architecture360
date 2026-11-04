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
  const currentLabel = steps[current - 1]?.label ?? '';
  return (
    <div className="bg-white border-b border-gray-200">
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-3 flex items-center gap-x-6 gap-y-2.5 flex-wrap">
        <div className="min-w-0 flex-1 basis-[200px] flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-500">Carga guiada</p>
            <p className="text-sm font-semibold text-gray-900 truncate">
              {project.name} <span className="font-normal text-gray-500">· {kindLabel}{project.saleMode === 'showcase' ? ' · Solo para mostrar' : ''}</span>
            </p>
          </div>
          {/* En celular "Guardar y salir" va arriba a la derecha, al lado del nombre. */}
          <Link href="/admin" className="sm:hidden shrink-0 text-xs font-medium text-gray-700 min-h-[40px] flex items-center px-3 rounded-lg border border-gray-200">
            Guardar y salir
          </Link>
        </div>
        <ol aria-label="Pasos" className="flex items-center gap-1 w-full sm:w-auto">
          {steps.map((s, i) => {
            const n = i + 1;
            const on = n === current;
            const done = n < current;
            const enabled = canGoTo ? canGoTo(n) : true;
            return (
              <li key={s.label} className={`flex items-center gap-1 ${on ? 'min-w-0' : 'shrink-0'}`}>
                <button
                  type="button"
                  onClick={() => enabled && onStep(n)}
                  disabled={!enabled}
                  aria-current={on ? 'step' : undefined}
                  aria-label={`Paso ${n}: ${s.label}${done ? ' (completo)' : ''}`}
                  className={`flex items-center gap-2 min-h-[40px] min-w-[40px] rounded-full text-[13px] transition-colors ${
                    on ? 'bg-gray-900 text-white font-semibold pl-1.5 pr-3 min-w-0'
                      : done ? 'text-gray-900 font-semibold hover:bg-gray-100 px-[7px] sm:pl-1.5 sm:pr-3'
                      : enabled ? 'text-gray-600 hover:bg-gray-100 px-[7px] sm:pl-1.5 sm:pr-3' : 'text-gray-400 cursor-not-allowed px-[7px] sm:pl-1.5 sm:pr-3'
                  }`}
                >
                  <span className={`w-[26px] h-[26px] shrink-0 rounded-full flex items-center justify-center text-xs font-semibold ${
                    on ? 'bg-white text-gray-900' : done ? 'bg-brand-700 text-white' : 'border-[1.5px] border-gray-300'
                  }`}>
                    {done ? '✓' : n}
                  </span>
                  {/* En celular solo el paso actual muestra su nombre — los demás quedan como círculos numerados. */}
                  <span className={on ? 'truncate' : 'hidden sm:inline'}>{s.label}</span>
                </button>
                {i < steps.length - 1 && <span aria-hidden className="w-3 sm:w-5 h-px bg-gray-300 shrink-0" />}
              </li>
            );
          })}
        </ol>
        <Link href="/admin" className="hidden sm:flex text-[13px] font-medium text-gray-700 hover:text-gray-900 min-h-[40px] items-center px-3 rounded-lg border border-gray-200 hover:border-gray-300">
          Guardar y seguir después
        </Link>
      </div>
      <span className="sr-only">Paso actual: {currentLabel}</span>
    </div>
  );
}

// ─── Layout de un paso ─────────────────────────────────────────────

/** Encabezado del paso: "Paso 1 de 4", título grande y bajada. */
export function StepIntro({ eyebrow, title, children }: { eyebrow: string; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-gray-500">{eyebrow}</p>
      <h1 className="m-0 text-[28px] sm:text-[34px] leading-[1.1] font-semibold tracking-tight text-gray-900">{title}</h1>
      {children && <p className="m-0 text-[15px] leading-relaxed text-gray-600 max-w-[620px]">{children}</p>}
    </div>
  );
}

/** Pie de paso: volver, resumen en el medio, acción principal. */
export function StepFooter({ back, summary, primary }: {
  back?: { label: string; onClick: () => void };
  summary?: ReactNode;
  primary?: { label: string; onClick: () => void; disabled?: boolean; busy?: boolean; busyLabel?: string };
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4 pt-6 border-t border-gray-200">
      <div className="flex items-center gap-x-4 gap-y-1 flex-wrap min-w-0">
        {back && (
          <button type="button" onClick={back.onClick} className="min-h-[44px] text-sm font-medium text-gray-700 hover:text-gray-900">
            ← {back.label}
          </button>
        )}
        {summary && <div className="text-[13px] text-gray-600">{summary}</div>}
      </div>
      {primary && (
        <button
          type="button"
          onClick={primary.onClick}
          disabled={primary.disabled || primary.busy}
          className="w-full sm:w-auto min-h-[48px] px-5 rounded-xl bg-gray-900 text-white text-sm font-semibold hover:bg-gray-800 disabled:bg-gray-200 disabled:text-gray-400 transition-colors"
        >
          {primary.busy ? (primary.busyLabel ?? 'Guardando...') : primary.label}
        </button>
      )}
    </div>
  );
}

export function NumberStepper({ label, value, onChange, min = 0, max = 999, hideLabel }: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  hideLabel?: boolean;
}) {
  const set = (n: number) => onChange(Math.min(max, Math.max(min, Number.isFinite(n) ? Math.floor(n) : min)));
  return (
    <div className="flex flex-col gap-1.5">
      {!hideLabel && <span className="text-xs font-medium text-gray-700">{label}</span>}
      <div className="flex items-center rounded-[10px] border border-gray-300 bg-white overflow-hidden w-fit">
        <button type="button" aria-label={`Menos — ${label}`} onClick={() => set(value - 1)} disabled={value <= min}
          className="w-11 h-11 text-lg text-gray-900 hover:bg-gray-50 disabled:text-gray-300">−</button>
        <input
          aria-label={label}
          inputMode="numeric"
          value={value}
          onChange={e => set(Number(e.target.value.replace(/\D/g, '') || min))}
          className="w-10 sm:w-12 h-11 text-center text-base font-semibold text-gray-900 border-x border-gray-200 outline-none focus:bg-brand-50"
        />
        <button type="button" aria-label={`Más — ${label}`} onClick={() => set(value + 1)} disabled={value >= max}
          className="w-11 h-11 text-lg text-gray-900 hover:bg-gray-50 disabled:text-gray-300">+</button>
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
      className={`text-left flex flex-col gap-1 min-h-[64px] p-3 rounded-xl border transition-colors ${
        on ? 'border-[1.5px] border-brand-700 bg-brand-50' : 'border-gray-200 bg-white hover:border-gray-300'
      } ${className}`}
    >
      <span className="text-sm font-semibold text-gray-900">{title}</span>
      {hint && <span className="text-xs text-gray-500 leading-snug">{hint}</span>}
    </button>
  );
}

/** Segmented control chico (numeración, modo de dibujo…). */
export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex p-[3px] rounded-[10px] bg-gray-100 flex-wrap">
      {options.map(o => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={`min-h-[36px] px-3 rounded-lg text-[13px] transition-colors ${value === o.value ? 'bg-white font-semibold text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}
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

export const inputClass = 'h-11 px-3 rounded-[10px] border border-gray-300 bg-white text-sm text-gray-900 outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 w-full';

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
      <span className="flex items-center h-11 rounded-[10px] border border-gray-300 bg-white focus-within:ring-2 focus-within:ring-brand-500 focus-within:border-brand-500 overflow-hidden">
        {prefix && <span className="pl-3 text-xs text-gray-500">{prefix}</span>}
        <input
          inputMode="decimal"
          value={value ?? ''}
          placeholder={placeholder}
          onChange={e => {
            const raw = e.target.value.replace(/[^\d.,]/g, '').replace(',', '.');
            onChange(raw === '' ? null : Number(raw));
          }}
          className="flex-1 min-w-0 h-full px-3 text-sm text-gray-900 outline-none bg-transparent"
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
