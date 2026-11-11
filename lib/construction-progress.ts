import type { ConstructionProgress, ConstructionStage, ConstructionUpdate, ProjectType } from '@/types';

// Avance de obra — helpers compartidos por la landing, el admin y el
// laboratorio. La pieza es la misma para cualquier tipo de proyecto: las
// etapas las define cada uno. Lo de acá abajo son solo SUGERENCIAS para no
// arrancar de cero; el admin las puede renombrar, reordenar o borrar.
// (La validación de lo que llega del admin vive en
// construction-progress-sanitize.ts, que usa sanitize-html — no tiene que
// terminar en el bundle del navegador.)

export const SUGGESTED_STAGES: Record<ProjectType, string[]> = {
  edificio: ['Excavación', 'Estructura', 'Cerramientos', 'Terminaciones', 'Entrega'],
  unico: ['Excavación', 'Estructura', 'Cerramientos', 'Terminaciones', 'Entrega'],
  duplex: ['Cimientos', 'Muros', 'Techo', 'Terminaciones', 'Entrega'],
  casa: ['Cimientos', 'Muros', 'Techo', 'Terminaciones', 'Entrega'],
  loteo: ['Amojonamiento', 'Apertura de calles', 'Agua y cloacas', 'Electricidad', 'Entrega'],
};

export const MAX_STAGES = 12;
export const MAX_UPDATES = 100;
export const MAX_IMAGES_PER_UPDATE = 12;

/** id corto para etapas y actualizaciones (no necesita ser global, solo único dentro del proyecto). */
export function newProgressId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export function suggestedStages(projectType: ProjectType | undefined): ConstructionStage[] {
  return (SUGGESTED_STAGES[projectType ?? 'edificio'] ?? SUGGESTED_STAGES.edificio).map(label => ({ id: newProgressId(), label }));
}

export function emptyProgress(): ConstructionProgress {
  return { stages: [], updates: [] };
}

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** "2026-03-14" → "mar 2026". Sin Date para no depender de la zona horaria. */
export function formatUpdateDate(iso: string): string {
  const [y, m] = iso.split('-').map(Number);
  if (!y) return '';
  return `${MONTHS[(m || 1) - 1]} ${y}`;
}

export function stageLabelOf(progress: ConstructionProgress, id: string | undefined): string | undefined {
  return id ? progress.stages.find(s => s.id === id)?.label : undefined;
}

/** ¿Tiene algo que mostrar en el sitio? Al menos una foto o un clip, y no es borrador. */
export function isPublishedUpdate(u: ConstructionUpdate): boolean {
  return !u.draft && (u.images.length > 0 || !!u.video);
}

/** Actualizaciones publicadas con foto o clip, de la más vieja a la más nueva. Es lo que ve el sitio. */
export function visibleUpdates(progress: ConstructionProgress): ConstructionUpdate[] {
  return progress.updates
    .filter(isPublishedUpdate)
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** La entrada más reciente por fecha (borradores incluidos si `includeDrafts`), o undefined. */
export function latestUpdate(progress: ConstructionProgress, { includeDrafts = false } = {}): ConstructionUpdate | undefined {
  return [...progress.updates]
    .filter(u => includeDrafts || !u.draft)
    .sort((a, b) => b.date.localeCompare(a.date))[0];
}

const DAY_MS = 86_400_000;
/** Días enteros entre dos fechas yyyy-mm-dd (en UTC, sin zona horaria). Negativo si `to` es anterior. */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}

/** Días desde la última entrada publicada hasta `today` (yyyy-mm-dd), o null si no hay ninguna. Para el "hace N días" del panel. */
export function daysSinceLastUpdate(progress: ConstructionProgress, today: string): number | null {
  const last = latestUpdate(progress, { includeDrafts: true });
  return last ? daysBetween(last.date, today) : null;
}

/** "Mes N de obra" contando desde startedAt (el mes de inicio es el 1). null sin fecha de inicio o si `date` es anterior. */
export function constructionMonth(progress: ConstructionProgress, date: string): number | null {
  if (!progress.startedAt) return null;
  const [y0, m0] = progress.startedAt.split('-').map(Number);
  const [y1, m1] = date.split('-').map(Number);
  if (!y0 || !y1) return null;
  const months = (y1 - y0) * 12 + (m1 - m0) + 1;
  return months >= 1 ? months : null;
}

/** Etapa en curso: la marcada, o la de la actualización más reciente que tenga una. */
export function currentStageIndex(progress: ConstructionProgress): number {
  const byId = (id?: string) => (id ? progress.stages.findIndex(s => s.id === id) : -1);
  const marked = byId(progress.currentStageId);
  if (marked >= 0) return marked;
  const latest = [...progress.updates].sort((a, b) => b.date.localeCompare(a.date)).find(u => byId(u.stageId) >= 0);
  return latest ? byId(latest.stageId) : -1;
}

/** ¿Hay algo para mostrar en la landing? Fotos, o al menos el número / la entrega. */
export function hasConstructionProgress(progress: ConstructionProgress | undefined | null): progress is ConstructionProgress {
  if (!progress) return false;
  return visibleUpdates(progress).length > 0 || progress.percent != null || !!progress.deliveryEstimate;
}
