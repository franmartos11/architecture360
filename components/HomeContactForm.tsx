'use client';

import { useState } from 'react';

export default function HomeContactForm() {
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
        <div className="w-14 h-14 mx-auto bg-white/10 text-white rounded-full flex items-center justify-center mb-4">
          <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <p className="text-white font-medium">¡Mensaje enviado!</p>
        <p className="text-white/70 text-sm mt-1">Un asesor se pondrá en contacto con vos a la brevedad.</p>
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
        className="w-full p-4 bg-white/10 border border-white/20 rounded-lg text-white placeholder:text-white/50 focus:outline-none focus:border-white transition-colors"
      />
      <input
        type="email"
        required
        value={email}
        onChange={e => setEmail(e.target.value)}
        placeholder="Correo electrónico"
        className="w-full p-4 bg-white/10 border border-white/20 rounded-lg text-white placeholder:text-white/50 focus:outline-none focus:border-white transition-colors"
      />
      <input
        type="tel"
        required
        value={phone}
        onChange={e => setPhone(e.target.value)}
        placeholder="Teléfono"
        className="w-full p-4 bg-white/10 border border-white/20 rounded-lg text-white placeholder:text-white/50 focus:outline-none focus:border-white transition-colors"
      />
      {error && <p className="text-sm text-red-200">{error}</p>}
      <button type="submit" disabled={isSubmitting} className="btn-solid-brown w-full mt-2 py-4 rounded-lg disabled:opacity-70 disabled:cursor-not-allowed">
        {isSubmitting ? 'Enviando...' : 'ENVIAR'}
      </button>
    </form>
  );
}
