'use client';

import { useState } from 'react';
import { TransitionLink as Link } from '@/components/ui/TransitionUtils';
import { createClient } from '@/lib/supabase/client';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';
import GoogleAuthButton from '@/components/ui/GoogleAuthButton';
import AuthShell from '@/components/auth/AuthShell';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

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

    window.location.href = '/admin/proyectos'; // Force reload para que el proxy lea la sesión nueva
  };

  return (
    <AuthShell>
      <div className="text-center mb-8">
        <h1 className="font-display text-2xl font-bold text-stone-900">Ingresá a tu cuenta</h1>
        <p className="text-stone-500 mt-2">Entrá para seguir armando tus proyectos</p>
      </div>

      <GoogleAuthButton />

      <div className="flex items-center gap-3 my-6">
        <div className="h-px flex-1 bg-stone-200" />
        <span className="text-xs text-stone-400">o con tu email</span>
        <div className="h-px flex-1 bg-stone-200" />
      </div>

      <form onSubmit={handleLogin} className="space-y-6">
        <Input
          label="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="vos@ejemplo.com"
          autoComplete="email"
          required
        />

        <div>
          <Input
            label="Contraseña"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            autoComplete="current-password"
            required
          />
          <div className="text-right mt-2">
            <Link href="/admin/forgot-password" className="text-sm text-stone-500 hover:text-stone-700">
              ¿Olvidaste tu contraseña?
            </Link>
          </div>
          {error && <p className="text-red-500 text-sm mt-2" role="alert">{error}</p>}
        </div>

        <Button type="submit" disabled={loading} className="w-full py-3">
          {loading ? 'Ingresando...' : 'Ingresar'}
        </Button>
      </form>

      <p className="text-center text-sm text-stone-500 mt-6">
        ¿No tenés cuenta?{' '}
        <Link href="/admin/signup" className="font-medium text-brand-600 hover:text-brand-700">
          Registrate
        </Link>
      </p>
    </AuthShell>
  );
}
