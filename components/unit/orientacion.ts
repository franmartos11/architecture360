import type { Locale } from '@/lib/i18n/locales';
import { VIEW_DIRECTIONS, directionLabel, unitViewDegrees } from '@/lib/floor-views';

/**
 * Orientación de la unidad para mostrar. Es texto cargado a mano ("Norte",
 * "NE", "W"...): en castellano va tal cual; en otro idioma, si es una de las
 * 8 orientaciones, sale con su nombre en ese idioma; si no, tal cual.
 */
export function orientacionTexto(orientation: string | null | undefined, locale: Locale): string {
  if (!orientation) return '';
  if (locale === 'es') return orientation;
  const deg = unitViewDegrees({ orientation });
  return deg !== null && deg % 45 === 0 ? directionLabel(VIEW_DIRECTIONS[deg / 45], locale) : orientation;
}
