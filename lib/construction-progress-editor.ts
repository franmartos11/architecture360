import { daysSinceLastUpdate, emptyProgress, newProgressId } from '@/lib/construction-progress';
import type { ConstructionProgress, ConstructionUpdate } from '@/types';

// Helpers del EDITOR del avance de obra (panel): armar una entrada nueva,
// decidir si se puede guardar o publicar, leer la respuesta del guardado y
// resumir el estado para la tarjeta del dashboard. Lo compartido con el
// sitio público vive en lib/construction-progress.ts; esto es solo del
// panel y no toca el modelo.

/**
 * yyyy-mm-dd en la hora LOCAL. `toISOString()` da la fecha en UTC: en
 * Argentina, después de las 21 ya es "mañana", y una entrada cargada a la
 * noche quedaba con la fecha del día siguiente.
 */
export function toIsoDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export const localToday = () => toIsoDate(new Date());

const MONTH_NAMES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

/** "2026-11-03" → "Noviembre 2026" — encabezado de cada mes en la bitácora. */
export function monthTitle(iso: string): string {
  const [y, m] = iso.split('-').map(Number);
  return y ? `${MONTH_NAMES[(m || 1) - 1]} ${y}` : '';
}

/** Lo guardado (o null) como avance editable: listas siempre presentes. */
export function editableProgress(saved: unknown): ConstructionProgress {
  if (!saved || typeof saved !== 'object') return emptyProgress();
  const s = saved as Partial<ConstructionProgress>;
  return { ...emptyProgress(), ...s, stages: Array.isArray(s.stages) ? s.stages : [], updates: Array.isArray(s.updates) ? s.updates : [] };
}

/** Etapa por defecto de una entrada nueva: la marcada en curso, o la de la entrada más reciente. */
export function defaultStageId(progress: ConstructionProgress): string | undefined {
  if (progress.currentStageId) return progress.currentStageId;
  return [...progress.updates].sort((a, b) => b.date.localeCompare(a.date)).find(u => u.stageId)?.stageId;
}

/** Entrada en blanco para la carga rápida: fecha de hoy y la etapa actual. */
export function blankEntry(progress: ConstructionProgress, today: string): ConstructionUpdate {
  return { id: newProgressId(), date: today, title: '', images: [], stageId: defaultStageId(progress) };
}

/** ¿Tiene algo que el sitio pueda mostrar? (sin contar si es borrador). */
export const hasMedia = (u: Pick<ConstructionUpdate, 'images' | 'video'>) => u.images.length > 0 || !!u.video;

/**
 * Qué se puede hacer con una entrada a medio cargar. Publicar pide una foto
 * o un clip (sin eso el sitio no la muestra). Un borrador alcanza con una
 * línea: el servidor descarta las entradas sin título ni fotos ni clip, y
 * un borrador vacío se perdería sin aviso al guardar.
 */
export function entryReadiness(u: ConstructionUpdate): { canDraft: boolean; canPublish: boolean; hint: string | null } {
  const media = hasMedia(u);
  const titled = u.title.trim().length > 0;
  const canDraft = media || titled;
  return {
    canDraft,
    canPublish: media,
    hint: media ? null : titled ? 'Para publicar sumá al menos una foto o un clip.' : 'Sumá fotos, un clip o una línea para poder guardarla.',
  };
}

/** Suma la entrada (nueva o ya existente, por id) con el estado de borrador elegido. */
export function upsertEntry(progress: ConstructionProgress, entry: ConstructionUpdate, draft: boolean): ConstructionProgress {
  const next: ConstructionUpdate = { ...entry, title: entry.title.trim() };
  if (draft) next.draft = true; else delete next.draft;
  const exists = progress.updates.some(u => u.id === entry.id);
  return {
    ...progress,
    updates: exists ? progress.updates.map(u => (u.id === entry.id ? next : u)) : [next, ...progress.updates],
  };
}

/** Pasa una entrada de borrador a publicada o al revés. `draft` ausente = publicada (ver types). */
export function setDraft(progress: ConstructionProgress, id: string, draft: boolean): ConstructionProgress {
  return {
    ...progress,
    updates: progress.updates.map(u => {
      if (u.id !== id) return u;
      const next = { ...u };
      if (draft) next.draft = true; else delete next.draft;
      return next;
    }),
  };
}

// ─── Guardado ────────────────────────────────────────────────────────

/**
 * Lo que se manda al PATCH: sin campos vacíos que el schema rechaza (una
 * fecha '' o un clip '' no son fechas ni URLs: darían 400) ni fotos en
 * blanco. El resto lo sanea el servidor.
 */
export function forSave(progress: ConstructionProgress): ConstructionProgress {
  const out: ConstructionProgress = {
    ...progress,
    stages: progress.stages.map(s => {
      const st = { ...s };
      if (!st.from) delete st.from;
      // El servidor descarta un fin anterior al inicio; mejor no mandarlo.
      if (!st.to || (st.from && st.to < st.from)) delete st.to;
      return st;
    }),
    updates: progress.updates.map(u => {
      const next = { ...u, images: u.images.filter(src => src.trim() !== '') };
      if (!next.video) delete next.video;
      if (!next.view) delete next.view;
      if (!next.body) delete next.body;
      if (!next.stageId) delete next.stageId;
      return next;
    }),
  };
  if (!out.startedAt) delete out.startedAt;
  if (!out.deliveryEstimate) delete out.deliveryEstimate;
  if (!out.currentStageId) delete out.currentStageId;
  return out;
}

export const CONFLICT_CODE = 'construction_progress_conflict';

export type SaveOutcome =
  | { kind: 'ok'; updatedAt: string | undefined }
  | { kind: 'conflict'; message: string }
  | { kind: 'error'; message: string };

/**
 * Lee la respuesta del PATCH. En el ok la ruta devuelve la fila entera:
 * el `updatedAt` nuevo sale de ahí y es la base del próximo guardado.
 */
export function readSaveResponse(status: number, body: unknown): SaveOutcome {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  if (status >= 200 && status < 300) {
    const cp = b.construction_progress as { updatedAt?: unknown } | null | undefined;
    return { kind: 'ok', updatedAt: typeof cp?.updatedAt === 'string' ? cp.updatedAt : undefined };
  }
  const error = typeof b.error === 'string' ? b.error : '';
  if (status === 409 && b.code === CONFLICT_CODE) {
    return { kind: 'conflict', message: error || 'Alguien más guardó el avance de obra mientras lo editabas.' };
  }
  // Base sin la columna (falta correr supabase/schema.sql).
  if (error.includes('construction_progress')) return { kind: 'error', message: 'Falta actualizar la base de datos (columna construction_progress).' };
  return { kind: 'error', message: 'Error al guardar.' };
}

// ─── Dashboard ───────────────────────────────────────────────────────

/** "hoy" · "ayer" · "hace 12 días". Una fecha futura (entrada adelantada) cuenta como hoy. */
export function daysAgoLabel(days: number): string {
  if (days <= 0) return 'hoy';
  if (days === 1) return 'ayer';
  return `hace ${days} días`;
}

export interface ObraSummary {
  /** Sin avance cargado, o sin ninguna entrada todavía. */
  empty: boolean;
  days: number | null;
  percent: number | undefined;
  hasThisMonth: boolean;
  /** Más de un mes sin entradas: la tarjeta lo marca. */
  stale: boolean;
}

/** Resumen para la tarjeta "Obra" del dashboard. `today` en yyyy-mm-dd (local). */
export function obraSummary(progress: ConstructionProgress | null, today: string): ObraSummary {
  const p = progress ?? emptyProgress();
  const days = daysSinceLastUpdate(p, today);
  const month = today.slice(0, 7);
  return {
    empty: days == null,
    days,
    percent: p.percent,
    hasThisMonth: p.updates.some(u => u.date.slice(0, 7) === month),
    stale: days != null && days > 31,
  };
}
