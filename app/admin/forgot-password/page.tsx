'use client';

import { useState } from 'react';
import { TransitionLink as Link } from '@/components/ui/TransitionUtils';
import { createClient } from '@/lib/supabase/client';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const supabase = createClient();
    const { error: authError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/admin/reset-password`,
    });

    setLoading(false);
    // No distinguimos "no existe esa cuenta" del caso exitoso — evita que
    // alguien use este formulario para averiguar qué emails están registrados.
    if (authError) setError('No se pudo enviar el email. Probá de nuevo.');
    else setSent(true);
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-8 border border-gray-100">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Recuperar contraseña</h1>
          <p className="text-gray-500 mt-2">Te mandamos un link para elegir una nueva.</p>
        </div>

        {sent ? (
          <p className="text-center text-sm text-gray-600 bg-gray-50 rounded-lg p-4">
            Si <strong>{email}</strong> tiene una cuenta, te llegó un email con el link. Revisá spam si no lo ves.
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6">
            <Input
              label="Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="vos@ejemplo.com"
              autoComplete="email"
              required
            />
            {error && <p className="text-red-500 text-sm" role="alert">{error}</p>}
            <Button type="submit" disabled={loading} className="w-full py-3">
              {loading ? 'Enviando...' : 'Mandar link'}
            </Button>
          </form>
        )}

        <p className="text-center text-sm text-gray-500 mt-6">
          <Link href="/admin/login" className="font-medium text-brand-600 hover:text-brand-700">
            ← Volver a ingresar
          </Link>
        </p>
      </div>
    </div>
  );
}
