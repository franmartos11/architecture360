import type { MetadataRoute } from 'next';
import { getPublicProjectBySlug } from '@/data/project-repository';
import { getPortfolioDirectory } from '@/data/profile-repository';
import { DEFAULT_PROJECT_SLUG } from '@/lib/constants';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

// Nota: esto solo cubre el proyecto por defecto y el directorio/portfolios —
// no itera TODOS los proyectos de todas las cuentas. Con NEXT_PUBLIC_ROOT_DOMAIN
// activo cada proyecto vive en su propio subdominio (otro origin), así que un
// sitemap central no puede listarlos igual — necesitaría un sitemap propio por
// subdominio. Portfolio/directorio sí viven siempre en el dominio principal.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const directory = await getPortfolioDirectory();
  const profileRoutes: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/directorio`, changeFrequency: 'daily', priority: 0.5 },
    ...directory.map(p => ({
      url: `${SITE_URL}/portfolio/${p.handle}`,
      changeFrequency: 'weekly' as const,
      priority: 0.4,
    })),
  ];

  const project = await getPublicProjectBySlug(DEFAULT_PROJECT_SLUG);
  if (!project) return [{ url: SITE_URL, lastModified: new Date() }, ...profileRoutes];

  const projectHref = `${SITE_URL}/proyecto/${project.slug}`;

  const routes: MetadataRoute.Sitemap = [
    { url: SITE_URL, changeFrequency: 'monthly', priority: 1 },
    { url: projectHref, changeFrequency: 'weekly', priority: 0.9 },
    { url: `${projectHref}/masterplan`, changeFrequency: 'weekly', priority: 0.8 },
    { url: `${projectHref}/recorrido`, changeFrequency: 'monthly', priority: 0.6 },
  ];

  if (project.amenities.length > 0) {
    routes.push({ url: `${projectHref}/amenities`, changeFrequency: 'monthly', priority: 0.6 });
  }
  if (project.pointsOfInterest.length > 0) {
    routes.push({ url: `${projectHref}/ubicacion`, changeFrequency: 'monthly', priority: 0.6 });
  }

  for (const building of project.buildings) {
    routes.push({
      url: `${projectHref}/edificio/${building.id}`,
      changeFrequency: 'weekly',
      priority: 0.7,
    });
  }

  return [...routes, ...profileRoutes];
}
