'use client';

import { useEffect, useState } from 'react';
import Loaded from '@/components/ui/Loaded';
import { EditorSkeleton } from '@/components/admin/PanelSkeletons';
import { useToast } from '@/components/ui/ToastProvider';
import { useActiveProjectId, withActiveProject } from '@/lib/active-project-context';
import { btnPrimary, btnSecondary } from '@/components/admin/panel-ui';
import { formatPrice } from '@/lib/units';
import { invalidateCalculatorSettings } from '@/hooks/useCalculatorSettings';
import {
  computePlan, describePlan, financingPlanSchema, newPlan, possessionPct,
  FINANCING_INDEXES, INDEX_LABEL, MAX_PLANS, type FinancingPlan,
} from '@/lib/financing';

// Planes de pago en pozo del proyecto (Configuración, debajo de la
// calculadora). Con al menos un plan, el sitio los muestra en vez del
// simulador hipotecario. Se guardan juntos en /api/settings.
// Spec: docs/superpowers/specs/2026-11-24-calculadora-pozo-design.md

const EXAMPLE_PRICE = 100_000;

function planErrors(plan: FinancingPlan): string[] {
  const r = financingPlanSchema.safeParse(plan);
  if (r.success) return [];
  const own = r.error.issues.filter(i => i.path.length === 0).map(i => i.message);
  const name = r.error.issues.some(i => i.path[0] === 'name') ? ['Falta el nombre'] : [];
  const fields = r.error.issues.some(i => i.path.length > 0 && i.path[0] !== 'name') ? ['Revisá los campos: falta un valor o está fuera de rango.'] : [];
  return [...new Set([...name, ...fields, ...own])];
}

export default function FinancingPlansEditor() {
  const toast = useToast();
  const activeProjectId = useActiveProjectId();
  const [plans, setPlans] = useState<FinancingPlan[]>([]);
  const [saved, setSaved] = useState<string>('[]');
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch(withActiveProject('/api/settings', activeProjectId))
      .then(res => {
        if (!res.ok) throw new Error(String(res.status));
        return res.json();
      })
      .then(data => {
        const list: FinancingPlan[] = Array.isArray(data?.financingPlans) ? data.financingPlans : [];
        setPlans(list);
        setSaved(JSON.stringify(list));
      })
      // Sin la lista real no se puede editar: guardar pisaría los planes que ya hay.
      .catch(() => setLoadFailed(true))
      .finally(() => setLoading(false));
  }, [activeProjectId]);

  const dirty = JSON.stringify(plans) !== saved;
  const invalid = plans.some(p => planErrors(p).length > 0);

  const update = (id: string, patch: Partial<FinancingPlan>) => setPlans(ps => ps.map(p => (p.id === id ? { ...p, ...patch } : p)));
  const move = (i: number, dir: -1 | 1) => setPlans(ps => {
    const next = [...ps];
    [next[i], next[i + dir]] = [next[i + dir], next[i]];
    return next;
  });

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch(withActiveProject('/api/settings', activeProjectId), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ financingPlans: plans }),
      });
      if (res.ok) { setSaved(JSON.stringify(plans)); invalidateCalculatorSettings(); toast('Planes de pago guardados.'); } else toast('No se pudieron guardar los planes.', 'error');
    } catch {
      toast('Error de conexión.', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Loaded loading={loading} skeleton={<EditorSkeleton rows={2} padded={false} />}>
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-0.5">
          <span className="text-sm font-semibold text-gray-900">Planes de pago en pozo</span>
          <span className="text-xs text-gray-600">
            Anticipo, cuotas durante la obra, refuerzos y saldo a la posesión. Si cargás al menos un plan, el sitio muestra los planes en vez del simulador hipotecario.
          </span>
        </div>

        {loadFailed && (
          <p className="m-0 text-sm text-red-700">No se pudieron cargar los planes. Recargá la página para editarlos.</p>
        )}

        {!loadFailed && plans.map((plan, i) => (
          <PlanCard
            key={plan.id}
            plan={plan}
            errors={planErrors(plan)}
            first={i === 0}
            last={i === plans.length - 1}
            onChange={patch => update(plan.id, patch)}
            onUp={() => move(i, -1)}
            onDown={() => move(i, 1)}
            onRemove={() => setPlans(ps => ps.filter(p => p.id !== plan.id))}
          />
        ))}

        {!loadFailed && <div className="flex items-center justify-between gap-3 flex-wrap">
          <button type="button" className={btnSecondary} disabled={plans.length >= MAX_PLANS} onClick={() => setPlans(ps => [...ps, newPlan()])}>
            Agregar plan
          </button>
          {dirty && (
            <button type="button" className={btnPrimary} disabled={saving || invalid} onClick={save}>
              {saving ? 'Guardando…' : 'Guardar planes'}
            </button>
          )}
        </div>}
      </div>
    </Loaded>
  );
}

function NumberField({ label, suffix, value, onChange, step = '1', min, max }: {
  label: string;
  suffix?: string;
  value: number;
  onChange: (v: number) => void;
  step?: string;
  min: number;
  max: number;
}) {
  return (
    <label className="flex flex-col gap-1.5 min-w-0">
      <span className="text-xs font-medium text-gray-700">{label}</span>
      <span className="flex items-center min-h-[44px] rounded-[10px] border border-gray-300 bg-white focus-within:border-brand-700 focus-within:ring-2 focus-within:ring-brand-500/30">
        <input
          type="number" inputMode="decimal" step={step} min={min} max={max} aria-label={label}
          value={Number.isFinite(value) ? value : ''}
          onChange={e => onChange(e.target.value === '' ? NaN : Number(e.target.value))}
          className="flex-1 min-w-0 h-full px-3 text-sm text-gray-900 bg-transparent outline-none"
        />
        {suffix && <span className="pr-3 text-xs text-gray-500">{suffix}</span>}
      </span>
    </label>
  );
}

function PlanCard({ plan, errors, first, last, onChange, onUp, onDown, onRemove }: {
  plan: FinancingPlan;
  errors: string[];
  first: boolean;
  last: boolean;
  onChange: (patch: Partial<FinancingPlan>) => void;
  onUp: () => void;
  onDown: () => void;
  onRemove: () => void;
}) {
  const valid = errors.length === 0;
  const poss = possessionPct(plan);
  const r = valid ? computePlan(EXAMPLE_PRICE, plan) : null;
  const fmt = (n: number) => formatPrice(Math.round(n), 'USD');
  const iconBtn = 'w-9 h-9 rounded-lg border border-gray-200 bg-white text-gray-700 hover:border-gray-400 disabled:opacity-40';

  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50/60 p-4 flex flex-col gap-3.5">
      <div className="flex items-end gap-2">
        <label className="flex-1 flex flex-col gap-1.5 min-w-0">
          <span className="text-xs font-medium text-gray-700">Nombre del plan</span>
          <input
            aria-label="Nombre del plan"
            value={plan.name}
            maxLength={60}
            onChange={e => onChange({ name: e.target.value })}
            className="min-h-[44px] px-3 rounded-[10px] border border-gray-300 bg-white text-sm text-gray-900 outline-none focus:border-brand-700"
          />
        </label>
        <button type="button" className={iconBtn} disabled={first} onClick={onUp} aria-label={`Subir ${plan.name}`}>↑</button>
        <button type="button" className={iconBtn} disabled={last} onClick={onDown} aria-label={`Bajar ${plan.name}`}>↓</button>
        <button type="button" className={`${iconBtn} hover:border-red-300 hover:text-red-700`} onClick={onRemove} aria-label={`Eliminar ${plan.name}`}>✕</button>
      </div>

      <div className="grid gap-3 grid-cols-2 sm:grid-cols-3">
        <NumberField label="Anticipo" suffix="%" value={plan.downPaymentPct} min={0} max={100} step="0.5" onChange={v => onChange({ downPaymentPct: v })} />
        <NumberField label="Cantidad de cuotas" value={plan.installments} min={0} max={240} onChange={v => onChange({ installments: v })} />
        <NumberField label="Total en cuotas" suffix="%" value={plan.installmentsPct} min={0} max={100} step="0.5" onChange={v => onChange({ installmentsPct: v })} />
        <NumberField label="Cantidad de refuerzos" value={plan.boosts} min={0} max={240} onChange={v => onChange({ boosts: v })} />
        <NumberField label="Refuerzo cada" suffix="meses" value={plan.boostEveryMonths} min={1} max={60} onChange={v => onChange({ boostEveryMonths: v })} />
        <NumberField label="Total en refuerzos" suffix="%" value={plan.boostsPct} min={0} max={100} step="0.5" onChange={v => onChange({ boostsPct: v })} />
        <NumberField label="Descuento (−) o recargo (+)" suffix="%" value={plan.priceAdjustmentPct} min={-50} max={50} step="0.5" onChange={v => onChange({ priceAdjustmentPct: v })} />
        <label className="flex flex-col gap-1.5 min-w-0">
          <span className="text-xs font-medium text-gray-700">Ajuste de cuotas</span>
          <select
            aria-label="Ajuste de cuotas"
            value={plan.index}
            onChange={e => onChange({ index: e.target.value as FinancingPlan['index'] })}
            className="min-h-[44px] px-3 rounded-[10px] border border-gray-300 bg-white text-sm text-gray-900 outline-none focus:border-brand-700"
          >
            {FINANCING_INDEXES.map(i => <option key={i} value={i}>{i === 'ninguno' ? INDEX_LABEL[i] : `Por ${INDEX_LABEL[i]}`}</option>)}
          </select>
        </label>
        <div className="flex flex-col gap-1.5 min-w-0">
          <span className="text-xs font-medium text-gray-700">Saldo a la posesión</span>
          <span className={`min-h-[44px] px-3 flex items-center rounded-[10px] border border-dashed text-sm font-semibold ${valid ? 'border-gray-300 text-gray-900' : 'border-red-300 text-red-700'}`}>
            {Number.isFinite(poss) ? `${poss.toLocaleString('es-AR')}%` : '—'}
          </span>
        </div>
      </div>

      <label className="flex flex-col gap-1.5 min-w-0">
        <span className="text-xs font-medium text-gray-700">Nota para el comprador (opcional)</span>
        <input
          aria-label="Nota para el comprador"
          value={plan.note ?? ''}
          maxLength={200}
          placeholder="Ej. Cuotas en pesos al tipo de cambio del día de pago."
          onChange={e => onChange({ note: e.target.value || undefined })}
          className="min-h-[44px] px-3 rounded-[10px] border border-gray-300 bg-white text-sm text-gray-900 outline-none focus:border-brand-700"
        />
      </label>

      {valid && r ? (
        <div className="text-xs text-gray-600 flex flex-col gap-0.5">
          <span>{describePlan(plan)}</span>
          <span>
            Ejemplo sobre {fmt(EXAMPLE_PRICE)}: anticipo {fmt(r.downPayment)}
            {plan.installments > 0 && ` · ${plan.installments} cuotas de ${fmt(r.installmentAmount)}`}
            {plan.boosts > 0 && ` · ${plan.boosts} refuerzos de ${fmt(r.boostAmount)}`}
            {r.possessionAmount > 0 && ` · posesión ${fmt(r.possessionAmount)}`}
          </span>
        </div>
      ) : (
        <ul className="m-0 pl-4 text-xs text-red-700">
          {errors.map(e => <li key={e}>{e}</li>)}
        </ul>
      )}
    </div>
  );
}
