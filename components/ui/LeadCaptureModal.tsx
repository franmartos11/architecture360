'use client';

import { useState, useEffect, useRef, useSyncExternalStore, startTransition } from 'react';
import Image from 'next/image';
import type { Unit } from '@/types';
import { useProjectTypeConfig } from '@/lib/project-type-context';
import { unitAgreement } from '@/lib/project-types';
import { useProjectWhatsapp } from '@/lib/project-whatsapp-context';
import Dialog from '@/components/ui/Dialog';
import { formatPrice } from '@/lib/units';
import { WIDE_QUERY } from '@/components/floorplan/UnitSheet';
import { readAttribution } from '@/lib/analytics/client-state';
import { useTrack } from '@/components/analytics/SiteTracker';
import { useLocale, useT } from '@/lib/i18n/client';

// Pantalla angosta (mobile): la consulta es una hoja desde abajo en vez del
// modal centrado de escritorio.
function subscribeWide(cb: () => void) {
  const mql = window.matchMedia(WIDE_QUERY);
  mql.addEventListener('change', cb);
  return () => mql.removeEventListener('change', cb);
}
function useIsNarrow() {
  return useSyncExternalStore(subscribeWide, () => !window.matchMedia(WIDE_QUERY).matches, () => false);
}

const WHATSAPP_PATH = 'M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z';
// 16px: con menos, iOS hace zoom al enfocar el campo.
const M_INPUT = 'w-full h-12 px-3.5 rounded-xl border border-[#D5D9DE] bg-white text-[16px] text-gray-900 placeholder:text-gray-400 outline-none focus:border-gray-900 focus:ring-2 focus:ring-gray-900/10';

interface LeadCaptureModalProps {
  isOpen: boolean;
  onClose: () => void;
  unit: Unit | null;
  projectSlug: string;
  defaultMethod?: 'email' | 'whatsapp' | 'phone';
  /** Sobreescribe el mensaje pre-cargado (ej. desde la calculadora, con la cuota estimada) */
  initialMessage?: string;
}

export default function LeadCaptureModal({
  isOpen,
  onClose,
  unit,
  projectSlug,
  defaultMethod = 'email',
  initialMessage,
}: LeadCaptureModalProps) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState('');
  // Opt-in a las novedades de la obra por correo: apagado por defecto, nunca se asume.
  const [wantsUpdates, setWantsUpdates] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  // Número del bot conectado al proyecto; sin bot no se ofrece WhatsApp.
  const whatsappNumber = useProjectWhatsapp();
  const track = useTrack();
  const typeConfig = useProjectTypeConfig();
  const t = useT();
  const { locale } = useLocale();
  // El +54 fijo (y anteponerlo al enviar) es para el comprador argentino; en
  // otro idioma el número va tal cual lo escribe, con su propio prefijo.
  const prefijoAr = locale === 'es';
  const { hasFloorStep, unitIsLand, showPrice } = typeConfig;
  const isNarrow = useIsNarrow();
  const phoneRef = useRef<HTMLInputElement>(null);
  const uAgree = unitAgreement(typeConfig);
  const unitLabelLower = typeConfig.unitLabel.toLowerCase();

  // Un lote no tiene modelo ni piso — y sin programa de ambientes tampoco
  // hay garantía de modelName en una casa, así que ninguno de los dos se
  // asume presente.
  const defaultMessage = initialMessage
    ? initialMessage
    : unit
      ? t('sitio.lead.msgUnidad', {
          el: uAgree.el,
          unidad: unitLabelLower,
          nombre: unit.name,
          modelo: !unitIsLand && unit.modelName ? ` (${unit.modelName})` : '',
          piso: hasFloorStep ? t('sitio.lead.msgPiso', { piso: unit.floor }) : '',
        })
      : t('sitio.lead.msgProyecto');

  useEffect(() => {
    if (isOpen) {
      startTransition(() => {
        setMessage(defaultMessage);
        setIsSuccess(false);
      });
    }
  }, [isOpen, defaultMessage]);

  const handleWhatsApp = () => {
    const text = encodeURIComponent(message || defaultMessage);
    if (!whatsappNumber) return;
    // Es un botón con window.open, no un link: el listener del tracker no lo ve.
    track('whatsapp', { unitId: unit?.dbId || undefined });
    window.open(`https://wa.me/${whatsappNumber.replace(/\D/g, '')}?text=${text}`, '_blank');
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !email || !phone) {
      alert(t('sitio.lead.faltanCampos'));
      return;
    }
    
    setIsSubmitting(true);
    
    try {
      const response = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          email,
          // Mobile en castellano: el +54 está fijo al lado del campo; se agrega
          // al enviar salvo que la persona haya escrito su propio prefijo.
          phone: prefijoAr && isNarrow && !phone.trim().startsWith('+') ? `+54 ${phone.trim()}` : phone,
          message,
          // uuid real de la fila; unit.id es el código legible.
          unitId: unit?.dbId || null,
          unitName: unit?.name || 'General',
          source: 'form_modal',
          projectSlug,
          wantsUpdates,
          ...readAttribution(),
        })
      });
      
      if (response.ok) {
        setIsSuccess(true);
        setTimeout(() => {
          onClose();
          setIsSuccess(false);
          setName('');
          setEmail('');
          setPhone('');
          setWantsUpdates(false);
          setMessage(defaultMessage);
        }, 3000);
      } else {
        alert(t('sitio.lead.errorEnvio'));
      }
    } catch (error) {
      console.error(error);
      alert(t('sitio.lead.errorEnvio'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const unitThumb = unit ? (unit.interiorImageUrl || unit.galleryImages?.[0]) : undefined;
  const unitMeta = unit
    ? [
        !unitIsLand && unit.modelName ? unit.modelName : '',
        unit.totalArea ? `${unit.totalArea} m²` : '',
        showPrice && unit.price ? formatPrice(unit.price, unit.currency, locale) : '',
      ].filter(Boolean).join(' · ')
    : '';
  const successBody = (
    <div className={`text-center flex flex-col items-center justify-center ${isNarrow ? 'px-6 pt-8' : 'p-10'}`} style={isNarrow ? { paddingBottom: 'max(40px, env(safe-area-inset-bottom))' } : undefined}>
      <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mb-5">
        <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      </div>
      <h3 id="lead-success-title" className="text-xl font-bold text-gray-900 mb-2">{t('sitio.lead.enviadoTitulo')}</h3>
      <p className="text-[15px] text-gray-500">{t('sitio.lead.enviadoTexto')}</p>
    </div>
  );

  // Título y bajada: el Dialog los pone en la cabecera (con el botón de
  // cerrar) y los usa como nombre accesible.
  const title = isNarrow ? (
    <span className="flex items-center gap-3">
      {unitThumb && (
        <span className="relative w-[52px] h-[52px] shrink-0 overflow-hidden rounded-[10px] bg-[#F4F5F6]">
          <Image src={unitThumb} alt="" fill sizes="52px" className="object-cover" />
        </span>
      )}
      <span>{unit ? t('sitio.lead.tituloUnidadMovil', { el: uAgree.el, unidad: unitLabelLower, nombre: unit.name }) : t('sitio.lead.tituloProyectoMovil')}</span>
    </span>
  ) : unit ? t('sitio.lead.tituloUnidad', { esta: uAgree.esta, unidad: unitLabelLower }) : t('sitio.lead.tituloProyecto');
  const description = isNarrow
    ? (unit ? unitMeta : t('sitio.lead.teRespondemos'))
    : unit ? `${unit.name}${!unitIsLand && unit.modelName ? ` • ${unit.modelName}` : ''}` : undefined;

  const footer = isNarrow ? (
    <button type="submit" form="lead-form-mobile" disabled={isSubmitting} className="m-btn m-btn--primary w-full">
      {isSubmitting ? (
        <>
          <svg className="w-[18px] h-[18px] animate-spin" fill="none" viewBox="0 0 24 24" aria-hidden="true">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3.5"></circle>
            <path className="opacity-80" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
          </svg>
          {t('sitio.lead.enviando')}
        </>
      ) : t('sitio.lead.enviar')}
    </button>
  ) : (
    <div className="w-full flex flex-col gap-3">
      <button
        type="submit"
        form="lead-form"
        disabled={isSubmitting}
        className="w-full py-3.5 rounded-xl bg-gray-900 hover:bg-gray-800 text-white font-semibold flex items-center justify-center gap-2 transition-all shadow-sm hover:shadow-md disabled:opacity-70 disabled:cursor-not-allowed"
      >
        {isSubmitting ? (
          <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24" aria-hidden="true">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
        ) : (
          <>
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
            </svg>
            {t('sitio.lead.enviar')}
          </>
        )}
      </button>
      {whatsappNumber && (
        <button
          type="button"
          onClick={handleWhatsApp}
          className="w-full py-3.5 rounded-xl bg-[#25D366] hover:bg-[#20bd5a] text-white font-semibold flex items-center justify-center gap-2 transition-all shadow-sm hover:shadow-md"
        >
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path d={WHATSAPP_PATH} /></svg>
          {t('sitio.lead.consultarWhatsapp')}
        </button>
      )}
    </div>
  );

  const mobileForm = (
    <form id="lead-form-mobile" onSubmit={handleSubmit} className="flex flex-col gap-3.5 px-4 pt-4 pb-3">
      {/* Sin bot conectado no hay a qué número escribir: ni el botón ni el
          separador "o dejá tus datos". */}
      {whatsappNumber && (
        <>
          <button type="button" onClick={handleWhatsApp} className="m-btn m-btn--whatsapp shrink-0 w-full">
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path d={WHATSAPP_PATH} /></svg>
            {t('sitio.lead.escribirWhatsapp')}
          </button>

          <div className="flex items-center gap-2.5 text-xs font-medium text-[#5B6472]">
            <span className="flex-1 h-px bg-[#E6E8EB]" />
            {t('sitio.lead.oDejaTusDatos')}
            <span className="flex-1 h-px bg-[#E6E8EB]" />
          </div>
        </>
      )}

      <div className="flex flex-col gap-1.5">
        <label htmlFor="lead-m-name" className="text-[13px] font-semibold">{t('sitio.lead.nombreYApellido')}</label>
        <input id="lead-m-name" type="text" required autoComplete="name" value={name} onChange={e => setName(e.target.value)} placeholder={t('sitio.lead.comoTeLlamas')} className={M_INPUT} />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="lead-m-phone" className="text-[13px] font-semibold">{t('sitio.lead.celular')}</label>
        {prefijoAr ? (
          <div className="flex h-12 rounded-xl border border-[#D5D9DE] overflow-hidden focus-within:border-gray-900 focus-within:ring-2 focus-within:ring-gray-900/10">
            <span className="flex items-center px-3 bg-[#F4F5F6] text-[15px] font-semibold border-r border-[#D5D9DE]" aria-hidden="true">+54</span>
            <input
              ref={phoneRef}
              id="lead-m-phone"
              type="tel"
              inputMode="tel"
              required
              autoComplete="tel-national"
              aria-label={t('sitio.lead.celularSinPrefijo')}
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder={t('sitio.lead.celularEjemplo')}
              className="flex-1 min-w-0 px-3.5 text-[16px] text-gray-900 placeholder:text-gray-400 outline-none bg-white"
            />
          </div>
        ) : (
          <input
            ref={phoneRef}
            id="lead-m-phone"
            type="tel"
            inputMode="tel"
            required
            autoComplete="tel"
            value={phone}
            onChange={e => setPhone(e.target.value)}
            placeholder={t('sitio.lead.celularEjemplo')}
            className={M_INPUT}
          />
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="lead-m-email" className="text-[13px] font-semibold">{t('sitio.lead.email')}</label>
        <input id="lead-m-email" type="email" inputMode="email" required autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} placeholder={t('sitio.lead.emailEjemploMovil')} className={M_INPUT} />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="lead-m-msg" className="text-[13px] font-semibold">{t('sitio.lead.mensaje')}</label>
        <textarea
          id="lead-m-msg"
          rows={3}
          value={message}
          onChange={e => setMessage(e.target.value)}
          className="w-full px-3.5 py-3 rounded-xl border border-[#D5D9DE] text-[16px] leading-[22px] text-gray-900 resize-none outline-none focus:border-gray-900 focus:ring-2 focus:ring-gray-900/10"
        />
      </div>

      <label htmlFor="lead-m-updates" className="flex items-start gap-2.5 text-[14px] text-gray-700">
        <input id="lead-m-updates" type="checkbox" checked={wantsUpdates} onChange={e => setWantsUpdates(e.target.checked)} className="mt-0.5 w-5 h-5 shrink-0 accent-gray-900" />
        {t('sitio.lead.avisameNovedades')}
      </label>
    </form>
  );

  const FIELD = 'w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-50 text-gray-900 placeholder:text-gray-400 focus:bg-white focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 outline-none transition-all hover:border-gray-300';
  const desktopForm = (
    <form id="lead-form" onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="lead-name" className="block text-sm font-medium text-gray-700 mb-1">{t('sitio.lead.nombreCompleto')}</label>
        <input id="lead-name" type="text" required value={name} onChange={e => setName(e.target.value)} className={FIELD} placeholder={t('sitio.lead.nombreEjemplo')} />
      </div>
      <div>
        <label htmlFor="lead-email" className="block text-sm font-medium text-gray-700 mb-1">{t('sitio.lead.email')}</label>
        <input id="lead-email" type="email" required value={email} onChange={e => setEmail(e.target.value)} className={FIELD} placeholder={t('sitio.lead.emailEjemplo')} />
      </div>
      <div>
        <label htmlFor="lead-phone" className="block text-sm font-medium text-gray-700 mb-1">{t('sitio.lead.telefono')}</label>
        <input id="lead-phone" type="tel" required value={phone} onChange={e => setPhone(e.target.value)} className={FIELD} placeholder={t('sitio.lead.telefonoEjemplo')} />
      </div>
      <div>
        <label htmlFor="lead-msg" className="block text-sm font-medium text-gray-700 mb-1">{t('sitio.lead.mensaje')}</label>
        <textarea id="lead-msg" rows={4} value={message} onChange={e => setMessage(e.target.value)} className={`${FIELD} resize-none`} />
      </div>
      <label htmlFor="lead-updates" className="flex items-start gap-2.5 text-sm text-gray-700">
        <input id="lead-updates" type="checkbox" checked={wantsUpdates} onChange={e => setWantsUpdates(e.target.checked)} className="mt-0.5 w-4 h-4 shrink-0 accent-gray-900" />
        {t('sitio.lead.avisameNovedades')}
      </label>
    </form>
  );

  return (
    <Dialog
      open={isOpen}
      onClose={onClose}
      variant="sheet"
      title={isSuccess ? undefined : title}
      description={isSuccess ? undefined : description}
      labelledBy={isSuccess ? 'lead-success-title' : undefined}
      footer={isSuccess ? undefined : footer}
      padded={!isNarrow}
      // Abierta por "teléfono" en mobile, el foco va directo al celular.
      initialFocus={isNarrow && defaultMethod === 'phone' ? phoneRef : undefined}
    >
      {isSuccess ? successBody : isNarrow ? mobileForm : desktopForm}
    </Dialog>
  );
}
