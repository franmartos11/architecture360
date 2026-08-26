'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import GoogleAuthButton from '@/components/ui/GoogleAuthButton';
import AuthShell from '@/components/auth/AuthShell';

// Único método de login: Google vía Supabase Auth (ver GoogleAuthButton +
// app/admin/auth/callback). El email/password se sacó del todo — antes era
// una segunda puerta que había que mantener validada/sanitizada por
// separado y que además dependía de que cada cuenta tuviera una
// contraseña fuerte; con un solo proveedor, esa superficie desaparece.
export default function LoginPage() {
  return (
    <Suspense fallback={<AuthShell><div /></AuthShell>}>
      <LoginPageInner />
    </Suspense>
  );
}

function LoginPageInner() {
  const searchParams = useSearchParams();
  const hadError = searchParams.get('error') === 'google';

  return (
    <AuthShell>
      <div className="text-center mb-8">
        <h1 className="font-display text-2xl font-bold text-stone-900">Ingresá a tu cuenta</h1>
        <p className="text-stone-500 mt-2">Entrá para seguir armando tus proyectos</p>
      </div>

      {hadError && (
        <p className="text-red-500 text-sm text-center mb-6" role="alert">
          No pudimos iniciar sesión con Google. Probá de nuevo.
        </p>
      )}

      <GoogleAuthButton />
    </AuthShell>
  );
}
