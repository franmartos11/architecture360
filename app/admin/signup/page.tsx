'use client';

import { useState } from 'react';
import { TransitionLink as Link } from '@/components/ui/TransitionUtils';
import { createClient } from '@/lib/supabase/client';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';
import GoogleAuthButton from '@/components/ui/GoogleAuthButton';
import AuthShell from '@/components/auth/AuthShell';

export default function SignupPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [needsConfirmation, setNeedsConfirmation] = useState(false);

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password.length < 8) {
      setError('La contraseña necesita al menos 8 caracteres.');
      return;
    }
    setLoading(true);

    const supabase = createClient();
    const { data, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { name } },
    });

    setLoading(false);

    if (authError) {
      setError(authError.message === 'User already registered' ? 'Ya existe una cuenta con ese email.' : 'No se pudo crear la cuenta.');
      return;
    }

    if (data.session) {
      // Confirmación de email desactivada en este proyecto — ya hay sesión.
      window.location.href = '/admin/proyectos';
      return;
    }

    setNeedsConfirmation(true);
  };

  if (needsConfirmation) {
    return (
      <AuthShell>
        <div className="text-center">
          <div className="text-4xl mb-3">📬</div>
          <h1 className="font-display text-xl font-bold text-stone-900">Revisá tu email</h1>
          <p className="text-stone-500 mt-2">Te mandamos un link a <strong>{email}</strong> para confirmar la cuenta. Una vez confirmada, entrá desde el login.</p>
          <Link href="/admin/login" className="inline-block mt-6 text-sm font-medium text-brand-600 hover:text-brand-700">
            Ir al login →
          </Link>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <div className="text-center mb-8">
        <h1 className="font-display text-2xl font-bold text-stone-900">Creá tu cuenta</h1>
        <p className="text-stone-500 mt-2">Para empezar a cargar tu proyecto</p>
      </div>

      <GoogleAuthButton />

      <div className="flex items-center gap-3 my-6">
        <div className="h-px flex-1 bg-stone-200" />
        <span className="text-xs text-stone-400">o con tu email</span>
        <div className="h-px flex-1 bg-stone-200" />
      </div>

      <form onSubmit={handleSignup} className="space-y-6">
        <Input
          label="Nombre"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Tu nombre"
          autoComplete="name"
          required
        />
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
            placeholder="Mínimo 8 caracteres"
            autoComplete="new-password"
            required
          />
          {error && <p className="text-red-500 text-sm mt-2" role="alert">{error}</p>}
        </div>

        <Button type="submit" disabled={loading} className="w-full py-3">
          {loading ? 'Creando cuenta...' : 'Crear cuenta'}
        </Button>
      </form>

      <p className="text-center text-sm text-stone-500 mt-6">
        ¿Ya tenés cuenta?{' '}
        <Link href="/admin/login" className="font-medium text-brand-600 hover:text-brand-700">
          Ingresá acá
        </Link>
      </p>
    </AuthShell>
  );
}
