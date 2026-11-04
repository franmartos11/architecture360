import { sanitizeMultiline, sanitizeText } from '@/lib/sanitize';
import { MAX_IMAGES_PER_UPDATE, MAX_STAGES, MAX_UPDATES, newProgressId } from '@/lib/construction-progress';
import type { ConstructionProgress, ConstructionStage, ConstructionUpdate } from '@/types';

// Normaliza el avance de obra tal como llega del admin (PATCH
// /api/admin/project) o de la base (data/project-repository.ts): todo el
// texto pasa por sanitize, los ids se reparan, las referencias a etapas que
// ya no existen se sueltan y las fotos tienen que ser URLs http(s). Devuelve
// null cuando no queda nada cargado — así la columna vuelve a "sin avance".

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ID_RE = /^[a-z0-9_-]{1,40}$/i;

function cleanId(input: unknown, taken: Set<string>): string {
  let id = typeof input === 'string' && ID_RE.test(input) ? input : newProgressId();
  while (taken.has(id)) id = newProgressId();
  taken.add(id);
  return id;
}

function cleanImage(input: unknown): string | null {
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
      const label = sanitizeText((s as { label?: unknown })?.label, 40);
      return label ? [{ id: cleanId((s as { id?: unknown }).id, stageIds), label }] : [];
    });
  const validStage = (id: unknown) => (typeof id === 'string' && stageIds.has(id) ? id : undefined);

  const updateIds = new Set<string>();
  const updates: ConstructionUpdate[] = (Array.isArray(raw.updates) ? raw.updates : [])
    .slice(0, MAX_UPDATES)
    .flatMap(item => {
      const r = (item ?? {}) as Record<string, unknown>;
      const date = typeof r.date === 'string' && DATE_RE.test(r.date) ? r.date : null;
      if (!date) return [];
      const images = (Array.isArray(r.images) ? r.images : [])
        .map(cleanImage)
        .filter((x): x is string => !!x)
        .slice(0, MAX_IMAGES_PER_UPDATE);
      const title = sanitizeText(r.title, 120);
      const body = sanitizeMultiline(r.body, 1000);
      const view = sanitizeText(r.view, 40);
      // Una actualización sin título ni fotos no tiene nada que mostrar.
      if (!title && images.length === 0) return [];
      const update: ConstructionUpdate = { id: cleanId(r.id, updateIds), date, title, images };
      const stageId = validStage(r.stageId);
      if (stageId) update.stageId = stageId;
      if (body) update.body = body;
      if (view) update.view = view;
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

  const empty = stages.length === 0 && updates.length === 0 && out.percent == null && !out.deliveryEstimate;
  return empty ? null : out;
}
