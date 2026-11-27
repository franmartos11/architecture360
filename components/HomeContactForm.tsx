'use client';

import { useState } from 'react';
import { Pill } from '@/components/project-landing/ui';
import { useProjectWhatsapp } from '@/lib/project-whatsapp-context';
import { readAttribution } from '@/lib/analytics/client-state';
import { useT } from '@/lib/i18n/client';

// Tarjeta clara (--theme-surface) — vive encima de la foto oscurecida de
// la sección Contacto, así que usa los colores de texto "sobre claro".
const FIELD = 'h-[46px] w-full px-3.5 rounded-[calc(var(--theme-radius)*0.6)] border border-[var(--theme-border)] bg-transparent text-[15px] font-normal text-[var(--theme-text)] outline-none transition-colors focus:border-[var(--theme-text)]';
const LABEL = 'flex flex-col gap-1.5 text-[13px] font-semibold text-[var(--theme-text)]';

// Link externo con forma de Pill (Pill con href navega dentro del sitio).
const BRIEF_LINK = 'inline-flex items-center justify-center gap-2 h-12 px-[22px] rounded-full text-sm sm:text-[15px] font-semibold no-underline transition-opacity hover:opacity-90 bg-[var(--theme-text)] text-[var(--theme-bg)] focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-[var(--theme-accent)]';

export default function HomeContactForm({ projectSlug, projectName, briefUrl }: {
  projectSlug: string;
  projectName: string;
  /** PDF del brief: si hay, la pantalla de éxito ofrece recibirlo por WhatsApp (o descargarlo). */
  briefUrl?: string;
}) {
  const whatsappNumber = useProjectWhatsapp();
  const t = useT();
  const [sentName, setSentName] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState('');
  // Opt-in a las novedades de la obra por correo: apagado por defecto, nunca se asume.
  const [wantsUpdates, setWantsUpdates] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState('');

  // Pedirle el brief al bot: abre WhatsApp con el mensaje ya escrito, en el
  // idioma de la página (como briefWhatsappHref de lib/brief, que es castellano).
  const briefHref = (numero: string) => {
    const quien = sentName.trim();
    const texto = quien
      ? t('sitio.lead.msgBriefConNombre', { nombre: quien, proyecto: projectName })
      : t('sitio.lead.msgBrief', { proyecto: projectName });
    return `https://wa.me/${numero.replace(/\D/g, '')}?text=${encodeURIComponent(texto)}`;
  };

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
          message: message.trim() || t('sitio.lead.msgProyecto'),
          unitId: null,
          unitName: 'General',
          source: 'home_contact_form',
          projectSlug,
          wantsUpdates,
          ...readAttribution(),
        }),
      });

      if (res.ok) {
        setSentName(name);
        setIsSuccess(true);
        setName('');
        setEmail('');
        setPhone('');
        setMessage('');
        setWantsUpdates(false);
      } else {
        setError(t('sitio.home.errorEnvio'));
      }
    } catch {
      setError(t('sitio.home.errorEnvio'));
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
        <p className="text-[var(--theme-text)] font-semibold">{t('sitio.lead.enviadoTitulo')}</p>
        <p className="text-[var(--theme-text-muted)] text-sm mt-1">{t('sitio.lead.enviadoTexto')}</p>
        {briefUrl && (
          <div className="mt-6 flex flex-col items-center gap-2">
            {whatsappNumber ? (
              <>
                <p className="m-0 text-sm text-[var(--theme-text)]">{t('sitio.home.queresElBrief')}</p>
                <a href={briefHref(whatsappNumber)} target="_blank" rel="noopener noreferrer" className={BRIEF_LINK}>
                  {t('sitio.home.briefWhatsapp')}
                </a>
              </>
            ) : (
              <a href={briefUrl} target="_blank" rel="noopener noreferrer" className={BRIEF_LINK}>
                {t('sitio.menu.descargarBrief')}
              </a>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className={LABEL}>
          {t('sitio.home.nombre')}
          <input type="text" required autoComplete="name" value={name} onChange={e => setName(e.target.value)} className={FIELD} />
        </label>
        <label className={LABEL}>
          {t('sitio.lead.telefono')}
          <input type="tel" required autoComplete="tel" value={phone} onChange={e => setPhone(e.target.value)} className={FIELD} />
        </label>
      </div>
      <label className={LABEL}>
        {t('sitio.lead.email')}
        <input type="email" required autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} className={FIELD} />
      </label>
      <label className={LABEL}>
        <span>{t('sitio.lead.mensaje')} <span className="font-normal text-[var(--theme-text-muted)]">{t('sitio.home.opcional')}</span></span>
        <textarea rows={3} maxLength={2000} value={message} onChange={e => setMessage(e.target.value)} className={`${FIELD} h-auto py-3 resize-y`} />
      </label>
      <label className="flex items-start gap-2.5 text-[14px] font-normal text-[var(--theme-text)]">
        <input type="checkbox" checked={wantsUpdates} onChange={e => setWantsUpdates(e.target.checked)} className="mt-0.5 w-4 h-4 shrink-0 accent-[var(--theme-text)]" />
        {t('sitio.lead.avisameNovedades')}
      </label>
      {error && <p className="text-sm text-red-700" role="alert">{error}</p>}
      <Pill type="submit" disabled={isSubmitting} arrow size="lg" block className="mt-1">
        {isSubmitting ? t('sitio.lead.enviando') : t('sitio.lead.enviar')}
      </Pill>
    </form>
  );
}
