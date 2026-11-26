import { DEFAULT_LOCALE, isLocale, LOCALES, type Locale } from './locales';

/** projects.locales → idiomas activos del sitio: castellano siempre, primero. */
export function parseLocales(raw: unknown): Locale[] {
  const pedidos = Array.isArray(raw) ? raw.filter(isLocale) : [];
  return LOCALES.filter((l) => l === DEFAULT_LOCALE || pedidos.includes(l));
}
