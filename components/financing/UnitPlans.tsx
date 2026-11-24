'use client';

import { useState } from 'react';
import LeadCaptureModal from '@/components/ui/LeadCaptureModal';
import { planLeadMessage, type FinancingPlan } from '@/lib/financing';
import { PlanBreakdown, PlanSelector } from './PlanBreakdown';
import type { Unit } from '@/types';

// Planes de pago sobre el precio de una unidad, en el bloque "Cuota" de la
// ficha en celular: selector, desglose y "Consultar por este plan".
export default function UnitPlans({ plans, price, currency, projectSlug, unit }: {
  plans: FinancingPlan[];
  price: number;
  currency: string;
  projectSlug: string;
  unit: Unit;
}) {
  const [planId, setPlanId] = useState(plans[0].id);
  const [leadOpen, setLeadOpen] = useState(false);
  const plan = plans.find(p => p.id === planId) ?? plans[0];
  return (
    <div className="flex flex-col gap-4">
      <PlanSelector plans={plans} value={plan.id} onChange={setPlanId} />
      <PlanBreakdown plan={plan} price={price} currency={currency} />
      <button
        type="button"
        onClick={() => setLeadOpen(true)}
        className="min-h-11 w-full rounded-xl bg-[#1A1D21] text-white text-[15px] font-semibold"
      >
        Consultar por este plan
      </button>
      <LeadCaptureModal
        isOpen={leadOpen}
        onClose={() => setLeadOpen(false)}
        unit={unit}
        projectSlug={projectSlug}
        initialMessage={planLeadMessage(plan, price, currency, `la unidad ${unit.name}`)}
      />
    </div>
  );
}
