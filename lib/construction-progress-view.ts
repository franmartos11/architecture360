import type { ConstructionProgress, ConstructionUpdate } from '@/types';
import { constructionMonth, currentStageIndex, formatUpdateDate, hasConstructionProgress, visibleUpdates } from '@/lib/construction-progress';

// Cómo se arma lo que ve el comprador a partir del avance de obra: cuadros
// del time-lapse, ángulos, la comparación del mismo ángulo, la línea del
// hero. Vive aparte de construction-progress.ts porque eso lo comparten el
// panel y el saneado; esto es solo del sitio. Todo recibe las entradas ya
// filtradas por `visibleUpdates` (sin borradores, de la más vieja a la más
// nueva) — nada de acá vuelve a mirar `draft`.

/** Un cuadro del time-lapse: una foto o un clip. */
export interface LapseFrame {
  key: string;
  update: ConstructionUpdate;
  /** Foto del cuadro. En un clip, la portada (poster) si la entrada tiene fotos. */
  image?: string;
  /** URL del clip si el cuadro es de video. */
  video?: string;
}

/**
 * Cuadros en orden: por cada entrada, primero el clip (si hay — en la
 * historia también va en lugar de la portada) y después sus fotos.
 */
export function lapseFrames(updates: ConstructionUpdate[]): LapseFrame[] {
  return updates.flatMap(u => [
    ...(u.video ? [{ key: `${u.id}-v`, update: u, video: u.video, image: u.images[0] }] : []),
    ...u.images.map((image, k) => ({ key: `${u.id}-${k}`, update: u, image })),
  ]);
}

/** El ángulo de una entrada normalizado: "frente " y "Frente" son el mismo. */
function angleOf(u: ConstructionUpdate): string | undefined {
  const v = u.view?.trim();
  return v ? v.charAt(0).toUpperCase() + v.slice(1) : undefined;
}

/** ¿El cuadro es de este ángulo? (comparación normalizada, igual que `lapseAngles`). */
export function frameHasAngle(frame: LapseFrame, angle: string): boolean {
  return angleOf(frame.update)?.toLowerCase() === angle.toLowerCase();
}

/**
 * Ángulos que merecen un filtro en el time-lapse: los que tienen 2 o más
 * cuadros. Si no hay al menos dos así, devuelve [] — un solo chip no
 * filtra nada y "Todos" contra "Frente" con 7 de 8 cuadros no cambia la
 * película. Ordenados por cantidad de cuadros (el más fotografiado primero).
 */
export function lapseAngles(frames: LapseFrame[]): string[] {
  const count = new Map<string, number>();
  for (const f of frames) {
    const a = angleOf(f.update);
    if (a) count.set(a.toLowerCase(), (count.get(a.toLowerCase()) ?? 0) + 1);
  }
  const labels = new Map<string, string>();
  for (const f of frames) {
    const a = angleOf(f.update);
    if (a && !labels.has(a.toLowerCase())) labels.set(a.toLowerCase(), a);
  }
  const ok = [...count.entries()].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]);
  return ok.length >= 2 ? ok.map(([k]) => labels.get(k)!) : [];
}

/** Una punta de la comparación: foto, fecha y "Mes N de obra" si se sabe. */
export interface CompareEnd {
  update: ConstructionUpdate;
  image: string;
  label: string;
}

/**
 * Primera contra última foto del ángulo con más entradas (con foto, al
 * menos 2). Empate: el que llega más cerca de hoy, que es el que muestra
 * más avance. null si ningún ángulo tiene dos entradas.
 */
export function sameAngleComparison(progress: ConstructionProgress, updates: ConstructionUpdate[]): { angle: string; months: number; before: CompareEnd; after: CompareEnd } | null {
  const byAngle = new Map<string, ConstructionUpdate[]>();
  for (const u of updates) {
    const a = angleOf(u);
    if (!a || !u.images[0]) continue;
    const list = byAngle.get(a.toLowerCase()) ?? [];
    list.push(u);
    byAngle.set(a.toLowerCase(), list);
  }
  let best: ConstructionUpdate[] | null = null;
  for (const list of byAngle.values()) {
    if (list.length < 2) continue;
    if (!best || list.length > best.length || (list.length === best.length && list[list.length - 1].date > best[best.length - 1].date)) best = list;
  }
  if (!best) return null;
  const end = (u: ConstructionUpdate): CompareEnd => {
    const month = constructionMonth(progress, u.date);
    return { update: u, image: u.images[0], label: [formatUpdateDate(u.date), month ? `Mes ${month} de obra` : null].filter(Boolean).join(' · ') };
  };
  const first = best[0];
  const last = best[best.length - 1];
  const [y0, m0] = first.date.split('-').map(Number);
  const [y1, m1] = last.date.split('-').map(Number);
  return { angle: angleOf(first)!, months: (y1 - y0) * 12 + (m1 - m0), before: end(first), after: end(last) };
}

const MONTH_NAMES = /^(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)\b/i;

/**
 * "72% de avance · Terminaciones · Entrega estimada diciembre 2027": lo que
 * haya de las tres cosas. La entrega es texto libre — si arranca con un mes
 * se le antepone "Entrega estimada"; si no ("Posesión desde junio 2027")
 * ya se explica sola. Sin ninguna de las tres, la fecha de la última
 * entrada. null si no hay nada.
 */
export function progressHeadline(progress: ConstructionProgress): string | null {
  const current = currentStageIndex(progress);
  const stage = current >= 0 ? progress.stages[current]?.label : undefined;
  const estimate = progress.deliveryEstimate?.trim();
  const parts = [
    progress.percent != null ? `${progress.percent}% de avance` : null,
    stage,
    estimate ? (MONTH_NAMES.test(estimate) ? `Entrega estimada ${estimate.charAt(0).toLowerCase()}${estimate.slice(1)}` : estimate) : null,
  ].filter(Boolean);
  if (parts.length > 0) return parts.join(' · ');
  // Solo fotos, sin número ni entrega: igual vale avisar que hay obra que ver.
  const last = visibleUpdates(progress).at(-1);
  return last ? `Avance de obra · actualizado ${formatUpdateDate(last.date)}` : null;
}

/**
 * ¿La landing muestra la sección de avance? La tiene que tener prendida el
 * admin (está apagada por defecto) y tener algo para mostrar. El hero y el
 * menú apuntan a #avance solo en ese caso: un enlace a una sección que no
 * está no lleva a ningún lado.
 */
export function showsConstructionProgress(progress: ConstructionProgress | undefined | null, sectionOrder: readonly string[]): progress is ConstructionProgress {
  return sectionOrder.includes('progress') && hasConstructionProgress(progress);
}

/** Cuántas entradas entran en la historia con scroll (cada una ocupa 70vh). */
export const STORY_MAX = 8;

/** Las últimas `max` entradas — con 30 la historia serían 21 pantallas. */
export function storyWindow(updates: ConstructionUpdate[], max = STORY_MAX): ConstructionUpdate[] {
  return updates.length > max ? updates.slice(-max) : updates;
}

/** id del ancla de una entrada: `#avance-<id>` lleva directo a ella. */
export const updateAnchorId = (id: string) => `avance-${id}`;

/** El id de entrada de un hash `#avance-<id>`, o null. */
export function updateIdFromHash(hash: string): string | null {
  const m = /^#avance-(.+)$/.exec(hash);
  return m ? decodeURIComponent(m[1]) : null;
}
