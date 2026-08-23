import { createClient } from '@/lib/supabase/server';
import AppShell from '@/components/app/AppShell';

// Todo lo que cuelga de este grupo (Mis proyectos, el portfolio propio, y
// cada pantalla dentro de un proyecto vía (project)/layout.tsx) ya requiere
// sesión — la garantiza proxy.ts antes de llegar acá. Este layout monta la
// misma barra de identidad que usa el lado social (app/(social)/layout.tsx)
// para que moverse entre "gestionar proyectos" y "la red" no se sienta como
// cambiar de producto; cada pantalla de adentro sigue poniendo su propio
// chrome específico (el sidebar de ProjectAdminShell, por ejemplo).
export default async function AuthenticatedAdminLayout({ children }: { children: React.ReactNode }) {
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
    <>
      <AppShell userEmail={user?.email ?? null} profileHandle={profileHandle} avatarImage={avatarImage} />
      <div className="pb-14 sm:pb-0">{children}</div>
    </>
  );
}
