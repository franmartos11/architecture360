import { createClient } from '@/lib/supabase/server';
import AppShell from '@/components/app/AppShell';
import { PresenceProvider } from '@/lib/presence-context';

// Chrome compartido por todo lo que es "la red" (feed, directorio,
// portfolios públicos) — a diferencia de /admin (gestión de un proyecto
// puntual) o /proyecto/[slug] (el sitio público de un proyecto), este
// grupo es donde vive la parte social de la cuenta. Se resuelve sesión +
// perfil una sola vez acá, del lado del servidor, para que la nav no
// tenga que pedirlo de nuevo en cada página.
export default async function SocialLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

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
