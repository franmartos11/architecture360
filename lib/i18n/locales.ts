// Idiomas del sitio público de un proyecto. Castellano es el default y no
// lleva prefijo; el resto va como primer segmento (/en/...).
// Sin imports de next/react: lo usan el proxy, el servidor y el cliente.
// Spec: docs/superpowers/specs/2026-11-25-multi-idioma-design.md

export const LOCALES = ['es', 'en'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'es';
/** Header interno que pone el proxy con el idioma de la dirección. */
export const LOCALE_HEADER = 'x-atrium-lang';

export function isLocale(v: unknown): v is Locale {
  return typeof v === 'string' && (LOCALES as readonly string[]).includes(v);
}

/** Locale de Intl para fechas y números. */
export function intlLocale(l: Locale): 'es-AR' | 'en-US' {
  return l === 'en' ? 'en-US' : 'es-AR';
}
