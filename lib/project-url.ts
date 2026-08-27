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
