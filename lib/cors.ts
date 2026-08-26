// Quién puede llamar a /api/** desde un browser. El objetivo es que SOLO
// el propio frontend (este sitio) pueda hacer fetch/XHR contra el
// backend — no bloquea a curl/servidores (esos no mandan Origin, y no hay
// forma de distinguirlos de una petición legítima sin Origin de todos
// modos), pero sí bloquea que un browser en OTRO sitio llegue a leer la
// respuesta, y de paso corta la petición completa vía el chequeo en
// proxy.ts antes de que llegue al handler.
//
// Mismo criterio de "dominio propio" que ya usa proxy.ts para los
// subdominios por proyecto: mientras no haya NEXT_PUBLIC_ROOT_DOMAIN
// configurado, el sitio vive en localhost (dev) y en el dominio que
// Vercel le asigna al deploy — ver VERCEL_URL/VERCEL_PROJECT_PRODUCTION_URL
// más abajo. El día que se sume dominio propio, alcanza con setear esa
// env var para que quede whitelisteado acá también, sin tocar código.
const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN;

function isLocalDevOrigin(origin: string): boolean {
  return /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
}

// VERCEL_URL / VERCEL_PROJECT_PRODUCTION_URL vienen sin protocolo (ej.
// "my-app-abc123.vercel.app") — las provee Vercel automáticamente en cada
// deploy, no hace falta configurarlas a mano.
function isOwnVercelOrigin(origin: string): boolean {
  const hosts = [process.env.VERCEL_URL, process.env.VERCEL_PROJECT_PRODUCTION_URL].filter(
    (h): h is string => !!h
  );
  return hosts.some(host => origin === `https://${host}`);
}

function isRootDomainOrigin(origin: string): boolean {
  if (!ROOT_DOMAIN) return false;
  try {
    const url = new URL(origin);
    if (url.protocol !== 'https:') return false;
    const hostname = url.hostname;
    return hostname === ROOT_DOMAIN || hostname === `www.${ROOT_DOMAIN}` || hostname.endsWith(`.${ROOT_DOMAIN}`);
  } catch {
    return false;
  }
}

/**
 * `origin` es lo que manda el browser en el header `Origin` — null cuando
 * la petición no vino de un fetch/XHR cross-context (curl, server-to-server,
 * health checks, o un fetch same-origin en algunos navegadores/métodos).
 * Sin Origin no hay nada que CORS pueda proteger — se deja pasar; lo que
 * SÍ bloquea esto es un browser en otro sitio tratando de pegarle a la API.
 */
export function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return true;
  if (process.env.NODE_ENV !== 'production' && isLocalDevOrigin(origin)) return true;
  if (isOwnVercelOrigin(origin)) return true;
  if (isRootDomainOrigin(origin)) return true;
  return false;
}

/**
 * Headers a sumarle a CUALQUIER respuesta de /api/** cuando el origin está
 * permitido (o no vino ninguno) — tanto la respuesta real como el preflight
 * OPTIONS los necesitan, así que es la misma función para los dos casos.
 */
export function corsHeaders(origin: string | null): Record<string, string> {
  if (!origin) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}
