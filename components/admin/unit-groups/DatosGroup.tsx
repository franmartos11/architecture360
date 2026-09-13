'use client';

import { useProjectTypeConfig } from '@/lib/project-type-context';
import type { UnitGroupProps } from '@/lib/unit-fields';

// Lote: sin tipología (es terreno). Depto/dúplex/único: lista curada fija
// (a diferencia de casa, que deriva el tipo de la cantidad de dormitorios
// — ver FloorUnitsEditor, fase 2).
const UNIT_TYPES = ['monoambiente', '1 dormitorio', '2 dormitorios', '3 dormitorios', 'penthouse'] as const;

export default function DatosGroup({ values, onChange }: UnitGroupProps) {
  const { unitIsLand } = useProjectTypeConfig();

  if (unitIsLand) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label className="text-[11.5px] font-medium text-gray-900">Código</label>
          <input
            defaultValue={values.code} key={`code-${values.code}`}
            onBlur={e => { if (e.target.value !== values.code) onChange({ code: e.target.value }); }}
            className="h-9 w-full px-2.5 rounded-lg border border-gray-300 text-xs outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-[11.5px] font-medium text-gray-900">Superficie (m²)</label>
          <input
            type="number" defaultValue={values.totalArea ?? ''} key={`m2-${values.code}`}
            onBlur={e => { const v = e.target.value === '' ? null : Number(e.target.value); if (v !== values.totalArea) onChange({ totalArea: v }); }}
            className="h-9 w-full px-2.5 rounded-lg border border-gray-300 text-xs outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label className="text-[11.5px] font-medium text-gray-900">Código</label>
        <input
          defaultValue={values.code} key={`code-${values.code}`}
          onBlur={e => { if (e.target.value !== values.code) onChange({ code: e.target.value }); }}
          className="h-9 w-full px-2.5 rounded-lg border border-gray-300 text-xs outline-none focus:ring-2 focus:ring-brand-500"
        />
      </div>

      <div className="flex gap-2.5">
        <div className="flex-1 flex flex-col gap-1.5">
          <label className="text-[11.5px] font-medium text-gray-900">Modelo</label>
          <input
            defaultValue={values.modelName ?? ''} key={`model-${values.code}`}
            onBlur={e => { const v = e.target.value.trim() || null; if (v !== values.modelName) onChange({ modelName: v }); }}
            placeholder="SUITE GARDEN"
            className="h-9 w-full px-2.5 rounded-lg border border-gray-300 text-xs outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>
        <div className="flex-1 flex flex-col gap-1.5">
          <label className="text-[11.5px] font-medium text-gray-900">Tipología</label>
          <select
            value={values.type ?? UNIT_TYPES[0]}
            onChange={e => onChange({ type: e.target.value })}
            className="h-9 w-full px-2.5 rounded-lg border border-gray-300 text-xs outline-none focus:ring-2 focus:ring-brand-500"
          >
            {UNIT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
      </div>

      <div className="flex gap-2.5 items-end">
        <div className="flex-1 flex flex-col gap-1.5">
          <label className="text-[11.5px] font-medium text-gray-900">Dormitorios</label>
          <input
            type="number" defaultValue={values.bedrooms ?? ''} key={`bed-${values.code}`}
            onBlur={e => { const v = e.target.value === '' ? null : Number(e.target.value); if (v !== values.bedrooms) onChange({ bedrooms: v }); }}
            className="h-9 w-full px-2.5 rounded-lg border border-gray-300 text-xs outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>
        <div className="flex-1 flex flex-col gap-1.5">
          <label className="text-[11.5px] font-medium text-gray-900">Baños</label>
          <input
            type="number" defaultValue={values.bathrooms ?? ''} key={`bath-${values.code}`}
            onBlur={e => { const v = e.target.value === '' ? null : Number(e.target.value); if (v !== values.bathrooms) onChange({ bathrooms: v }); }}
            className="h-9 w-full px-2.5 rounded-lg border border-gray-300 text-xs outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>
        <label className="flex items-center gap-1.5 h-9 pb-1.5 text-[11px] text-gray-700 whitespace-nowrap shrink-0">
          <input
            type="checkbox" checked={!!values.hasServiceRoom}
            onChange={e => onChange({ hasServiceRoom: e.target.checked })}
            className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
          />
          Serv.
        </label>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-[11.5px] font-medium text-gray-900">Orientación</label>
        <input
          defaultValue={values.orientation ?? ''} key={`orient-${values.code}`}
          onBlur={e => { const v = e.target.value.trim() || null; if (v !== values.orientation) onChange({ orientation: v }); }}
          placeholder="NE"
          className="h-9 w-full px-2.5 rounded-lg border border-gray-300 text-xs outline-none focus:ring-2 focus:ring-brand-500"
        />
      </div>
    </div>
  );
}
