import { projectCanonical } from '@/lib/project-canonical';
import type { Locale } from './locales';

/**
 * Canonical y versiones por idioma de una página del sitio (metadata.alternates).
 * Con un solo idioma, solo el canonical de siempre. x-default → castellano.
 */
export async function alternatesFor(
  slug: string,
  subpath: string,
  locales: Locale[],
  actual: Locale,
): Promise<{ canonical: string; languages?: Record<string, string> }> {
  const base = await projectCanonical(slug, '');
  const url = (l: Locale) => `${base}${l === 'es' ? '' : `/${l}`}${subpath}`;
  if (locales.length < 2) return { canonical: url('es') };
  const languages: Record<string, string> = Object.fromEntries(locales.map((l) => [l, url(l)]));
  languages['x-default'] = url('es');
  return { canonical: url(actual), languages };
}
