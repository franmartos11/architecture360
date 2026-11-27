'use client';

import { useState } from 'react';
import { formatPrice } from '@/lib/units';
import Dialog from '@/components/ui/Dialog';
import LeadCaptureModal from '@/components/ui/LeadCaptureModal';
import { useCalculatorSettings, type CalculatorSettings } from '@/hooks/useCalculatorSettings';
import { planLeadMessage, type FinancingPlan } from '@/lib/financing';
import { PlanBreakdown, PlanSelector } from '@/components/financing/PlanBreakdown';
import type { Unit } from '@/types';
import { useLocale, useT } from '@/lib/i18n/client';

interface MortgageCalculatorModalProps {
  isOpen: boolean;
  onClose: () => void;
  unitPrice: number;
  currency?: string;
  projectSlug: string;
  /** Para el formulario de "Consultar por este plan" (y la analítica). */
  unit?: Unit;
}

// Calculadora de la ficha de la unidad. Con planes de pago en pozo cargados
// muestra los planes sobre el precio de la unidad; si no, el simulador
// hipotecario. La configuración es la misma que usa el Cotizador del sitio.
export default function MortgageCalculatorModal(props: MortgageCalculatorModalProps) {
  const settings = useCalculatorSettings(props.projectSlug);
  const [leadMessage, setLeadMessage] = useState<string | null>(null);
  const plans = settings?.financingPlans ?? [];
  const t = useT();

  return (
    <>
      <Dialog
        open={props.isOpen}
        onClose={props.onClose}
        title={plans.length ? t('sitio.hipoteca.planesTitulo') : t('sitio.hipoteca.calculadoraTitulo')}
        description={plans.length ? t('sitio.hipoteca.planesBajada') : t('sitio.hipoteca.calculadoraBajada')}
      >
        {!settings ? null : plans.length > 0 ? (
          <PlansContent
            {...props}
            plans={plans}
            onConsult={message => { props.onClose(); setLeadMessage(message); }}
          />
        ) : (
          <MortgageContent {...props} settings={settings} />
        )}
      </Dialog>
      <LeadCaptureModal
        isOpen={leadMessage !== null}
        onClose={() => setLeadMessage(null)}
        unit={props.unit ?? null}
        projectSlug={props.projectSlug}
        initialMessage={leadMessage ?? undefined}
      />
    </>
  );
}

function PlansContent({ unitPrice, currency = 'USD', unit, plans, onConsult }: MortgageCalculatorModalProps & { plans: FinancingPlan[]; onConsult: (message: string) => void }) {
  const [planId, setPlanId] = useState(plans[0].id);
  const plan = plans.find(p => p.id === planId) ?? plans[0];
  const t = useT();
  const { locale } = useLocale();
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-end pb-4 border-b border-gray-100">
        <span className="text-sm font-medium text-gray-500">{t('sitio.hipoteca.precioUnidad')}</span>
        <span className="text-xl font-bold text-gray-900">{formatPrice(unitPrice, currency, locale)}</span>
      </div>
      <PlanSelector plans={plans} value={plan.id} onChange={setPlanId} />
      <PlanBreakdown plan={plan} price={unitPrice} currency={currency} />
      <button
        type="button"
        onClick={() => onConsult(planLeadMessage(plan, unitPrice, currency, unit ? t('sitio.lead.msgSujetoUnidad', { nombre: unit.name }) : undefined, locale))}
        className="w-full py-3.5 rounded-xl bg-gray-900 hover:bg-black text-white font-semibold transition-colors"
      >
        {t('sitio.hipoteca.consultarPlan')}
      </button>
      <p className="text-[10px] text-center text-gray-400 leading-tight">
        {t('sitio.hipoteca.planesAviso')}
      </p>
    </div>
  );
}

function MortgageContent({ unitPrice, currency, settings }: MortgageCalculatorModalProps & { settings: CalculatorSettings }) {
  const [downPaymentPct, setDownPaymentPct] = useState(settings.minDownPayment);
  const [years, setYears] = useState(settings.maxYears);
  const t = useT();
  const { locale } = useLocale();

  // Derived values
  const downPayment = (unitPrice * downPaymentPct) / 100;
  const loanAmount = unitPrice - downPayment;
  
  // Monthly payment calculation
  const monthlyInterestRate = (settings.interestRate / 100) / 12;
  const numberOfPayments = years * 12;
  
  const monthlyPayment = loanAmount <= 0
    ? 0
    : monthlyInterestRate === 0
      ? loanAmount / numberOfPayments
      : (loanAmount * monthlyInterestRate * Math.pow(1 + monthlyInterestRate, numberOfPayments)) / (Math.pow(1 + monthlyInterestRate, numberOfPayments) - 1);

  return (
      <div className="space-y-6">
              {/* Unit Price Display */}
              <div className="flex justify-between items-end pb-4 border-b border-gray-100">
                <span className="text-sm font-medium text-gray-500">{t('sitio.hipoteca.precioUnidad')}</span>
                <span className="text-xl font-bold text-gray-900">{formatPrice(unitPrice, currency, locale)}</span>
              </div>

              {/* Sliders */}
              <div className="space-y-4">
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <label className="text-sm font-semibold text-gray-700">{t('sitio.hipoteca.anticipo')}</label>
                    <span className="text-sm font-bold text-brand-600">{downPaymentPct}%</span>
                  </div>
                  <input 
                    type="range" 
                    min={settings.minDownPayment} 
                    max="100" 
                    value={downPaymentPct}
                    onChange={(e) => setDownPaymentPct(Number(e.target.value))}
                    className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-brand-500"
                  />
                  <div className="flex justify-between mt-1">
                    <span className="text-xs text-gray-400">{t('sitio.hipoteca.minimo', { pct: settings.minDownPayment })}</span>
                    <span className="text-xs font-medium text-gray-600">{formatPrice(downPayment, currency, locale)}</span>
                  </div>
                </div>

                <div>
                  <div className="flex justify-between items-center mb-2">
                    <label className="text-sm font-semibold text-gray-700">{t('sitio.hipoteca.plazo')}</label>
                    <span className="text-sm font-bold text-brand-600">{t('sitio.hipoteca.anios', { count: years })}</span>
                  </div>
                  <input 
                    type="range" 
                    min="1" 
                    max={settings.maxYears} 
                    value={years}
                    onChange={(e) => setYears(Number(e.target.value))}
                    className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-brand-500"
                  />
                  <div className="flex justify-between mt-1">
                    <span className="text-xs text-gray-400">{t('sitio.hipoteca.maximo', { count: settings.maxYears })}</span>
                    <span className="text-xs font-medium text-gray-600">{t('sitio.hipoteca.meses', { count: years * 12 })}</span>
                  </div>
                </div>
              </div>

              {/* Results */}
              <div className="bg-gray-900 rounded-xl p-5 text-white flex justify-between items-center shadow-lg">
                <div>
                  <p className="text-xs text-gray-400 mb-1 uppercase tracking-wider font-semibold">{t('sitio.hipoteca.cuotaEstimada')}</p>
                  <p className="text-3xl font-bold tracking-tight">{formatPrice(monthlyPayment, currency, locale)}</p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] text-gray-400">{t('sitio.hipoteca.tasa', { tasa: settings.interestRate })}</p>
                  <p className="text-[10px] text-gray-400">{t('sitio.hipoteca.monto', { monto: formatPrice(loanAmount, currency, locale) })}</p>
                </div>
              </div>
              
              <p className="text-[10px] text-center text-gray-400 leading-tight">
                {t('sitio.hipoteca.aviso')}
              </p>
      </div>
  );
}
