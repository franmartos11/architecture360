import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// A donde vuelve el navegador después de autenticarse con Google — Supabase
// deja el ?code acá para intercambiarlo por la sesión (ver proxy.ts, que
// deja pasar esta ruta sin sesión previa porque es justo la que la crea).
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/admin/proyectos';

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/admin/login?error=google`);
}
