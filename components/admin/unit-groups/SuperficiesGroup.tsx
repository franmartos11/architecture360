'use client';

import type { UnitGroupProps } from '@/lib/unit-fields';

export default function SuperficiesGroup({ values, onChange }: UnitGroupProps) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label className="text-[11.5px] font-medium text-gray-900">Superficie total (m²)</label>
        <input
          type="number" defaultValue={values.totalArea ?? ''} key={`m2-${values.code}`}
          onBlur={e => { const v = e.target.value === '' ? null : Number(e.target.value); if (v !== values.totalArea) onChange({ totalArea: v }); }}
          className="h-9 w-full px-2.5 rounded-lg border border-gray-300 text-xs outline-none focus:ring-2 focus:ring-brand-500"
        />
      </div>
      <div className="flex gap-2.5">
        <div className="flex-1 flex flex-col gap-1.5">
          <label className="text-[11.5px] font-medium text-gray-900">Interior (m²)</label>
          <input
            type="number" defaultValue={values.innerArea ?? ''} key={`inner-${values.code}`}
            onBlur={e => { const v = e.target.value === '' ? null : Number(e.target.value); if (v !== values.innerArea) onChange({ innerArea: v }); }}
            className="h-9 w-full px-2.5 rounded-lg border border-gray-300 text-xs outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>
        <div className="flex-1 flex flex-col gap-1.5">
          <label className="text-[11.5px] font-medium text-gray-900">Balcón (m²)</label>
          <input
            type="number" defaultValue={values.balconyArea ?? 0} key={`balcony-${values.code}`}
            onBlur={e => { const v = e.target.value === '' ? 0 : Number(e.target.value); if (v !== values.balconyArea) onChange({ balconyArea: v }); }}
            className="h-9 w-full px-2.5 rounded-lg border border-gray-300 text-xs outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>
        <div className="flex-1 flex flex-col gap-1.5">
          <label className="text-[11.5px] font-medium text-gray-900">Exterior (m²)</label>
          <input
            type="number" defaultValue={values.externalArea ?? 0} key={`external-${values.code}`}
            onBlur={e => { const v = e.target.value === '' ? 0 : Number(e.target.value); if (v !== values.externalArea) onChange({ externalArea: v }); }}
            className="h-9 w-full px-2.5 rounded-lg border border-gray-300 text-xs outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>
      </div>
    </div>
  );
}
