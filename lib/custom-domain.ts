import { isPlatformHost } from './project-host';

// Mismo formato que el check de project_domains.hostname en schema.sql.
const HOSTNAME_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;

export const MAX_DOMAINS_PER_PROJECT = 5;

/**
 * Un dominio que queda 'pending' (nunca se verificó) vence a los 7 días: sin
 * esto, cualquiera podía reservar el dominio de otro (www.competidor.com) y
 * dejarlo tomado para siempre, porque la unicidad de la tabla le diría al dueño
 * real "ya está en uso".
 */
export const PENDING_TTL_DAYS = 7;

export function isExpiredPending(row: { status: string; created_at: string }, now: Date = new Date()): boolean {
  return row.status === 'pending' && now.getTime() - Date.parse(row.created_at) > PENDING_TTL_DAYS * 86_400_000;
}

// El dominio de la plataforma con y sin www, y cualquier subdominio suyo
// (isPlatformHost solo cubre el hostname exacto de NEXT_PUBLIC_SITE_URL y
// NEXT_PUBLIC_ROOT_DOMAIN, que puede no estar seteada).
function isUnderSiteDomain(hostname: string): boolean {
  let site: string;
  try {
    site = new URL(process.env.NEXT_PUBLIC_SITE_URL ?? '').hostname.toLowerCase();
  } catch {
    return false;
  }
  const apex = site.replace(/^www\./, '');
  return !!apex && (hostname === apex || hostname.endsWith(`.${apex}`));
}

/**
 * Lo que el dueño tipea ("https://WWW.Torre.com/") → el hostname limpio que
 * se guarda ("www.torre.com"), o un mensaje de error en criollo.
 */
export function parseCustomHostname(input: string): { hostname: string } | { error: string } {
  const hostname = input
    .trim()
    .toLowerCase()
    .replace(/^[a-z]+:\/\//, '')
    .replace(/[/?#].*$/, '')
    .replace(/:\d+$/, '')
    .replace(/\.$/, '');

  if (!hostname) return { error: 'Escribí el dominio.' };
  if (hostname.length > 253 || !HOSTNAME_RE.test(hostname)) {
    return { error: 'Ese dominio no es válido. Ejemplo: www.tuproyecto.com' };
  }
  if (hostname.split('.').some(label => label.length > 63)) {
    return { error: 'Ese dominio no es válido: una parte tiene más de 63 caracteres.' };
  }
  if (isPlatformHost(hostname) || isUnderSiteDomain(hostname)) {
    return { error: 'Ese dominio es de la plataforma. Usá uno propio, por ejemplo www.tuproyecto.com' };
  }
  return { hostname };
}
