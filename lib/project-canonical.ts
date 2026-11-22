import { canonicalDomainForSlug } from '@/lib/project-host';
import { getProjectHref } from '@/lib/project-url';

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000').replace(/\/+$/, '');

/**
 * URL canónica de una página del sitio de un proyecto: la dirección pública
 * real (dominio propio activo, subdominio o /proyecto/slug) más la subruta
 * ('' para la portada, '/unidades', '/edificio/x'...). Así Google indexa una
 * sola dirección por página aunque el sitio responda en varias. Va en cada
 * página y no en el layout: en el layout la heredarían todas las subpáginas
 * apuntando a la portada.
 */
export async function projectCanonical(slug: string, subpath = ''): Promise<string> {
  const base = getProjectHref(slug, await canonicalDomainForSlug(slug));
  const absoluta = base.startsWith('/') ? `${SITE_URL}${base}` : base;
  return `${absoluta}${subpath}` || '/';
}
