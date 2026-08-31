import { createClient } from '@/lib/supabase/server';
import { getRequestUser } from '@/lib/supabase/auth';
import AppShell from '@/components/app/AppShell';
import { PresenceProvider } from '@/lib/presence-context';

// Chrome compartido por todo lo que es "la red" (feed, directorio,
// portfolios públicos) — a diferencia de /admin (gestión de un proyecto
// puntual) o /proyecto/[slug] (el sitio público de un proyecto), este
// grupo es donde vive la parte social de la cuenta. Se resuelve sesión +
// perfil una sola vez acá, del lado del servidor, para que la nav no
// tenga que pedirlo de nuevo en cada página. getRequestUser() (en vez de
// supabase.auth.getUser() directo) es clave acá: ese método hace un
// round-trip de red a la API de Auth, y sin dedupear, el layout y la
// página podían resolver ese round-trip con resultados distintos dentro
// del mismo request — la nav mostraba "Ingresar" mientras el feed de
// abajo ya mostraba el perfil logueado.
export default async function SocialLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const user = await getRequestUser();

  let profileHandle: string | null = null;
  let avatarImage: string | null = null;
  if (user) {
    const { data: profile } = await supabase.from('profiles').select('handle, avatar_image').eq('id', user.id).maybeSingle();
    profileHandle = profile?.handle ?? null;
    avatarImage = profile?.avatar_image ?? null;
  }

  return (
    <PresenceProvider>
      <div className="min-h-screen bg-trevo-light">
        <AppShell userEmail={user?.email ?? null} profileHandle={profileHandle} avatarImage={avatarImage} />
        <div className="pb-14 sm:pb-0">{children}</div>
      </div>
    </PresenceProvider>
  );
}
