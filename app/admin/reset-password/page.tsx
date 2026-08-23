'use client';

import { useState, useEffect } from 'react';
import { TransitionLink as Link } from '@/components/ui/TransitionUtils';
import { createClient } from '@/lib/supabase/client';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';
import LoadingSpinner from '@/components/ui/LoadingSpinner';

export default function ResetPasswordPage() {
  // El link del email deja el token en el fragment (#access_token=...),
  // que nunca llega al servidor — por eso esta página es pública en
  // proxy.ts, y por eso hay que esperar a que el cliente lo procese solo
  // (dispara PASSWORD_RECOVERY) antes de mostrar el formulario.
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setReady(true);
    });
    // Si la sesión de recuperación ya se procesó antes de que este efecto
    // se suscribiera, el evento anterior también sirve como señal.
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
    });
    return () => subscription.unsubscribe();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const supabase = createClient();
    const { error: authError } = await supabase.auth.updateUser({ password });

    setLoading(false);
    if (authError) setError('No se pudo actualizar la contraseña. Pedí un link nuevo e intentá de vuelta.');
    else setDone(true);
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-8 border border-gray-100">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Elegir nueva contraseña</h1>
        </div>

        {done ? (
          <div className="text-center space-y-4">
            <p className="text-sm text-gray-600 bg-gray-50 rounded-lg p-4">Contraseña actualizada.</p>
            <Link href="/admin/proyectos" className="inline-block px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors">
              Ir al panel →
            </Link>
          </div>
        ) : !ready ? (
          <LoadingSpinner text="Validando el link..." tone="light" />
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6">
            <Input
              label="Contraseña nueva"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="new-password"
              minLength={6}
              required
            />
            {error && <p className="text-red-500 text-sm" role="alert">{error}</p>}
            <Button type="submit" disabled={loading} className="w-full py-3">
              {loading ? 'Guardando...' : 'Guardar contraseña'}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
