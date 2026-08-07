'use client';

import { usePathname } from 'next/navigation';
import { TransitionLink as Link } from '@/components/ui/TransitionUtils';
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);

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
    <div className="min-h-screen bg-gray-50 flex flex-col md:flex-row">
      {/* Sidebar */}
      <aside className="w-full md:w-64 bg-gray-900 text-white flex-shrink-0 md:min-h-screen flex flex-col">
        <div className="p-6">
          <h1 className="text-xl font-bold tracking-wide">Admin Panel</h1>
          <p className="text-gray-400 text-sm mt-1">{userEmail ?? 'Residencias del Mar'}</p>
        </div>

        <nav className="flex-1 px-4 py-4 space-y-2">
          {navItems.map(item => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`block px-4 py-2 rounded-lg transition-colors ${
                  isActive ? 'bg-brand-500 text-white' : 'text-gray-300 hover:bg-gray-800'
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-gray-800">
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
  );
}
