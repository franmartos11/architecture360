import { headers } from 'next/headers';
import { resolveProjectSlugFromHost } from './project-subdomain';

// La URL pública de un proyecto cambia de forma según haya o no un
// dominio propio configurado (ver proxy.ts / NEXT_PUBLIC_ROOT_DOMAIN):
// por subdominio si ya está activado, o por /proyecto/[slug] si no.
// Centralizado acá para que el día que se active el dominio, todo lo que
// muestra o copia este link (sidebar, "Proyecto", alta de proyecto) se
// actualice solo, sin tener que tocar cada pantalla una por una.
const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN;

// Para un <a href> — ruta relativa cuando es por /proyecto/[slug] (no
// depende del origin actual), o URL absoluta cuando es por subdominio
// (es, literalmente, otro host).
export function getProjectHref(slug: string): string {
  if (ROOT_DOMAIN) return `https://${slug}.${ROOT_DOMAIN}`;
  return `/proyecto/${slug}`;
}

// Para mostrar en pantalla o copiar al portapapeles — siempre absoluta.
// `origin` es window.location.origin (protocolo + host desde donde se
// está mirando el panel ahora mismo).
export function getProjectDisplayUrl(slug: string, origin: string): string {
  if (ROOT_DOMAIN) {
    const protocol = origin.startsWith('https://') ? 'https' : 'http';
    return `${protocol}://${slug}.${ROOT_DOMAIN}`;
  }
  return `${origin}/proyecto/${slug}`;
}

// Prefijo a anteponer a cualquier link INTERNO del sitio público de este
// proyecto (masterplan, ubicación, un edificio, una unidad...). Server-only
// — lee el Host real de la request vía next/headers para saber si este
// visitante en particular está viendo el proyecto por su subdominio propio
// (en cuyo caso el prefijo tiene que ser vacío: el subdominio ya "está
// adentro" del proyecto) o por /proyecto/[slug] en el dominio raíz (en cuyo
// caso hace falta anteponer ese prefijo a cada link, si no el navegador
// resuelve el href relativo al proyecto equivocado).
//
// Usar en Server Components; los Client Components dentro de
// app/proyecto/[slug]/** tienen el mismo valor disponible sin volver a
// pegarle a next/headers vía useProjectBasePath() (ver
// lib/project-base-path-context.tsx), que un layout.tsx ya carga una sola
// vez por request y distribuye por contexto de React.
export async function getProjectBasePath(slug: string): Promise<string> {
  const host = (await headers()).get('host');
  const onSubdomain = host ? resolveProjectSlugFromHost(host) === slug : false;
  return onSubdomain ? '' : `/proyecto/${slug}`;
}
