import { headers } from 'next/headers';
import { resolveProjectSlugFromHost } from './project-subdomain';

// Prefijo a anteponer a cualquier link INTERNO del sitio público de este
// proyecto (masterplan, ubicación, un edificio, una unidad...). Server-only
// — lee el Host real de la request vía next/headers para saber si este
// visitante en particular está viendo el proyecto por su subdominio propio
// (en cuyo caso el prefijo tiene que ser vacío: el subdominio ya "está
// adentro" del proyecto) o por /proyecto/[slug] en el dominio raíz (en cuyo
// caso hace falta anteponer ese prefijo a cada link, si no el navegador
// resuelve el href relativo al proyecto equivocado).
//
// Separado de lib/project-url.ts porque ese módulo también lo importan
// Client Components (admin) para getProjectHref/getProjectDisplayUrl, y
// next/headers no puede aparecer en nada que termine en el bundle de cliente.
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
