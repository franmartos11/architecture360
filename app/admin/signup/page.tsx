'use client';

import GoogleAuthButton from '@/components/ui/GoogleAuthButton';
import AuthShell from '@/components/auth/AuthShell';

// Con un solo proveedor (Google), "crear cuenta" e "iniciar sesión" son
// literalmente la misma acción — Supabase crea la cuenta sola la primera
// vez que alguien entra con Google. Esta pantalla se mantiene aparte (en
// vez de redirigir a /admin/login) solo porque la landing linkea acá con
// call-to-actions de "Empezar gratis" — el copy importa más que la ruta.
export default function SignupPage() {
  return (
    <AuthShell>
      <div className="text-center mb-8">
        <h1 className="font-display text-2xl font-bold text-stone-900">Creá tu cuenta</h1>
        <p className="text-stone-500 mt-2">Para empezar a cargar tu proyecto</p>
      </div>

      <GoogleAuthButton />
    </AuthShell>
  );
}
