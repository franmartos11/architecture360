'use client';

import { useState } from 'react';
import { Pill } from '@/components/project-landing/ui';

// Tarjeta clara (--theme-surface) — vive encima de la foto oscurecida de
// la sección Contacto, así que usa los colores de texto "sobre claro".
const FIELD = 'h-[46px] w-full px-3.5 rounded-[calc(var(--theme-radius)*0.6)] border border-[var(--theme-border)] bg-transparent text-[15px] font-normal text-[var(--theme-text)] outline-none transition-colors focus:border-[var(--theme-text)]';
const LABEL = 'flex flex-col gap-1.5 text-[13px] font-semibold text-[var(--theme-text)]';

export default function HomeContactForm({ projectSlug }: { projectSlug: string }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState('');
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
          message: message.trim() || 'Hola, me interesa recibir más información sobre el proyecto.',
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
        setMessage('');
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
      <div className="text-center py-10" role="status">
        <div className="w-14 h-14 mx-auto bg-[var(--theme-text)]/5 text-[var(--theme-text)] rounded-full flex items-center justify-center mb-4">
          <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <p className="text-[var(--theme-text)] font-semibold">¡Mensaje enviado!</p>
        <p className="text-[var(--theme-text-muted)] text-sm mt-1">Un asesor se pondrá en contacto con vos a la brevedad.</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className={LABEL}>
          Nombre
          <input type="text" required autoComplete="name" value={name} onChange={e => setName(e.target.value)} className={FIELD} />
        </label>
        <label className={LABEL}>
          Teléfono
          <input type="tel" required autoComplete="tel" value={phone} onChange={e => setPhone(e.target.value)} className={FIELD} />
        </label>
      </div>
      <label className={LABEL}>
        Email
        <input type="email" required autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} className={FIELD} />
      </label>
      <label className={LABEL}>
        <span>Mensaje <span className="font-normal text-[var(--theme-text-muted)]">(opcional)</span></span>
        <textarea rows={3} maxLength={2000} value={message} onChange={e => setMessage(e.target.value)} className={`${FIELD} h-auto py-3 resize-y`} />
      </label>
      {error && <p className="text-sm text-red-700" role="alert">{error}</p>}
      <Pill type="submit" disabled={isSubmitting} arrow size="lg" block className="mt-1">
        {isSubmitting ? 'Enviando…' : 'Enviar consulta'}
      </Pill>
    </form>
  );
}
