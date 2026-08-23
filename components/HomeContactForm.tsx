'use client';

import { useState } from 'react';

export default function HomeContactForm({ projectSlug }: { projectSlug: string }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);

    try {
      const res = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          email,
          phone,
          message: 'Hola, me interesa recibir más información sobre el proyecto.',
          unitId: null,
          unitName: 'General',
          source: 'home_contact_form',
          projectSlug,
        }),
      });

      if (res.ok) {
        setIsSuccess(true);
        setName('');
        setEmail('');
        setPhone('');
      } else {
        setError('Hubo un error al enviar tu consulta. Por favor, intentá de nuevo.');
      }
    } catch {
      setError('Hubo un error al enviar tu consulta. Por favor, intentá de nuevo.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isSuccess) {
    return (
      <div className="text-center py-6">
        <div className="w-14 h-14 mx-auto bg-[var(--theme-text-on-dark)]/10 text-[var(--theme-text-on-dark)] rounded-full flex items-center justify-center mb-4">
          <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <p className="text-[var(--theme-text-on-dark)] font-medium">¡Mensaje enviado!</p>
        <p className="text-[var(--theme-text-on-dark-muted)] text-sm mt-1">Un asesor se pondrá en contacto con vos a la brevedad.</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <input
        type="text"
        required
        value={name}
        onChange={e => setName(e.target.value)}
        placeholder="Nombre completo"
        className="w-full p-4 bg-[var(--theme-text-on-dark)]/10 border border-[var(--theme-border-on-dark)] rounded-[var(--theme-radius)] text-[var(--theme-text-on-dark)] placeholder:text-[var(--theme-text-on-dark-muted)] focus:outline-none focus:border-[var(--theme-text-on-dark)] transition-colors"
      />
      <input
        type="email"
        required
        value={email}
        onChange={e => setEmail(e.target.value)}
        placeholder="Correo electrónico"
        className="w-full p-4 bg-[var(--theme-text-on-dark)]/10 border border-[var(--theme-border-on-dark)] rounded-[var(--theme-radius)] text-[var(--theme-text-on-dark)] placeholder:text-[var(--theme-text-on-dark-muted)] focus:outline-none focus:border-[var(--theme-text-on-dark)] transition-colors"
      />
      <input
        type="tel"
        required
        value={phone}
        onChange={e => setPhone(e.target.value)}
        placeholder="Teléfono"
        className="w-full p-4 bg-[var(--theme-text-on-dark)]/10 border border-[var(--theme-border-on-dark)] rounded-[var(--theme-radius)] text-[var(--theme-text-on-dark)] placeholder:text-[var(--theme-text-on-dark-muted)] focus:outline-none focus:border-[var(--theme-text-on-dark)] transition-colors"
      />
      {error && <p className="text-sm text-red-200">{error}</p>}
      <button
        type="submit"
        disabled={isSubmitting}
        className="w-full mt-2 py-4 rounded-[var(--theme-radius)] bg-[var(--theme-accent)] text-[var(--theme-text-on-dark)] hover:opacity-85 transition-opacity tracking-wider text-sm disabled:opacity-70 disabled:cursor-not-allowed"
      >
        {isSubmitting ? 'Enviando...' : 'ENVIAR'}
      </button>
    </form>
  );
}
