import { type NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

// Nota: mientras no exista un proyecto Supabase configurado (ver
// .env.local.example), este proxy no hace nada — así el sitio
// sigue funcionando con data/mockData.ts y el login viejo del admin
// tal como está hoy. En cuanto se completen las env vars, empieza a
// proteger /admin con sesión real de Supabase Auth.
const SUPABASE_CONFIGURED =
  !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Dominio propio para subdominios por proyecto (mi-proyecto.tudominio.com),
// al estilo de cómo Vercel le da su propia URL a cada deploy — no se puede
// lograr eso mismo debajo de *.vercel.app porque ese dominio es de Vercel,
// no nuestro. Mientras esta env var no esté seteada, toda esta sección es
// un no-op y el sitio sigue andando por /proyecto/[slug] como hasta ahora.
//
// Para activarlo el día que haya dominio propio:
//   1. Comprar el dominio (ej: architecture360.com).
//   2. DNS: registro CNAME/A wildcard *.architecture360.com → Vercel.
//   3. Vercel → Project Settings → Domains → agregar *.architecture360.com.
//   4. Setear NEXT_PUBLIC_ROOT_DOMAIN=architecture360.com (sin protocolo,
//      sin www) en las env vars del proyecto.
const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN;

// Un pedido a un archivo con extensión (imagen, ícono, etc.) nunca es una
// ruta de página — no tiene sentido evaluarlo como subdominio de proyecto.
function isStaticAssetPath(pathname: string) {
  return pathname.startsWith('/_next') || /\.[a-zA-Z0-9]+$/.test(pathname);
}

// Si el host es un subdominio de nuestro propio dominio (ni el dominio
// raíz, ni "www", ni localhost, ni un preview de *.vercel.app) lo tratamos
// como "mi-proyecto.tudominio.com" → el subdominio ES el slug del proyecto.
function resolveProjectSlugFromHost(host: string): string | null {
  if (!ROOT_DOMAIN) return null;
  const hostname = host.split(':')[0].toLowerCase();
  if (hostname === ROOT_DOMAIN || hostname === `www.${ROOT_DOMAIN}`) return null;
  if (!hostname.endsWith(`.${ROOT_DOMAIN}`)) return null;
  const subdomain = hostname.slice(0, -(`.${ROOT_DOMAIN}`.length));
  if (!subdomain || subdomain.includes('.')) return null; // solo un nivel de subdominio
  return subdomain;
}

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const isAdminScope = pathname.startsWith('/admin') || pathname.startsWith('/api/admin');

  if (!isAdminScope) {
    // Fuera del admin (sitio público, marketing, assets): si el visitante
    // entró por un subdominio de proyecto, reescribimos por dentro a
    // /proyecto/[slug] sin que la URL que ve cambie. El admin queda
    // siempre en el dominio raíz a propósito — no es por proyecto.
    if (!isStaticAssetPath(pathname)) {
      const host = request.headers.get('host');
      const projectSlug = host ? resolveProjectSlugFromHost(host) : null;
      if (projectSlug) {
        const url = request.nextUrl.clone();
        url.pathname = `/proyecto/${projectSlug}${pathname === '/' ? '' : pathname}`;
        return NextResponse.rewrite(url);
      }
    }
    return NextResponse.next();
  }

  if (!SUPABASE_CONFIGURED) {
    return NextResponse.next();
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => supabaseResponse.cookies.set(name, value, options));
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();

  const PUBLIC_ADMIN_PATHS = ['/admin/login', '/admin/signup', '/admin/forgot-password', '/admin/reset-password'];
  const isAdminApiRoute = pathname.startsWith('/api/admin');
  const isAdminPageRoute = pathname.startsWith('/admin') && !PUBLIC_ADMIN_PATHS.includes(pathname);

  if (isAdminApiRoute && !user) {
    // Las rutas API de admin usan la service_role key internamente (bypasea
    // RLS), así que necesitan su propio chequeo acá — no alcanza con
    // proteger la página, cualquiera podría pegarle directo a la API.
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  if (isAdminPageRoute && !user) {
    const url = request.nextUrl.clone();
    url.pathname = '/admin/login';
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

// Antes solo corría en /admin y /api/admin. Ahora corre en casi todo (menos
// los assets internos de Next) porque el chequeo de subdominio necesita ver
// el Host de cualquier request pública — el resto de la función sigue
// resolviendo en el primer if para esas rutas, sin tocar Supabase para nada.
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)'],
};
