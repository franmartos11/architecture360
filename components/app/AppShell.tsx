'use client';

import { useState, useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { Home, Building2, Bell, MessageCircle, User, ChevronDown, Pencil, LogOut } from 'lucide-react';
import { TransitionLink as Link } from '@/components/ui/TransitionUtils';
import { createClient } from '@/lib/supabase/client';
import NavSearch from '@/components/social/NavSearch';
import NotificationsPanel from '@/components/app/NotificationsPanel';
import { useUnreadNotificationsCount } from '@/hooks/useUnreadNotificationsCount';
import { useUnreadMessagesCount } from '@/hooks/useUnreadMessagesCount';

interface AppShellProps {
  userEmail: string | null;
  profileHandle: string | null;
  avatarImage: string | null;
}

// Barra de identidad persistente para toda la cuenta logueada — antes cada
// zona (feed/directorio, "Mis proyectos", el portfolio, y cada pantalla
// dentro de un proyecto) armaba su propio header suelto, así que moverse
// entre "gestionar proyectos" y "la red" se sentía como cambiar de
// producto. Esta es la única barra, montada una vez por cada grupo de
// rutas logueadas — ver app/(social)/layout.tsx y
// app/admin/(authenticated)/layout.tsx.
export default function AppShell({ userEmail, profileHandle, avatarImage }: AppShellProps) {
  const pathname = usePathname();
  const loggedIn = !!userEmail;
  const [menuOpen, setMenuOpen] = useState(false);
  const [bellOpen, setBellOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const bellRef = useRef<HTMLDivElement>(null);
  const { count: unreadCount, clear: clearUnread } = useUnreadNotificationsCount(loggedIn);
  const unreadMessages = useUnreadMessagesCount(loggedIn);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
      if (bellRef.current && !bellRef.current.contains(e.target as Node)) setBellOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSignOut = async () => {
    await createClient().auth.signOut();
    window.location.href = '/';
  };

  const profileHref = profileHandle ? `/portfolio/${profileHandle}` : '/admin/portfolio';
  const isActive = (href: string) => pathname === href || (href !== '/feed' && pathname?.startsWith(href));

  const AvatarCircle = ({ size = 'w-8 h-8' }: { size?: string }) => (
    <div className={`relative ${size} rounded-full overflow-hidden shrink-0 bg-white/10 flex items-center justify-center`}>
      {avatarImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={avatarImage} alt="" className="w-full h-full object-cover" />
      ) : (
        <User className="w-4 h-4 text-white/50" />
      )}
    </div>
  );

  return (
    <>
      <header className="sticky top-0 z-40 bg-trevo-dark border-b border-white/10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center gap-4">
          <Link href="/feed" className="flex items-center gap-2 shrink-0">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center text-white font-bold text-xs">
              360
            </div>
          </Link>

          <NavSearch />

          <nav className="flex items-center gap-1 ml-auto text-sm">
            <Link
              href="/feed"
              className={`hidden sm:inline-flex p-2 rounded-lg transition-colors ${isActive('/feed') ? 'text-white bg-white/10' : 'text-white/60 hover:text-white hover:bg-white/5'}`}
              title="Feed"
              aria-label="Feed"
            >
              <Home className="w-5 h-5" />
            </Link>
            {loggedIn && (
              <Link
                href="/admin/proyectos"
                className={`hidden sm:inline-flex p-2 rounded-lg transition-colors ${isActive('/admin/proyectos') || isActive('/admin') ? 'text-white bg-white/10' : 'text-white/60 hover:text-white hover:bg-white/5'}`}
                title="Mis proyectos"
                aria-label="Mis proyectos"
              >
                <Building2 className="w-5 h-5" />
              </Link>
            )}

            {loggedIn ? (
              <>
              <Link
                href="/mensajes"
                className={`relative p-2 rounded-lg transition-colors ${isActive('/mensajes') ? 'text-white bg-white/10' : 'text-white/60 hover:text-white hover:bg-white/5'}`}
                title="Mensajes"
                aria-label={unreadMessages > 0 ? `Mensajes (${unreadMessages} sin leer)` : 'Mensajes'}
              >
                <MessageCircle className="w-5 h-5" />
                {unreadMessages > 0 && (
                  <span className="absolute top-0.5 right-0.5 min-w-[1rem] h-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
                    {unreadMessages > 9 ? '9+' : unreadMessages}
                  </span>
                )}
              </Link>

              <div ref={bellRef} className="relative">
                <button
                  onClick={() => setBellOpen(o => !o)}
                  className="relative p-2 rounded-lg text-white/60 hover:text-white hover:bg-white/5 transition-colors"
                  aria-label={unreadCount > 0 ? `Notificaciones (${unreadCount} sin leer)` : 'Notificaciones'}
                  aria-expanded={bellOpen}
                >
                  <Bell className="w-5 h-5" />
                  {unreadCount > 0 && (
                    <span className="absolute top-0.5 right-0.5 min-w-[1rem] h-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
                      {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                  )}
                </button>
                {bellOpen && (
                  <div className="absolute top-full right-0 mt-1.5 max-w-[calc(100vw-2rem)] bg-white rounded-xl shadow-lg border border-trevo-dark/10 overflow-hidden z-50">
                    <NotificationsPanel onRead={clearUnread} />
                  </div>
                )}
              </div>

              <div ref={menuRef} className="relative">
                <button
                  onClick={() => setMenuOpen(o => !o)}
                  className="flex items-center gap-1.5 p-1 pr-2 rounded-lg text-white/60 hover:text-white hover:bg-white/5 transition-colors"
                  aria-label="Mi cuenta"
                  aria-expanded={menuOpen}
                >
                  <AvatarCircle />
                  <ChevronDown className="w-3.5 h-3.5" />
                </button>
                {menuOpen && (
                  <div className="absolute top-full right-0 mt-1.5 w-56 bg-white rounded-xl shadow-lg border border-trevo-dark/10 overflow-hidden z-50">
                    <div className="px-4 py-3 border-b border-trevo-dark/5">
                      <p className="text-sm font-medium text-trevo-dark truncate">{userEmail}</p>
                    </div>
                    <div className="py-1">
                      <Link href={profileHref} onClick={() => setMenuOpen(false)} className="flex items-center gap-2.5 px-4 py-2 text-sm text-trevo-dark hover:bg-trevo-dark/5 transition-colors">
                        <User className="w-4 h-4 text-trevo-dark/40" />
                        {profileHandle ? 'Ver mi perfil' : 'Crear mi perfil'}
                      </Link>
                      <Link href="/admin/portfolio" onClick={() => setMenuOpen(false)} className="flex items-center gap-2.5 px-4 py-2 text-sm text-trevo-dark hover:bg-trevo-dark/5 transition-colors">
                        <Pencil className="w-4 h-4 text-trevo-dark/40" />
                        Editar perfil
                      </Link>
                      <Link href="/admin/proyectos" onClick={() => setMenuOpen(false)} className="flex items-center gap-2.5 px-4 py-2 text-sm text-trevo-dark hover:bg-trevo-dark/5 transition-colors">
                        <Building2 className="w-4 h-4 text-trevo-dark/40" />
                        Mis proyectos
                      </Link>
                    </div>
                    <div className="py-1 border-t border-trevo-dark/5">
                      <button onClick={handleSignOut} className="w-full flex items-center gap-2.5 px-4 py-2 text-sm text-red-500 hover:bg-red-50 transition-colors text-left">
                        <LogOut className="w-4 h-4" />
                        Cerrar sesión
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : (
            <>
              <Link href="/admin/login" className="px-3 py-1.5 rounded-lg text-white/70 hover:text-white hover:bg-white/5 transition-colors">
                Ingresar
              </Link>
              <Link href="/admin/signup" className="px-3 py-1.5 rounded-lg bg-white text-gray-900 font-medium hover:bg-white/90 transition-colors">
                Registrarme
              </Link>
            </>
          )}
          </nav>
        </div>
      </header>

      {/* Tab bar mobile — reemplaza los items que en desktop viven en el header
          y que en pantallas chicas no tenían ningún lugar donde vivir. */}
      <nav className="sm:hidden fixed bottom-0 inset-x-0 z-40 bg-trevo-dark border-t border-white/10 flex items-stretch h-14">
        <Link href="/feed" className={`flex-1 flex flex-col items-center justify-center gap-0.5 text-[10px] ${isActive('/feed') ? 'text-white' : 'text-white/50'}`}>
          <Home className="w-5 h-5" />
          Feed
        </Link>
        {loggedIn ? (
          <>
            <Link href="/admin/proyectos" className={`flex-1 flex flex-col items-center justify-center gap-0.5 text-[10px] ${isActive('/admin/proyectos') || isActive('/admin') ? 'text-white' : 'text-white/50'}`}>
              <Building2 className="w-5 h-5" />
              Proyectos
            </Link>
            <Link href="/mensajes" className={`relative flex-1 flex flex-col items-center justify-center gap-0.5 text-[10px] ${isActive('/mensajes') ? 'text-white' : 'text-white/50'}`}>
              <MessageCircle className="w-5 h-5" />
              {unreadMessages > 0 && (
                <span className="absolute top-1 right-[calc(50%-1.1rem)] min-w-[0.9rem] h-[0.9rem] px-0.5 rounded-full bg-red-500 text-white text-[8px] font-bold flex items-center justify-center">
                  {unreadMessages > 9 ? '9+' : unreadMessages}
                </span>
              )}
              Mensajes
            </Link>
            <Link href={profileHref} className={`flex-1 flex flex-col items-center justify-center gap-0.5 text-[10px] ${isActive(profileHref) ? 'text-white' : 'text-white/50'}`}>
              <AvatarCircle size="w-5 h-5" />
              Perfil
            </Link>
          </>
        ) : (
          <Link href="/admin/login" className="flex-1 flex flex-col items-center justify-center gap-0.5 text-[10px] text-white/50">
            <User className="w-5 h-5" />
            Ingresar
          </Link>
        )}
      </nav>
    </>
  );
}
