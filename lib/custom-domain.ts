import { isPlatformHost } from './project-host';

// Mismo formato que el check de project_domains.hostname en schema.sql.
const HOSTNAME_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;

export const MAX_DOMAINS_PER_PROJECT = 5;

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
  if (isPlatformHost(hostname)) {
    return { error: 'Ese dominio es de la plataforma. Usá uno propio, por ejemplo www.tuproyecto.com' };
  }
  return { hostname };
}
