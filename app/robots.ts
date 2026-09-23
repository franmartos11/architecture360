import type { MetadataRoute } from 'next';
import { headers } from 'next/headers';
import { resolveProjectSlugFromHost } from '@/lib/project-subdomain';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

/**
 * Igual que el sitemap: hay uno por origin.
 *
 * En el subdominio de un proyecto, el robots tiene que apuntar al sitemap de
 * ESE origin. Si apunta al del dominio raíz, el buscador se encuentra con un
 * sitemap de otro sitio y lo ignora — que es lo que pasaba antes.
 */
export default async function robots(): Promise<MetadataRoute.Robots> {
  const host = (await headers()).get('host');
  const enSubdominioDeProyecto = host ? resolveProjectSlugFromHost(host) !== null : false;
  const base = enSubdominioDeProyecto ? `${protocoloDe(host!)}://${host}` : SITE_URL;

  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/admin', '/api'],
    },
    sitemap: `${base}/sitemap.xml`,
  };
}

const protocoloDe = (host: string) => (host.startsWith('localhost') || host.startsWith('127.0.0.1') ? 'http' : 'https');
