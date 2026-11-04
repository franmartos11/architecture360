import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Sitio no disponible',
  robots: { index: false, follow: false },
};

// Lo que ve un visitante cuando el link de un proyecto no lleva a nada:
// el proyecto no existe o todavía está en borrador. No distingue entre los
// dos a propósito — decir "existe pero es borrador" filtraría que el
// proyecto está en preparación. El dueño con sesión iniciada nunca llega
// acá: ve la vista previa del borrador (ver getSiteProject).
//
// Va a pantalla completa y por encima de todo, igual que app/error.tsx,
// para no heredar el chrome de la red social del layout raíz.
export default function ProjectNotFound() {
  return (
    <main className="fixed inset-0 z-[9999] overflow-y-auto bg-brand-50">
      <div className="min-h-full flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md text-center">
          <div className="mx-auto w-16 h-16 rounded-2xl bg-white border border-brand-200 shadow-sm flex items-center justify-center text-brand-700">
            {/* Plano con una regla: "en obra" en vez de un ícono de error. */}
            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" />
            </svg>
          </div>

          <p className="mt-6 text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-600">Sitio no disponible</p>
          <h1 className="mt-2 text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight">
            Este proyecto todavía no está publicado
          </h1>
          <p className="mt-3 text-sm sm:text-base text-gray-600 leading-relaxed">
            Puede que el sitio se esté terminando de preparar o que el link no sea correcto.
            Probá de nuevo más tarde o pedile el link actualizado a quien te lo compartió.
          </p>

          <div className="mt-8 flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3">
            <Link
              href="/"
              className="h-11 px-5 inline-flex items-center justify-center rounded-lg bg-gray-900 text-white text-sm font-medium hover:bg-gray-800 transition-colors"
            >
              Volver al inicio
            </Link>
            <Link
              href="/directorio"
              className="h-11 px-5 inline-flex items-center justify-center rounded-lg bg-white border border-gray-300 text-gray-800 text-sm font-medium hover:bg-gray-50 transition-colors"
            >
              Ver otros proyectos
            </Link>
          </div>

          <div className="mt-10 pt-6 border-t border-brand-200">
            <p className="text-sm text-gray-600">
              ¿Es tu proyecto?{' '}
              <Link href="/admin/login" className="font-medium text-gray-900 underline underline-offset-4 hover:text-brand-700">
                Iniciá sesión
              </Link>{' '}
              para ver la vista previa y publicarlo.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
