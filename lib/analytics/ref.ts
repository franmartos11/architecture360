import { slugify } from '@/lib/slug';

/**
 * Forma canónica de un canal: la misma para el ?ref= / utm_source que llega
 * (navegador y rutas) y para el slug de project_channels, así "Registrar" un
 * link sin registrar siempre coincide (facebook_ads → facebook-ads, Pérez → perez).
 */
export function normalizeRef(raw: string | null | undefined): string {
  return slugify(raw ?? '').slice(0, 60).replace(/-+$/, '');
}
