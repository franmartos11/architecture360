'use client';

import { formatPrice } from '@/lib/units';
import { computePlan, indexLabel, type FinancingPlan } from '@/lib/financing';
import { useLocale, useT } from '@/lib/i18n/client';
import { intlLocale, type Locale } from '@/lib/i18n/locales';
import type { ClaveMensaje, T } from '@/lib/i18n/t';

// Piezas de la calculadora de pozo del sitio: el selector de planes y el
// desglose de un plan sobre un precio. Usan las variables del tema del
// proyecto; `tone` elige colores para fondo oscuro (panel del Cotizador) o claro.

type Tone = 'dark' | 'light';

const TONE: Record<Tone, { muted: string; strong: string; line: string }> = {
  dark: { muted: 'text-[var(--theme-text-on-dark-muted)]', strong: 'text-[var(--theme-text-on-dark)]', line: 'border-[var(--theme-border-on-dark)]' },
  light: { muted: 'text-[var(--theme-text-muted)]', strong: 'text-[var(--theme-text)]', line: 'border-[var(--theme-border)]' },
};

const fmtPct = (n: number, locale: Locale) => `${n.toLocaleString(intlLocale(locale), { maximumFractionDigits: 2 })}%`;

// Frecuencias con nombre ("3 refuerzos semestrales"); el resto va "cada N meses".
const FRECUENCIA: Record<number, ClaveMensaje> = {
  3: 'resto.financiacion.refuerzosTrimestrales',
  6: 'resto.financiacion.refuerzosSemestrales',
  12: 'resto.financiacion.refuerzosAnuales',
};

/** "3 refuerzos semestrales de" (como boostsLabel de lib/financing, en el idioma del sitio). */
function refuerzosDe(t: T, boosts: number, everyMonths: number): string {
  return t(FRECUENCIA[everyMonths] ?? 'resto.financiacion.refuerzosCada', { count: boosts, meses: everyMonths });
}

export function PlanSelector({ plans, value, onChange, label }: {
  plans: FinancingPlan[];
  value: string;
  onChange: (id: string) => void;
  label?: string;
}) {
  const t = useT();
  if (plans.length < 2) return null;
  return (
    <fieldset className="border-0 m-0 p-0 min-w-0">
      <legend className="p-0 mb-3 text-[13px] font-semibold text-[var(--theme-text-muted)]">{label ?? t('resto.financiacion.planDePago')}</legend>
      <div className="flex flex-wrap gap-2">
        {plans.map(p => {
          const on = p.id === value;
          return (
            <button
              key={p.id}
              type="button"
              aria-pressed={on}
              onClick={() => onChange(p.id)}
              className={`min-h-11 px-[18px] py-2 rounded-[calc(var(--theme-radius)*0.6)] border text-sm font-semibold cursor-pointer transition-colors duration-200 text-left ${
                on
                  ? 'bg-[var(--theme-text)] text-[var(--theme-bg)] border-[var(--theme-text)]'
                  : 'bg-transparent text-[var(--theme-text)] border-[var(--theme-border)] hover:border-[var(--theme-text)]/40'
              }`}
            >
              {p.name}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

export function PlanBreakdown({ plan, price, currency, tone = 'light' }: {
  plan: FinancingPlan;
  price: number;
  currency: string;
  tone?: Tone;
}) {
  const tono = TONE[tone];
  const t = useT();
  const { locale } = useLocale();
  const pct = (n: number) => fmtPct(n, locale);
  const r = computePlan(price, plan);
  const fmt = (n: number) => formatPrice(Math.round(n), currency, locale);
  const adj = plan.priceAdjustmentPct;

  const rows: { label: string; value: string; detail?: string }[] = [];
  if (adj !== 0) rows.push({ label: t('resto.financiacion.precioConPlan', { signo: adj < 0 ? '−' : '+', pct: pct(Math.abs(adj)) }), value: fmt(r.planPrice) });
  rows.push({ label: t('resto.financiacion.anticipo', { pct: pct(plan.downPaymentPct) }), value: fmt(r.downPayment) });
  if (plan.installments > 0) rows.push({ label: t('resto.financiacion.cuotasDe', { count: plan.installments }), value: fmt(r.installmentAmount) });
  if (plan.boosts > 0) rows.push({ label: refuerzosDe(t, plan.boosts, plan.boostEveryMonths), value: fmt(r.boostAmount) });
  if (r.possessionAmount > 0) rows.push({ label: t('resto.financiacion.saldoPosesion', { pct: pct(r.possessionPct) }), value: fmt(r.possessionAmount) });

  const adjusts = plan.index !== 'ninguno' && (plan.installments > 0 || plan.boosts > 0);

  return (
    <div className="flex flex-col gap-4" aria-live="polite">
      {plan.installments > 0 && (
        <div className="flex flex-col gap-1">
          <p className={`m-0 text-sm ${tono.muted}`}>{t('resto.financiacion.cuotaMensual')}</p>
          <p className={`m-0 font-[family-name:var(--theme-font-heading)] text-[clamp(36px,5vw,56px)] leading-none font-semibold tracking-[-0.04em] tabular-nums ${tono.strong}`}>
            {fmt(r.installmentAmount)}
          </p>
        </div>
      )}
      <dl className={`m-0 flex flex-col gap-2.5 ${plan.installments > 0 ? `pt-4 border-t ${tono.line}` : ''}`}>
        {rows.map(row => (
          <div key={row.label} className={`flex justify-between gap-3 text-sm ${tono.muted}`}>
            <dt>{row.label}</dt>
            <dd className={`m-0 font-semibold tabular-nums ${tono.strong}`}>{row.value}</dd>
          </div>
        ))}
      </dl>
      {(adjusts || plan.note) && (
        <p className={`m-0 text-[12px] leading-normal ${tono.muted}`}>
          {adjusts && t(plan.boosts > 0 ? 'resto.financiacion.ajusteCuotasRefuerzos' : 'resto.financiacion.ajusteCuotas', { indice: indexLabel(plan.index, locale) })}
          {adjusts && plan.note ? ' ' : ''}
          {plan.note}
        </p>
      )}
    </div>
  );
}
