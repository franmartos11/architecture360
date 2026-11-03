'use client';

import { useState, useEffect, useRef, useSyncExternalStore, startTransition } from 'react';
import Image from 'next/image';
import { m as motion, AnimatePresence } from 'framer-motion';
import type { Unit } from '@/types';
import { useProjectTypeConfig } from '@/lib/project-type-context';
import { unitAgreement } from '@/lib/project-types';
import ModalPortal from '@/components/ui/ModalPortal';
import { formatPrice } from '@/lib/units';
import { WIDE_QUERY } from '@/components/floorplan/UnitSheet';
import { useSheetDrag } from '@/hooks/useSheetDrag';
import { BACKDROP } from '@/lib/motion';

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
  /** Por encima de capas de pantalla completa (comparador, z-100). */
  elevated?: boolean;
}

export default function LeadCaptureModal({
  isOpen,
  onClose,
  unit,
  projectSlug,
  defaultMethod = 'email',
  initialMessage,
  elevated = false,
}: LeadCaptureModalProps) {
  const sheetDrag = useSheetDrag(onClose);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const typeConfig = useProjectTypeConfig();
  const { hasFloorStep, unitIsLand, showPrice } = typeConfig;
  const isNarrow = useIsNarrow();
  const phoneRef = useRef<HTMLInputElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const uAgree = unitAgreement(typeConfig);
  const unitLabelLower = typeConfig.unitLabel.toLowerCase();

  // Un lote no tiene modelo ni piso — y sin programa de ambientes tampoco
  // hay garantía de modelName en una casa, así que ninguno de los dos se
  // asume presente.
  const defaultMessage = initialMessage
    ? initialMessage
    : unit
      ? `Hola, me interesa recibir más información sobre ${uAgree.el} ${unitLabelLower} ${unit.name}`
        + (!unitIsLand && unit.modelName ? ` (${unit.modelName})` : '')
        + (hasFloorStep ? ` en el piso ${unit.floor}` : '')
        + '.'
      : 'Hola, me interesa recibir más información sobre el proyecto.';

  useEffect(() => {
    if (isOpen) {
      startTransition(() => {
        setMessage(defaultMessage);
        setIsSuccess(false);
      });
    }
  }, [isOpen, defaultMessage]);

  // Mobile: Escape cierra la hoja; abierta por "teléfono", el foco va al
  // celular. El modal de escritorio queda como estaba.
  useEffect(() => {
    if (!isOpen || !isNarrow) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    const t = window.setTimeout(() => {
      if (defaultMethod === 'phone') phoneRef.current?.focus();
      else sheetRef.current?.focus();
    }, 250);
    return () => { window.removeEventListener('keydown', onKey); window.clearTimeout(t); };
  }, [isOpen, isNarrow, defaultMethod, onClose]);

  const handleWhatsApp = () => {
    const text = encodeURIComponent(message || defaultMessage);
    const phoneNumber = '5491100000000';
    window.open(`https://wa.me/${phoneNumber}?text=${text}`, '_blank');
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !email || !phone) {
      alert("Por favor completa los campos requeridos.");
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
          // Mobile: el +54 está fijo al lado del campo; se agrega al enviar
          // salvo que la persona haya escrito su propio prefijo.
          phone: isNarrow && !phone.trim().startsWith('+') ? `+54 ${phone.trim()}` : phone,
          message,
          unitId: unit?.id || null,
          unitName: unit?.name || 'General',
          source: 'form_modal',
          projectSlug,
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
          setMessage(defaultMessage);
        }, 3000);
      } else {
        alert("Hubo un error al enviar tu consulta. Por favor, intenta de nuevo.");
      }
    } catch (error) {
      console.error(error);
      alert("Hubo un error al enviar tu consulta. Por favor, intenta de nuevo.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const unitThumb = unit ? (unit.interiorImageUrl || unit.galleryImages?.[0]) : undefined;
  const unitMeta = unit
    ? [
        !unitIsLand && unit.modelName ? unit.modelName : '',
        unit.totalArea ? `${unit.totalArea} m²` : '',
        showPrice && unit.price ? formatPrice(unit.price, unit.currency) : '',
      ].filter(Boolean).join(' · ')
    : '';
  const zLayer = elevated ? 'z-[120]' : 'z-[60]';

  if (isNarrow) {
    return (
      <ModalPortal open={isOpen}>
      <AnimatePresence>
        {isOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={BACKDROP}
              onClick={onClose}
              className={`fixed inset-0 ${zLayer} bg-[rgba(17,24,39,0.55)] backdrop-blur-[3px]`}
            />
            <motion.div
              ref={sheetRef}
              tabIndex={-1}
              role="dialog"
              aria-modal="true"
              aria-labelledby="lead-sheet-title"
              style={sheetDrag.reduced ? undefined : { y: sheetDrag.y }}
              {...sheetDrag.sheetMotion}
              className={`fixed inset-x-0 bottom-0 ${zLayer} max-h-[94dvh] flex flex-col bg-white rounded-t-[20px] shadow-[0_-12px_40px_rgba(17,24,39,0.2)] outline-none text-gray-900`}
            >
              {/* Manija: arrastrándola hacia abajo se cierra. */}
              <div {...sheetDrag.handlers} className="flex justify-center pt-2 pb-1.5 -mb-1.5 shrink-0 touch-none cursor-grab active:cursor-grabbing" aria-hidden="true">
                <span className="w-10 h-1 rounded-full bg-[#D5D9DE]" />
              </div>

              {isSuccess ? (
                <div className="px-6 pt-8 text-center flex flex-col items-center" style={{ paddingBottom: 'max(40px, env(safe-area-inset-bottom))' }}>
                  <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mb-5">
                    <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <h3 id="lead-sheet-title" className="text-xl font-bold mb-2">¡Mensaje enviado!</h3>
                  <p className="text-[15px] text-gray-500">Un asesor se pondrá en contacto con vos a la brevedad.</p>
                </div>
              ) : (
                <>
                  <div className="shrink-0 flex items-center gap-3 pl-4 pr-3 pt-3 pb-3.5 border-b border-[#ECEEF1]">
                    {unitThumb && (
                      <span className="relative w-[52px] h-[52px] shrink-0 overflow-hidden rounded-[10px] bg-[#F4F5F6]">
                        <Image src={unitThumb} alt="" fill sizes="52px" className="object-cover" />
                      </span>
                    )}
                    <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                      <h3 id="lead-sheet-title" className="m-0 text-[17px] leading-[22px] font-bold">
                        {unit ? `Consultar por ${uAgree.el} ${unitLabelLower} ${unit.name}` : 'Consultar por el proyecto'}
                      </h3>
                      <span className="text-[13px] text-[#5B6472] truncate">
                        {unit ? unitMeta : 'Te respondemos a la brevedad'}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={onClose}
                      aria-label="Cerrar"
                      className="w-11 h-11 shrink-0 rounded-xl bg-[#F4F5F6] flex items-center justify-center text-gray-900"
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
                    </button>
                  </div>

                  <form
                    id="lead-form-mobile"
                    onSubmit={handleSubmit}
                    className="flex-1 min-h-0 overflow-y-auto overscroll-contain flex flex-col gap-3.5 px-4 pt-4 pb-3"
                  >
                    <button
                      type="button"
                      onClick={handleWhatsApp}
                      className="h-[52px] shrink-0 rounded-xl bg-[#22C55E] text-[#0B1F12] flex items-center justify-center gap-2 text-[16px] font-bold"
                    >
                      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path d={WHATSAPP_PATH} /></svg>
                      Escribir por WhatsApp
                    </button>

                    <div className="flex items-center gap-2.5 text-xs font-medium text-[#5B6472]">
                      <span className="flex-1 h-px bg-[#E6E8EB]" />
                      o dejá tus datos y te llamamos
                      <span className="flex-1 h-px bg-[#E6E8EB]" />
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label htmlFor="lead-m-name" className="text-[13px] font-semibold">Nombre y apellido</label>
                      <input id="lead-m-name" type="text" required autoComplete="name" value={name} onChange={e => setName(e.target.value)} placeholder="Cómo te llamás" className={M_INPUT} />
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label htmlFor="lead-m-phone" className="text-[13px] font-semibold">Celular</label>
                      <div className="flex h-12 rounded-xl border border-[#D5D9DE] overflow-hidden focus-within:border-gray-900 focus-within:ring-2 focus-within:ring-gray-900/10">
                        <span className="flex items-center px-3 bg-[#F4F5F6] text-[15px] font-semibold border-r border-[#D5D9DE]" aria-hidden="true">+54</span>
                        <input
                          ref={phoneRef}
                          id="lead-m-phone"
                          type="tel"
                          inputMode="tel"
                          required
                          autoComplete="tel-national"
                          aria-label="Celular, sin el +54"
                          value={phone}
                          onChange={e => setPhone(e.target.value)}
                          placeholder="387 123 4567"
                          className="flex-1 min-w-0 px-3.5 text-[16px] text-gray-900 placeholder:text-gray-400 outline-none bg-white"
                        />
                      </div>
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label htmlFor="lead-m-email" className="text-[13px] font-semibold">Email</label>
                      <input id="lead-m-email" type="email" inputMode="email" required autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="tu@email.com" className={M_INPUT} />
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label htmlFor="lead-m-msg" className="text-[13px] font-semibold">Mensaje</label>
                      <textarea
                        id="lead-m-msg"
                        rows={3}
                        value={message}
                        onChange={e => setMessage(e.target.value)}
                        className="w-full px-3.5 py-3 rounded-xl border border-[#D5D9DE] text-[16px] leading-[22px] text-gray-900 resize-none outline-none focus:border-gray-900 focus:ring-2 focus:ring-gray-900/10"
                      />
                    </div>
                  </form>

                  <div className="shrink-0 px-4 pt-3 border-t border-[#ECEEF1]" style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}>
                    <button
                      type="submit"
                      form="lead-form-mobile"
                      disabled={isSubmitting}
                      className="w-full h-[52px] rounded-xl bg-gray-900 text-white text-[16px] font-semibold flex items-center justify-center gap-2 disabled:opacity-70"
                    >
                      {isSubmitting ? (
                        <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24" aria-label="Enviando">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                      ) : 'Enviar consulta'}
                    </button>
                  </div>
                </>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>
      </ModalPortal>
    );
  }

  return (
    <ModalPortal open={isOpen}>
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className={`fixed inset-0 ${elevated ? 'z-[120]' : 'z-[60]'} bg-black/60 backdrop-blur-sm`}
          />

          {/* Modal */}
          <div className={`fixed inset-0 ${elevated ? 'z-[120]' : 'z-[60]'} flex items-center justify-center p-4 pointer-events-none`}>
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden pointer-events-auto"
            >
              {isSuccess ? (
                <div className="p-10 text-center flex flex-col items-center justify-center">
                  <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mb-6">
                    <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <h3 className="text-2xl font-bold text-gray-900 mb-2">¡Mensaje enviado!</h3>
                  <p className="text-gray-500">
                    Un asesor se pondrá en contacto con vos a la brevedad.
                  </p>
                </div>
              ) : (
                <div className="flex flex-col h-full max-h-[90vh]">
                  {/* Header */}
                  <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white z-10">
                    <div>
                      <h3 className="text-xl font-bold text-gray-900">
                        {unit ? `Consultar sobre ${uAgree.esta} ${unitLabelLower}` : 'Consultar sobre el proyecto'}
                      </h3>
                      {unit && (
                        <p className="text-sm text-gray-500 mt-1">
                          {unit.name}{!unitIsLand && unit.modelName ? ` • ${unit.modelName}` : ''}
                        </p>
                      )}
                    </div>
                    <button
                      onClick={onClose}
                      className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-200 transition-colors"
                    >
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>

                  {/* Body */}
                  <div className="p-6 overflow-y-auto">
                    <form id="lead-form" onSubmit={handleSubmit} className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Nombre completo</label>
                        <input
                          type="text"
                          required
                          value={name}
                          onChange={e => setName(e.target.value)}
                          className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-50 text-gray-900 placeholder:text-gray-400 focus:bg-white focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 outline-none transition-all hover:border-gray-300"
                          placeholder="Juan Pérez"
                        />
                      </div>
                      
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                        <input
                          type="email"
                          required
                          value={email}
                          onChange={e => setEmail(e.target.value)}
                          className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-50 text-gray-900 placeholder:text-gray-400 focus:bg-white focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 outline-none transition-all hover:border-gray-300"
                          placeholder="juan@ejemplo.com"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Teléfono</label>
                        <input
                          type="tel"
                          required
                          value={phone}
                          onChange={e => setPhone(e.target.value)}
                          className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-50 text-gray-900 placeholder:text-gray-400 focus:bg-white focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 outline-none transition-all hover:border-gray-300"
                          placeholder="+54 11 1234 5678"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Mensaje</label>
                        <textarea
                          rows={4}
                          value={message}
                          onChange={e => setMessage(e.target.value)}
                          className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-50 text-gray-900 placeholder:text-gray-400 focus:bg-white focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 outline-none transition-all hover:border-gray-300 resize-none"
                        />
                      </div>
                    </form>
                  </div>

                  {/* Footer */}
                  <div className="p-6 border-t border-gray-100 bg-gray-50 flex flex-col gap-3 sticky bottom-0">
                    <button
                      type="submit"
                      form="lead-form"
                      disabled={isSubmitting}
                      className="w-full py-3.5 rounded-xl bg-gray-900 hover:bg-gray-800 text-white font-semibold flex items-center justify-center gap-2 transition-all shadow-sm hover:shadow-md disabled:opacity-70 disabled:cursor-not-allowed"
                    >
                      {isSubmitting ? (
                        <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                      ) : (
                        <>
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                          </svg>
                          Enviar consulta
                        </>
                      )}
                    </button>
                    
                    <button
                      type="button"
                      onClick={handleWhatsApp}
                      className="w-full py-3.5 rounded-xl bg-[#25D366] hover:bg-[#20bd5a] text-white font-semibold flex items-center justify-center gap-2 transition-all shadow-sm hover:shadow-md"
                    >
                      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                      </svg>
                      Consultar por WhatsApp
                    </button>
                  </div>
                </div>
              )}
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
    </ModalPortal>
  );
}
