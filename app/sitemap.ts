import type { MetadataRoute } from 'next';
import { getProjectBySlug } from '@/data/project-repository';
import { DEFAULT_PROJECT_SLUG } from '@/lib/constants';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const project = await getProjectBySlug(DEFAULT_PROJECT_SLUG);
  if (!project) return [{ url: SITE_URL, lastModified: new Date() }];

  const projectHref = `${SITE_URL}/proyecto/${project.slug}`;

  const routes: MetadataRoute.Sitemap = [
    { url: SITE_URL, changeFrequency: 'monthly', priority: 1 },
    { url: projectHref, changeFrequency: 'weekly', priority: 0.9 },
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

  return routes;
}
