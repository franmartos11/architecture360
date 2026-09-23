import type { MetadataRoute } from 'next';
import { headers } from 'next/headers';
import { getPublicProjectBySlug } from '@/data/project-repository';
import { getIndexableProfileHandles } from '@/data/profile-repository';
import { resolveProjectSlugFromHost } from '@/lib/project-subdomain';
import { DEFAULT_PROJECT_SLUG } from '@/lib/constants';
import type { Project } from '@/types';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

/**
 * Hay un sitemap por origin, no uno solo.
 *
 * Con NEXT_PUBLIC_ROOT_DOMAIN activo, el proyecto de cada cliente vive en su
 * propio subdominio, que para un buscador es otro sitio. Un sitemap central
 * no puede listarlos: las URLs de otro origin se ignoran. Antes esto devolvía
 * siempre el del dominio raíz, así que de todos los proyectos se indexaba uno
 * solo (DEFAULT_PROJECT_SLUG) y el resto quedaba afuera salvo que un buscador
 * los encontrara por su cuenta.
 *
 * Ahora mira el Host: si el visitante vino por el subdominio de un proyecto,
 * devuelve el de ESE proyecto (mismo criterio que getProjectBasePath usa para
 * los links); si vino por el dominio raíz, el de siempre. El proxy deja pasar
 * /sitemap.xml sin reescribir, así que acá llega el host real.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const host = (await headers()).get('host');
  const slugDeSubdominio = host ? resolveProjectSlugFromHost(host) : null;

  if (slugDeSubdominio) {
    const project = await getPublicProjectBySlug(slugDeSubdominio);
    // Sin proyecto, o sin publicar: no hay nada que ofrecerle a un buscador.
    if (!project) return [];
    return rutasDelProyecto(project, `${protocoloDe(host!)}://${host}`);
  }

  return sitemapDelDominioRaiz();
}

const protocoloDe = (host: string) => (host.startsWith('localhost') || host.startsWith('127.0.0.1') ? 'http' : 'https');

/**
 * Las rutas públicas de un proyecto colgadas del origin que se le pase: su
 * subdominio propio, o el dominio raíz con el prefijo /proyecto/[slug].
 */
function rutasDelProyecto(project: Project, base: string): MetadataRoute.Sitemap {
  const rutas: MetadataRoute.Sitemap = [
    { url: base, changeFrequency: 'weekly', priority: 0.9 },
    { url: `${base}/masterplan`, changeFrequency: 'weekly', priority: 0.8 },
    { url: `${base}/unidades`, changeFrequency: 'weekly', priority: 0.8 },
    { url: `${base}/recorrido`, changeFrequency: 'monthly', priority: 0.6 },
  ];

  if (project.amenities.length > 0) {
    rutas.push({ url: `${base}/amenities`, changeFrequency: 'monthly', priority: 0.6 });
  }
  if (project.pointsOfInterest.length > 0) {
    rutas.push({ url: `${base}/ubicacion`, changeFrequency: 'monthly', priority: 0.6 });
  }
  for (const building of project.buildings) {
    rutas.push({ url: `${base}/edificio/${building.id}`, changeFrequency: 'weekly', priority: 0.7 });
  }

  return rutas;
}

async function sitemapDelDominioRaiz(): Promise<MetadataRoute.Sitemap> {
  // Filtra is_public y is_indexed en la base: quien apagó "Aparecer en
  // buscadores" sigue listado en /directorio pero no acá.
  const handles = await getIndexableProfileHandles();
  const profileRoutes: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/directorio`, changeFrequency: 'daily', priority: 0.5 },
    ...handles.map(handle => ({
      url: `${SITE_URL}/portfolio/${handle}`,
      changeFrequency: 'weekly' as const,
      priority: 0.4,
    })),
  ];

  const project = await getPublicProjectBySlug(DEFAULT_PROJECT_SLUG);
  if (!project) return [{ url: SITE_URL, lastModified: new Date() }, ...profileRoutes];

  return [
    { url: SITE_URL, changeFrequency: 'monthly', priority: 1 },
    ...rutasDelProyecto(project, `${SITE_URL}/proyecto/${project.slug}`),
    ...profileRoutes,
  ];
}
