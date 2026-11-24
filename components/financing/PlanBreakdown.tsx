'use client';

import { formatPrice } from '@/lib/units';
import { boostsLabel, computePlan, INDEX_LABEL, type FinancingPlan } from '@/lib/financing';

// Piezas de la calculadora de pozo del sitio: el selector de planes y el
// desglose de un plan sobre un precio. Usan las variables del tema del
// proyecto; `tone` elige colores para fondo oscuro (panel del Cotizador) o claro.

type Tone = 'dark' | 'light';

const TONE: Record<Tone, { muted: string; strong: string; line: string }> = {
  dark: { muted: 'text-[var(--theme-text-on-dark-muted)]', strong: 'text-[var(--theme-text-on-dark)]', line: 'border-[var(--theme-border-on-dark)]' },
  light: { muted: 'text-[var(--theme-text-muted)]', strong: 'text-[var(--theme-text)]', line: 'border-[var(--theme-border)]' },
};

const fmtPct = (n: number) => `${n.toLocaleString('es-AR', { maximumFractionDigits: 2 })}%`;

export function PlanSelector({ plans, value, onChange, label = 'Plan de pago' }: {
  plans: FinancingPlan[];
  value: string;
  onChange: (id: string) => void;
  label?: string;
}) {
  if (plans.length < 2) return null;
  return (
    <fieldset className="border-0 m-0 p-0 min-w-0">
      <legend className="p-0 mb-3 text-[13px] font-semibold text-[var(--theme-text-muted)]">{label}</legend>
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
  const t = TONE[tone];
  const r = computePlan(price, plan);
  const fmt = (n: number) => formatPrice(Math.round(n), currency);
  const adj = plan.priceAdjustmentPct;

  const rows: { label: string; value: string; detail?: string }[] = [];
  if (adj !== 0) rows.push({ label: `Precio con este plan (${adj < 0 ? '−' : '+'}${fmtPct(Math.abs(adj))})`, value: fmt(r.planPrice) });
  rows.push({ label: `Anticipo (${fmtPct(plan.downPaymentPct)})`, value: fmt(r.downPayment) });
  if (plan.installments > 0) rows.push({ label: `${plan.installments} ${plan.installments === 1 ? 'cuota' : 'cuotas'} de`, value: fmt(r.installmentAmount) });
  if (plan.boosts > 0) rows.push({ label: `${boostsLabel(plan.boosts, plan.boostEveryMonths)} de`, value: fmt(r.boostAmount) });
  if (r.possessionAmount > 0) rows.push({ label: `Saldo a la posesión (${fmtPct(r.possessionPct)})`, value: fmt(r.possessionAmount) });

  const adjusts = plan.index !== 'ninguno' && (plan.installments > 0 || plan.boosts > 0);

  return (
    <div className="flex flex-col gap-4" aria-live="polite">
      {plan.installments > 0 && (
        <div className="flex flex-col gap-1">
          <p className={`m-0 text-sm ${t.muted}`}>Cuota mensual</p>
          <p className={`m-0 font-[family-name:var(--theme-font-heading)] text-[clamp(36px,5vw,56px)] leading-none font-semibold tracking-[-0.04em] tabular-nums ${t.strong}`}>
            {fmt(r.installmentAmount)}
          </p>
        </div>
      )}
      <dl className={`m-0 flex flex-col gap-2.5 ${plan.installments > 0 ? `pt-4 border-t ${t.line}` : ''}`}>
        {rows.map(row => (
          <div key={row.label} className={`flex justify-between gap-3 text-sm ${t.muted}`}>
            <dt>{row.label}</dt>
            <dd className={`m-0 font-semibold tabular-nums ${t.strong}`}>{row.value}</dd>
          </div>
        ))}
      </dl>
      {(adjusts || plan.note) && (
        <p className={`m-0 text-[12px] leading-normal ${t.muted}`}>
          {adjusts && <>Cuotas{plan.boosts > 0 ? ' y refuerzos' : ''} ajustables por {INDEX_LABEL[plan.index]}; los montos son a valores de hoy.</>}
          {adjusts && plan.note ? ' ' : ''}
          {plan.note}
        </p>
      )}
    </div>
  );
}
