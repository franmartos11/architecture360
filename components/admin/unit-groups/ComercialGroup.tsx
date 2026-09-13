'use client';

import { useProjectTypeConfig } from '@/lib/project-type-context';
import { UNIT_STATUSES } from '@/lib/validate';
import { getStatusLabel, formatPrice } from '@/lib/units';
import type { UnitStatus } from '@/types';
import type { UnitGroupProps } from '@/lib/unit-fields';

const STATUS_PILL_BG: Record<UnitStatus, string> = {
  available: 'bg-emerald-50 border-emerald-200 text-emerald-700',
  reserved: 'bg-amber-50 border-amber-200 text-amber-700',
  sold: 'bg-gray-100 border-gray-200 text-gray-600',
};

export default function ComercialGroup({ values, onChange }: UnitGroupProps) {
  const { showPrice, showStatus } = useProjectTypeConfig();

  return (
    <div className="flex flex-col gap-4">
      {showPrice && (
        <div className="flex flex-col gap-1.5">
          <label className="text-[11.5px] font-medium text-gray-900">Precio</label>
          <input
            type="number" defaultValue={values.price ?? ''} key={`price-${values.code}`}
            onBlur={e => { const v = e.target.value === '' ? null : Number(e.target.value); if (v !== values.price) onChange({ price: v }); }}
            placeholder='Sin precio — se muestra "Consultar"'
            className="h-9 w-full px-2.5 rounded-lg border border-gray-300 text-xs outline-none focus:ring-2 focus:ring-brand-500"
          />
          {values.price != null && <p className="text-[10.5px] text-gray-400">{formatPrice(values.price, values.currency)}</p>}
        </div>
      )}
      {showStatus && (
        <div className="flex flex-col gap-1.5">
          <p className="text-[11.5px] font-medium text-gray-900">Estado</p>
          <div className="flex gap-1.5">
            {UNIT_STATUSES.map(s => (
              <button
                key={s} type="button" onClick={() => onChange({ status: s })}
                className={`flex-1 h-9 rounded-lg text-[11px] font-medium border transition-colors ${values.status === s ? STATUS_PILL_BG[s] : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'}`}
              >
                {getStatusLabel(s)}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
