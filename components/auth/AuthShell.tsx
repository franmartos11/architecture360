import type { ReactNode } from 'react';
import { TransitionLink as Link } from '@/components/ui/TransitionUtils';

// Marco compartido por login/signup/forgot-password/reset-password — antes
// cada página era un card blanco suelto sobre gris genérico, sin ninguna
// seña de marca. Esto les da el mismo fondo oscuro + logo que la landing,
// sin tocar Input/Button (son compartidos con el admin, así que su estilo
// para el card en sí queda intacto).
export default function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-stone-950 px-4 py-12">
      <Link href="/" className="flex items-center gap-2.5 mb-8">
        <div className="w-8 h-8 rounded-lg bg-brand-400 flex items-center justify-center text-brand-900 font-bold text-sm">
          A
        </div>
        <span className="font-display font-bold tracking-tight text-white">Atrium</span>
      </Link>
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-8 border border-stone-100">
        {children}
      </div>
    </div>
  );
}
