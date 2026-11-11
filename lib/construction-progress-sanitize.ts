import { sanitizeMultiline, sanitizeText } from '@/lib/sanitize';
import { MAX_IMAGES_PER_UPDATE, MAX_STAGES, MAX_UPDATES, newProgressId } from '@/lib/construction-progress';
import type { ConstructionProgress, ConstructionStage, ConstructionUpdate } from '@/types';

// Normaliza el avance de obra tal como llega del admin (PATCH
// /api/admin/project) o de la base (data/project-repository.ts): todo el
// texto pasa por sanitize, los ids se reparan, las referencias a etapas que
// ya no existen se sueltan y las fotos tienen que ser URLs http(s). Devuelve
// null cuando no queda nada cargado — así la columna vuelve a "sin avance".
//
// La FORMA y los topes de tamaño del payload los corta antes el schema zod
// (constructionProgressSchema en lib/project-schemas.ts); acá se asume que
// ya pasó por ahí (o que viene de la base) y se trabaja campo por campo.

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ID_RE = /^[a-z0-9_-]{1,40}$/i;

function cleanId(input: unknown, taken: Set<string>): string {
  let id = typeof input === 'string' && ID_RE.test(input) ? input : newProgressId();
  while (taken.has(id)) id = newProgressId();
  taken.add(id);
  return id;
}

function cleanDate(input: unknown): string | null {
  return typeof input === 'string' && DATE_RE.test(input) ? input : null;
}

/** URL http(s) de un archivo subido (foto o clip). */
function cleanMediaUrl(input: unknown): string | null {
  if (typeof input !== 'string' || input.length > 1000) return null;
  return /^https?:\/\//i.test(input.trim()) ? input.trim() : null;
}

export function parseConstructionProgress(input: unknown): ConstructionProgress | null {
  if (!input || typeof input !== 'object') return null;
  const raw = input as Record<string, unknown>;

  const stageIds = new Set<string>();
  const stages: ConstructionStage[] = (Array.isArray(raw.stages) ? raw.stages : [])
    .slice(0, MAX_STAGES)
    .flatMap(s => {
      const r = (s ?? {}) as Record<string, unknown>;
      const label = sanitizeText(r.label, 40);
      if (!label) return [];
      const stage: ConstructionStage = { id: cleanId(r.id, stageIds), label };
      const from = cleanDate(r.from);
      const to = cleanDate(r.to);
      if (from) stage.from = from;
      // Un fin anterior al inicio es un error de carga: se descarta el fin, no la etapa.
      if (to && (!from || to >= from)) stage.to = to;
      return [stage];
    });
  const validStage = (id: unknown) => (typeof id === 'string' && stageIds.has(id) ? id : undefined);

  const updateIds = new Set<string>();
  const updates: ConstructionUpdate[] = (Array.isArray(raw.updates) ? raw.updates : [])
    .slice(0, MAX_UPDATES)
    .flatMap(item => {
      const r = (item ?? {}) as Record<string, unknown>;
      const date = cleanDate(r.date);
      if (!date) return [];
      const images = (Array.isArray(r.images) ? r.images : [])
        .map(cleanMediaUrl)
        .filter((x): x is string => !!x)
        .slice(0, MAX_IMAGES_PER_UPDATE);
      const video = cleanMediaUrl(r.video);
      const title = sanitizeText(r.title, 120);
      const body = sanitizeMultiline(r.body, 1000);
      const view = sanitizeText(r.view, 40);
      // Una actualización sin título ni fotos ni clip no tiene nada que mostrar.
      if (!title && images.length === 0 && !video) return [];
      const update: ConstructionUpdate = { id: cleanId(r.id, updateIds), date, title, images };
      const stageId = validStage(r.stageId);
      if (stageId) update.stageId = stageId;
      if (body) update.body = body;
      if (video) update.video = video;
      if (view) update.view = view;
      if (r.draft === true) update.draft = true;
      // Marca del servidor (ver notifiedAt en types): se conserva si es una fecha válida, nunca se inventa.
      if (typeof r.notifiedAt === 'string' && !Number.isNaN(Date.parse(r.notifiedAt))) update.notifiedAt = r.notifiedAt;
      return [update];
    });

  const out: ConstructionProgress = { stages, updates };
  const currentStageId = validStage(raw.currentStageId);
  if (currentStageId) out.currentStageId = currentStageId;
  if (typeof raw.percent === 'number' && Number.isFinite(raw.percent)) {
    out.percent = Math.round(Math.min(100, Math.max(0, raw.percent)));
  }
  const delivery = sanitizeText(raw.deliveryEstimate, 80);
  if (delivery) out.deliveryEstimate = delivery;
  const startedAt = cleanDate(raw.startedAt);
  if (startedAt) out.startedAt = startedAt;
  // updatedAt lo pone el servidor al guardar (ver la ruta), no se acepta del
  // panel; al leer de la base se conserva tal cual quedó.
  if (typeof raw.updatedAt === 'string' && !Number.isNaN(Date.parse(raw.updatedAt))) out.updatedAt = raw.updatedAt;

  const empty = stages.length === 0 && updates.length === 0 && out.percent == null && !out.deliveryEstimate && !out.startedAt;
  return empty ? null : out;
}

/**
 * Marca el blob con la hora del guardado. Se llama en la ruta DESPUÉS de
 * sanear, y pisa cualquier updatedAt que haya venido del panel: la marca
 * es siempre del servidor.
 */
export function stampConstructionProgress(progress: ConstructionProgress, now: Date = new Date()): ConstructionProgress {
  return { ...progress, updatedAt: now.toISOString() };
}
