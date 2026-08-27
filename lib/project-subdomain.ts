// Lógica pura de "¿este host es el subdominio de qué proyecto?" — sin
// imports de Next.js a propósito, para que la puedan usar tanto proxy.ts
// (Edge Middleware, no soporta next/headers) como código de servidor normal
// (lib/project-url.ts, que sí puede usar next/headers). Una sola fuente de
// verdad evita que las dos copias se desincronicen con el tiempo.
const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN;

// Si el host es un subdominio de nuestro propio dominio (ni el dominio
// raíz, ni "www", ni localhost, ni un preview de *.vercel.app) lo tratamos
// como "mi-proyecto.tudominio.com" → el subdominio ES el slug del proyecto.
export function resolveProjectSlugFromHost(host: string): string | null {
  if (!ROOT_DOMAIN) return null;
  const hostname = host.split(':')[0].toLowerCase();
  if (hostname === ROOT_DOMAIN || hostname === `www.${ROOT_DOMAIN}`) return null;
  if (!hostname.endsWith(`.${ROOT_DOMAIN}`)) return null;
  const subdomain = hostname.slice(0, -(`.${ROOT_DOMAIN}`.length));
  if (!subdomain || subdomain.includes('.')) return null; // solo un nivel de subdominio
  return subdomain;
}
