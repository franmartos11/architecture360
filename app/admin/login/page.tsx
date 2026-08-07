'use client';

import { useState } from 'react';
import { useTransitionRouter } from '@/components/ui/TransitionUtils';
import { createClient } from '@/lib/supabase/client';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useTransitionRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const supabase = createClient();
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password });

    setLoading(false);

    if (authError) {
      setError('Email o contraseña incorrectos');
      return;
    }

    window.location.href = '/admin'; // Force reload para que el proxy lea la sesión nueva
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-8 border border-gray-100">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Panel de Administración</h1>
          <p className="text-gray-500 mt-2">Ingresá con tu cuenta para acceder</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-brand-500 focus:border-transparent outline-none transition-all"
              placeholder="vos@ejemplo.com"
              autoComplete="email"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Contraseña</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-brand-500 focus:border-transparent outline-none transition-all"
              placeholder="••••••••"
              autoComplete="current-password"
              required
            />
            {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 px-4 bg-gray-900 hover:bg-gray-800 disabled:opacity-60 text-white font-medium rounded-xl transition-colors shadow-lg shadow-gray-900/20"
          >
            {loading ? 'Ingresando...' : 'Ingresar'}
          </button>
        </form>
      </div>
    </div>
  );
}
