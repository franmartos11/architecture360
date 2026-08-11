'use client';

import { usePathname } from 'next/navigation';
import { TransitionLink as Link } from '@/components/ui/TransitionUtils';
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import ToastProvider from '@/components/ui/ToastProvider';
import { useNewLeadsCount } from '@/hooks/useNewLeadsCount';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const { count: newLeadsCount, markSeen: markLeadsSeen } = useNewLeadsCount();

  useEffect(() => {
    if (pathname === '/admin/leads') markLeadsSeen();
  }, [pathname, markLeadsSeen]);

  useEffect(() => {
    if (pathname === '/admin/login') {
      setChecked(true);
      return;
    }
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) {
        window.location.href = '/admin/login';
        return;
      }
      setUserEmail(data.user.email ?? null);
      setChecked(true);
    });
  }, [pathname]);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  // El proxy (ver proxy.ts) ya bloquea /admin/* sin sesión antes de llegar
  // acá — esto solo evita un parpadeo de contenido mientras se confirma.
  if (!checked) return null;
  if (pathname === '/admin/login') return <>{children}</>;

  const navItems = [
    { label: 'Dashboard', href: '/admin' },
    { label: 'Proyecto', href: '/admin/proyecto' },
    { label: 'Edificios', href: '/admin/edificios' },
    { label: 'Inventario', href: '/admin/inventory' },
    { label: 'Leads', href: '/admin/leads' },
    { label: 'Configuración', href: '/admin/settings' },
  ];

  return (
    <ToastProvider>
    <div className="min-h-screen bg-gray-50 flex flex-col md:flex-row">
      {/* Sidebar */}
      <aside className="w-full md:w-64 bg-gray-900 text-white flex-shrink-0 md:min-h-screen flex flex-col">
        <div className="p-6 flex items-center justify-between md:block">
          <div>
            <h1 className="text-xl font-bold tracking-wide">Admin Panel</h1>
            <p className="text-gray-400 text-sm mt-1">{userEmail ?? 'Panel de administración'}</p>
          </div>
          <button
            onClick={() => setMobileNavOpen(open => !open)}
            className="md:hidden p-2 -mr-2 text-gray-300 hover:text-white rounded-lg hover:bg-gray-800 transition-colors"
            aria-label={mobileNavOpen ? 'Cerrar menú' : 'Abrir menú'}
            aria-expanded={mobileNavOpen}
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              {mobileNavOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>
        </div>

        <nav className={`${mobileNavOpen ? 'flex' : 'hidden'} md:flex flex-1 px-4 py-4 flex-col gap-2`}>
          {navItems.map(item => {
            const isActive = pathname === item.href;
            const showBadge = item.href === '/admin/leads' && newLeadsCount > 0;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center justify-between px-4 py-2 rounded-lg transition-colors ${
                  isActive ? 'bg-brand-500 text-white' : 'text-gray-300 hover:bg-gray-800'
                }`}
              >
                {item.label}
                {showBadge && (
                  <span className="min-w-[1.25rem] h-5 px-1.5 rounded-full bg-red-500 text-white text-xs font-bold flex items-center justify-center">
                    {newLeadsCount}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        <div className={`${mobileNavOpen ? 'block' : 'hidden'} md:block p-4 border-t border-gray-800`}>
          <button
            onClick={async () => {
              const supabase = createClient();
              await supabase.auth.signOut();
              window.location.href = '/admin/login';
            }}
            className="w-full px-4 py-2 text-left text-red-400 hover:bg-gray-800 rounded-lg transition-colors"
          >
            Cerrar Sesión
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto">
        <div className="p-6 md:p-8 max-w-6xl mx-auto">
          {children}
        </div>
      </main>
    </div>
    </ToastProvider>
  );
}
