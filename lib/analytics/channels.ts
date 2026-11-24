import { normalizeRef } from './ref';
import { getProjectDisplayUrl } from '@/lib/project-url';

// Inmobiliarias y campañas de un proyecto. Cada una tiene un link propio
// (el del sitio + ?ref=<slug>); eventos y leads guardan ese ref como texto.

export type ChannelKind = 'inmobiliaria' | 'campaña';

export interface Channel {
  id: string;
  name: string;
  slug: string;
  kind: ChannelKind;
  archived_at: string | null;
  created_at: string;
  /** Algún evento o lead ya llegó con este ref: el slug queda bloqueado. */
  has_traffic: boolean;
}

export const CHANNEL_COLUMNS = 'id, name, slug, kind, archived_at, created_at';

export function channelSlug(name: string): string {
  return normalizeRef(name);
}

export function channelLink(slug: string, projectSlug: string, origin: string, customDomain?: string | null): string {
  const url = new URL(getProjectDisplayUrl(projectSlug, origin, customDomain));
  url.searchParams.set('ref', slug);
  return url.toString();
}

/** Valor del filtro de Leads para "sin canal". */
export const NO_CHANNEL = '__none__';

/** Filtro por canal del tablero de leads: null = todos, NO_CHANNEL = sin canal, si no el ref. */
export function filterLeadsByChannel<T extends { ref?: string | null }>(leads: T[], ref: string | null): T[] {
  if (ref === null) return leads;
  if (ref === NO_CHANNEL) return leads.filter(l => !l.ref);
  return leads.filter(l => l.ref === ref);
}

/** Cómo se muestra el canal de un lead: el nombre si está registrado, el ref crudo si no. */
export function leadChannelLabel(ref: string | null | undefined, channels: Pick<Channel, 'slug' | 'name'>[]): string | null {
  if (!ref) return null;
  return channels.find(c => c.slug === ref)?.name ?? `?ref=${ref}`;
}
