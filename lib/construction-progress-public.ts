import type { ConstructionProgress } from '@/types';

/**
 * El avance tal como sale al sitio público: sin las entradas en borrador.
 * La vista ya las filtra (visibleUpdates), pero el blob entero viaja en el
 * HTML/RSC de la página, así que un borrador con fotos todavía no publicadas
 * se podía leer desde el código fuente. Se saca acá, antes de cachear.
 */
export function withoutDraftUpdates(progress: ConstructionProgress | undefined): ConstructionProgress | undefined {
  if (!progress) return progress;
  if (!progress.updates.some(u => u.draft)) return progress;
  return { ...progress, updates: progress.updates.filter(u => !u.draft) };
}
