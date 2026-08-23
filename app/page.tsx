import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { TransitionLink as Link } from '@/components/ui/TransitionUtils';

// Placeholder temporal — la landing real del producto (explicar el
// servicio, CTA a registrarse) se diseña aparte más adelante. Hasta
// entonces, esto solo evita que la raíz quede vacía/rota ahora que la
// landing de cada proyecto se mudó a /proyecto/[slug].
//
// Si ya hay sesión, no tiene sentido mostrarle este placeholder a
// alguien que ya es cuenta — lo mandamos directo al feed.
export default async function HomePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) redirect('/feed');

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-950 text-white px-6 text-center">
      <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center font-bold text-sm mb-6">
        360
      </div>
      <h1 className="text-2xl sm:text-3xl font-light tracking-wide max-w-xl">
        Plataforma para arquitectos — próximamente
      </h1>
      <p className="text-white/50 mt-3 max-w-md">
        Mientras tanto, entrá con tu cuenta para seguir cargando tu proyecto.
      </p>
      <div className="flex items-center gap-3 mt-8">
        <Link href="/admin/login" className="px-5 py-2.5 rounded-lg bg-white text-gray-900 text-sm font-medium hover:bg-white/90 transition-colors">
          Ingresar
        </Link>
        <Link href="/admin/signup" className="px-5 py-2.5 rounded-lg border border-white/20 text-white text-sm font-medium hover:bg-white/5 transition-colors">
          Registrarme
        </Link>
      </div>
    </div>
  );
}
