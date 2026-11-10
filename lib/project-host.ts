// "¿Este Host a qué proyecto pertenece?" — con las dos formas que hay:
//   1. subdominio propio de la plataforma (mi-proyecto.ROOT_DOMAIN): puro,
//      sin base de datos (ver lib/project-subdomain.ts).
//   2. dominio propio del cliente (www.torre-del-mar.com): vive en la tabla
//      project_domains, así que hay que consultarla.
//
// Un solo lugar para las dos: proxy.ts, getProjectBasePath, sitemap y robots
// llaman a resolveProjectSlugForHost() y no vuelven a decidir por su cuenta.
//
// Sin 'server-only' a propósito: lo importa proxy.ts. Lee con la anon key y
// sin cookies (igual que lib/supabase/public.ts): solo ve lo que ve cualquier
// visitante — dominios con status 'active' de proyectos publicados.
import { createClient } from '@supabase/supabase-js';
import { resolveProjectSlugFromHost } from './project-subdomain';

// El proxy corre en CADA pedido de página, así que la consulta se cachea en
// memoria de la instancia. 60 s = un dominio recién activado tarda a lo sumo
// eso en empezar a andar; un dominio dado de baja, lo mismo en dejar de andar.
const TTL_MS = 60_000;
// Si la consulta FALLA (tabla todavía no creada, base caída) se recuerda un
// rato corto: sin esto, cada pedido a una página de proyecto dispararía una
// consulta que sabemos que va a fallar, y el log se llenaría. Corto para que
// una base que vuelve (o un SQL recién aplicado) se note rápido.
const ERROR_TTL_MS = 10_000;
const MAX_ENTRIES = 500; // tope duro: el Host lo manda el visitante
type Entry<T> = { value: T; until: number };
const cache = new Map<string, Entry<string | null>>();

function remember<T>(map: Map<string, Entry<T>>, key: string, value: T, ttl: number) {
  if (map.size >= MAX_ENTRIES) map.delete(map.keys().next().value!);
  map.set(key, { value, until: Date.now() + ttl });
}

export function normalizeHost(host: string): string {
  return host.split(':')[0].trim().toLowerCase().replace(/\.$/, '');
}

// Hosts que son de la plataforma y nunca de un cliente: no tiene sentido (ni
// es barato) consultar la base por ellos.
export function isPlatformHost(hostname: string): boolean {
  if (!hostname || hostname === 'localhost' || /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)) return true;
  if (hostname.endsWith('.localhost') || hostname.endsWith('.vercel.app')) return true;
  const root = process.env.NEXT_PUBLIC_ROOT_DOMAIN?.toLowerCase();
  if (root && (hostname === root || hostname.endsWith(`.${root}`))) return true;
  try {
    const site = process.env.NEXT_PUBLIC_SITE_URL;
    if (site && new URL(site).hostname.toLowerCase() === hostname) return true;
  } catch { /* NEXT_PUBLIC_SITE_URL mal formada: se ignora */ }
  return false;
}

async function lookupCustomDomain(hostname: string): Promise<string | null> {
  const hit = cache.get(hostname);
  if (hit && Date.now() < hit.until) return hit.value;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;

  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await supabase
    .from('project_domains')
    .select('projects(slug)')
    .eq('hostname', hostname)
    .eq('status', 'active')
    .maybeSingle();

  if (error) {
    console.error('[project-host] no se pudo resolver el dominio', hostname, error.message);
    remember(cache, hostname, null, ERROR_TTL_MS);
    return null;
  }

  const project = (data as { projects?: { slug: string } | { slug: string }[] | null } | null)?.projects;
  const slug = (Array.isArray(project) ? project[0]?.slug : project?.slug) ?? null;

  remember(cache, hostname, slug, TTL_MS);
  return slug;
}

export type HostProject = { slug: string; kind: 'subdomain' | 'custom' };

/** Proyecto de este Host y por qué vía llegó (subdominio de la plataforma o dominio propio), o null. */
export async function resolveHostProject(host: string): Promise<HostProject | null> {
  const bySubdomain = resolveProjectSlugFromHost(host);
  if (bySubdomain) return { slug: bySubdomain, kind: 'subdomain' };
  const hostname = normalizeHost(host);
  if (isPlatformHost(hostname)) return null;
  const slug = await lookupCustomDomain(hostname);
  return slug ? { slug, kind: 'custom' } : null;
}

/** Slug del proyecto al que pertenece este Host (subdominio o dominio propio), o null. */
export async function resolveProjectSlugForHost(host: string): Promise<string | null> {
  return (await resolveHostProject(host))?.slug ?? null;
}

// Al revés: el dominio propio activo de un proyecto, para redirigir hacia él
// el link de la plataforma. Mismo cache en memoria y mismo criterio que arriba.
// Un proyecto sin publicar no devuelve nada (la RLS no deja a anon ver su
// fila), así que el borrador nunca redirige y su vista previa sigue andando.
const canonicalCache = new Map<string, Entry<string | null>>();

export async function canonicalDomainForSlug(slug: string): Promise<string | null> {
  const hit = canonicalCache.get(slug);
  if (hit && Date.now() < hit.until) return hit.value;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;

  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await supabase
    .from('project_domains')
    .select('hostname, projects!inner(slug)')
    .eq('projects.slug', slug)
    .eq('status', 'active')
    .order('created_at', { ascending: true })
    .limit(1);
  if (error) {
    console.error('[project-host] no se pudo buscar el dominio de', slug, error.message);
    remember(canonicalCache, slug, null, ERROR_TTL_MS);
    return null;
  }

  const hostname = (data as { hostname: string }[] | null)?.[0]?.hostname ?? null;
  remember(canonicalCache, slug, hostname, TTL_MS);
  return hostname;
}

/** ¿El Origin de un fetch del browser es un dominio propio activo? (lo usa el CORS de /api). */
export async function isActiveCustomDomainOrigin(origin: string | null): Promise<boolean> {
  if (!origin) return false;
  try {
    const { protocol, host } = new URL(origin);
    if (protocol !== 'https:') return false;
    const hostname = normalizeHost(host);
    if (isPlatformHost(hostname)) return false;
    return (await lookupCustomDomain(hostname)) !== null;
  } catch {
    return false;
  }
}

/** Solo para tests. */
export function clearProjectHostCache() {
  cache.clear();
  canonicalCache.clear();
}
