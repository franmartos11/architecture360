import { type NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

// Nota: mientras no exista un proyecto Supabase configurado (ver
// .env.local.example), este proxy no hace nada — así el sitio
// sigue funcionando con data/mockData.ts y el login viejo del admin
// tal como está hoy. En cuanto se completen las env vars, empieza a
// proteger /admin con sesión real de Supabase Auth.
const SUPABASE_CONFIGURED =
  !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export async function proxy(request: NextRequest) {
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

  const pathname = request.nextUrl.pathname;
  const isAdminApiRoute = pathname.startsWith('/api/admin');
  const isAdminPageRoute = pathname.startsWith('/admin') && pathname !== '/admin/login';

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

export const config = {
  matcher: ['/admin/:path*', '/api/admin/:path*'],
};
