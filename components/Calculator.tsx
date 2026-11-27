'use client';

import { useState } from 'react';
import LeadCaptureModal from '@/components/ui/LeadCaptureModal';
import { Container, Pill, SectionHeading } from '@/components/project-landing/ui';
import { formatPrice } from '@/lib/units';
import { useCalculatorSettings, type CalculatorSettings } from '@/hooks/useCalculatorSettings';
import { planLeadMessage, type FinancingPlan } from '@/lib/financing';
import { PlanBreakdown, PlanSelector } from '@/components/financing/PlanBreakdown';
import { useLocale, useT } from '@/lib/i18n/client';
import { intlLocale, type Locale } from '@/lib/i18n/locales';

export interface CalculatorModel {
  label: string;
  price: number;
  currency: string;
}

// Mezcla el valor configurado por el admin en las opciones fijas, para que
// quede seleccionable aunque no coincida con ninguna de las predefinidas
// (ej. una tasa de 5.5% con opciones 6.5/7/8).
function withValue(options: number[], value: number) {
  return options.includes(value) ? options : [...options, value].sort((a, b) => a - b);
}

const fmtPct = (n: number, locale: Locale) => `${n.toLocaleString(intlLocale(locale))}%`;

function Segmented<T extends string | number>({ label, options, value, onChange, format }: {
  label: string;
  options: T[];
  value: T;
  onChange: (v: T) => void;
  format: (v: T) => string;
}) {
  return (
    <fieldset className="border-0 m-0 p-0 min-w-0">
      <legend className="p-0 mb-3 text-[13px] font-semibold text-[var(--theme-text-muted)]">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map(o => {
          const on = o === value;
          return (
            <button
              key={String(o)}
              type="button"
              aria-pressed={on}
              onClick={() => onChange(o)}
              className={`min-h-11 px-[18px] py-2 rounded-[calc(var(--theme-radius)*0.6)] border text-sm font-semibold cursor-pointer transition-colors duration-200 text-left ${
                on
                  ? 'bg-[var(--theme-text)] text-[var(--theme-bg)] border-[var(--theme-text)]'
                  : 'bg-transparent text-[var(--theme-text)] border-[var(--theme-border)] hover:border-[var(--theme-text)]/40'
              }`}
            >
              {format(o)}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

// Índice de "Otro monto" dentro del selector de modelos.
const CUSTOM = -1;

/**
 * Cotizador del sitio. Si la desarrolladora cargó planes de pago en pozo,
 * muestra los planes; si no, el simulador hipotecario. Mientras carga la
 * configuración no se muestra nada (así no aparece uno y salta al otro).
 */
export default function Calculator({ projectSlug, models, plansOnly = false }: {
  projectSlug: string;
  models: CalculatorModel[];
  /** Loteo: solo con planes de pago cargados (un simulador hipotecario sobre lotes confunde). */
  plansOnly?: boolean;
}) {
  const settings = useCalculatorSettings(projectSlug);
  // Mientras carga, el ancla ya existe (los links "#cotizador" del menú
  // llegan) y el alto reservado evita que el resto de la página salte.
  if (!settings) return <section id="cotizador" aria-busy="true" className="min-h-[480px] bg-[var(--theme-bg)]" />;
  if (settings.financingPlans.length > 0) return <PozoCalculator projectSlug={projectSlug} models={models} plans={settings.financingPlans} />;
  if (plansOnly) return null;
  return <MortgageCalculator projectSlug={projectSlug} models={models} settings={settings} />;
}

/**
 * Elección del valor: `models` sale de las unidades con precio del proyecto
 * (ver CalculatorSection); si no hay ninguna, se tipea el valor a mano en
 * vez de inventar modelos con precios que no existen. Con modelos, la opción
 * "Otro monto" deja tipear un valor propio igual.
 */
function usePriceChoice(models: CalculatorModel[]) {
  const t = useT();
  const { locale } = useLocale();
  const [modelIndex, setModelIndex] = useState(0);
  const [manualPrice, setManualPrice] = useState('');
  const model = modelIndex === CUSTOM ? undefined : models[modelIndex];
  const currency = model?.currency ?? models[0]?.currency ?? 'USD';
  const price = model ? model.price : Number(manualPrice.replace(/\D/g, '')) || 0;

  const controls = (
    <>
      {models.length > 0 && (
        <Segmented
          label={t('resto.calc.modelo')}
          options={[...models.map((_, i) => i), CUSTOM]}
          value={modelIndex}
          onChange={setModelIndex}
          format={i => (i === CUSTOM ? t('resto.calc.otroMonto') : `${models[i].label} · ${formatPrice(models[i].price, models[i].currency, locale)}`)}
        />
      )}
      {!model && (
        <label className="flex flex-col gap-3 text-[13px] font-semibold text-[var(--theme-text-muted)]">
          {t(models.length > 0 ? 'resto.calc.monto' : 'resto.calc.valorPropiedad', { moneda: currency })}
          <input
            inputMode="numeric"
            autoFocus={models.length > 0}
            value={manualPrice}
            onChange={e => setManualPrice(e.target.value.replace(/\D/g, '') ? Number(e.target.value.replace(/\D/g, '')).toLocaleString(intlLocale(locale)) : '')}
            placeholder={t('resto.calc.ejemploMonto')}
            className="h-12 px-4 rounded-[calc(var(--theme-radius)*0.6)] border border-[var(--theme-border)] bg-transparent text-base font-medium text-[var(--theme-text)] outline-none focus:border-[var(--theme-text)]"
          />
        </label>
      )}
    </>
  );
  return { model, currency, price, controls };
}

function PozoCalculator({ projectSlug, models, plans }: { projectSlug: string; models: CalculatorModel[]; plans: FinancingPlan[] }) {
  const { model, currency, price, controls } = usePriceChoice(models);
  const t = useT();
  const { locale } = useLocale();
  const [planId, setPlanId] = useState(plans[0].id);
  const [isLeadModalOpen, setIsLeadModalOpen] = useState(false);
  const plan = plans.find(p => p.id === planId) ?? plans[0];

  return (
    <section id="cotizador" className="py-[calc(var(--theme-spacing)/2)] bg-[var(--theme-bg)]">
      <Container>
        <SectionHeading eyebrow={t('resto.calc.pozoEyebrow')} title={t('resto.calc.pozoTitulo')} muted={t('resto.calc.pozoMuted')} className="mb-12" />
        <div className="flex flex-wrap gap-5">
          <div className="flex-[999_1_520px] min-w-0 border border-[var(--theme-border)] rounded-[calc(var(--theme-radius)*1.4)] p-5 sm:p-8 flex flex-col gap-7">
            {controls}
            <PlanSelector plans={plans} value={plan.id} onChange={setPlanId} />
            <p className="m-0 text-[13px] text-[var(--theme-text-muted)]">{plans.length > 1 ? t('resto.calc.cadaPlan') : t('resto.calc.planDePagoNombre', { nombre: plan.name })}</p>
          </div>
          <div className="flex-[1_1_340px] bg-[var(--theme-bg-alt)] text-[var(--theme-text-on-dark)] rounded-[calc(var(--theme-radius)*1.4)] p-6 sm:p-8 flex flex-col justify-between gap-8">
            {price > 0
              ? <PlanBreakdown plan={plan} price={price} currency={currency} tone="dark" />
              : <p className="m-0 text-sm text-[var(--theme-text-on-dark-muted)]">{t('resto.calc.ingresaMonto')}</p>}
            <div className="flex flex-col gap-3.5">
              <Pill variant="light" arrow size="lg" block onClick={() => setIsLeadModalOpen(true)}>{t('resto.financiacion.consultarPlan')}</Pill>
              <p className="m-0 text-[11px] leading-normal text-[var(--theme-text-on-dark-muted)]">
                {t('resto.calc.pozoAviso')}
              </p>
            </div>
          </div>
        </div>
      </Container>
      <LeadCaptureModal
        isOpen={isLeadModalOpen}
        onClose={() => setIsLeadModalOpen(false)}
        unit={null}
        projectSlug={projectSlug}
        initialMessage={price > 0
          ? planLeadMessage(plan, price, currency, model ? t('resto.calc.msgSujetoModelo', { modelo: model.label }) : undefined, locale)
          : t('resto.calc.msgPlan', { plan: plan.name })}
      />
    </section>
  );
}

function MortgageCalculator({ projectSlug, models, settings }: { projectSlug: string; models: CalculatorModel[]; settings: CalculatorSettings }) {
  const { model, currency, price, controls } = usePriceChoice(models);
  const t = useT();
  const { locale } = useLocale();
  const [prima, setPrima] = useState(settings.minDownPayment);
  const [tasa, setTasa] = useState(settings.interestRate);
  const [plazo, setPlazo] = useState(settings.maxYears);
  const primaOptions = withValue([15, 20, 25, 30], settings.minDownPayment);
  const tasaOptions = withValue([6.5, 7, 8], settings.interestRate);
  const plazoOptions = withValue([20, 25, 30], settings.maxYears);
  const [isLeadModalOpen, setIsLeadModalOpen] = useState(false);

  // Monto: valor - anticipo.
  const monto = price - (price * prima / 100);

  // Cuota (sistema francés): derivada de monto/tasa/plazo en cada render.
  const resultado = (() => {
    const r = tasa / 12 / 100;
    const n = plazo * 12;
    if (r === 0) return monto / n;
    const pow = Math.pow(1 + r, n);
    return (monto * (r * pow)) / (pow - 1);
  })();

  const fmt = (n: number) => formatPrice(Math.round(n), currency, locale);
  const summary = [
    model?.label ?? (models.length > 0 && price > 0 ? t('resto.calc.valor', { monto: fmt(price) }) : undefined),
    t('resto.calc.pctAnticipo', { pct: prima }),
    t('resto.calc.tasaAnual', { pct: fmtPct(tasa, locale) }),
    t('resto.calc.anios', { count: plazo }),
  ].filter(Boolean).join(' · ');

  return (
    <section id="cotizador" className="py-[calc(var(--theme-spacing)/2)] bg-[var(--theme-bg)]">
      <Container>
        <SectionHeading eyebrow={t('resto.calc.hipotecaEyebrow')} title={t('resto.calc.hipotecaTitulo')} muted={t('resto.calc.hipotecaMuted')} className="mb-12" />
        <div className="flex flex-wrap gap-5">
          <div className="flex-[999_1_520px] min-w-0 border border-[var(--theme-border)] rounded-[calc(var(--theme-radius)*1.4)] p-5 sm:p-8 flex flex-col gap-7">
            {controls}
            <Segmented label={t('resto.calc.anticipo')} options={primaOptions} value={prima} onChange={setPrima} format={p => `${p}%`} />
            <Segmented label={t('resto.calc.tasaInteres')} options={tasaOptions} value={tasa} onChange={setTasa} format={p => fmtPct(p, locale)} />
            <Segmented label={t('resto.calc.plazo')} options={plazoOptions} value={plazo} onChange={setPlazo} format={p => t('resto.calc.anios', { count: p })} />
          </div>

          <div className="flex-[1_1_340px] bg-[var(--theme-bg-alt)] text-[var(--theme-text-on-dark)] rounded-[calc(var(--theme-radius)*1.4)] p-6 sm:p-8 flex flex-col justify-between gap-8">
            <div className="flex flex-col gap-5" aria-live="polite">
              <div className="flex justify-between gap-3 text-sm text-[var(--theme-text-on-dark-muted)]">
                <span>{t('resto.financiacion.anticipo', { pct: `${prima}%` })}</span>
                <strong className="text-[var(--theme-text-on-dark)] font-semibold">{price > 0 ? fmt(price - monto) : '—'}</strong>
              </div>
              <div className="flex justify-between gap-3 text-sm text-[var(--theme-text-on-dark-muted)] pb-4 border-b border-[var(--theme-border-on-dark)]">
                <span>{t('resto.calc.montoFinanciar')}</span>
                <strong className="text-[var(--theme-text-on-dark)] font-semibold">{price > 0 ? fmt(monto) : '—'}</strong>
              </div>
              <p className="m-0 text-sm text-[var(--theme-text-on-dark-muted)]">{t('resto.calc.cuotaAproximada')}</p>
              <p className="m-0 -mt-2 font-[family-name:var(--theme-font-heading)] text-[clamp(40px,5vw,64px)] leading-none font-semibold tracking-[-0.04em] tabular-nums">
                {price > 0 ? fmt(resultado) : '—'}
              </p>
              <p className="m-0 text-[13px] text-[var(--theme-text-on-dark-muted)]">{summary}</p>
            </div>
            <div className="flex flex-col gap-3.5">
              <Pill variant="light" arrow size="lg" block onClick={() => setIsLeadModalOpen(true)}>{t('resto.calc.solicitarInfo')}</Pill>
              <p className="m-0 text-[11px] leading-normal text-[var(--theme-text-on-dark-muted)]">
                {t('resto.calc.hipotecaAviso')}
              </p>
            </div>
          </div>
        </div>
      </Container>

      <LeadCaptureModal
        isOpen={isLeadModalOpen}
        onClose={() => setIsLeadModalOpen(false)}
        unit={null}
        projectSlug={projectSlug}
        initialMessage={t('resto.calc.msgHipoteca', {
          sujeto: model ? t('resto.calc.msgDelModelo', { modelo: model.label }) : price > 0 ? t('resto.calc.msgParaValor', { monto: fmt(price) }) : '',
          cuota: fmt(resultado),
          monto: fmt(monto),
          plazo,
          tasa,
        })}
      />
    </section>
  );
}
