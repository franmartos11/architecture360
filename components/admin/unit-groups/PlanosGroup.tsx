'use client';

import { useRef, useState } from 'react';
import ImageUploader from '@/components/admin/ImageUploader';
import BimEditorModal from '@/components/admin/BimEditorModal';
import { UNIT_PLAN_FIELDS, type UnitGroupProps } from '@/lib/unit-fields';
import { ensureLevels, plantaLabel } from '@/lib/unit-levels';
import type { UnitLevel } from '@/types';

export default function PlanosGroup({ values, onChange, unitId }: UnitGroupProps & { unitId?: string }) {
  const [bimModalOpen, setBimModalOpen] = useState(false);
  // Planta cuyo render (Planta 3D) se edita: 0 = planta baja → floorPlan3dUrl;
  // k → levels[k-1].plan3dImage.
  const plantas = Math.max(1, values.floorsCount, (values.levels?.length ?? 0) + 1);
  const [planta, setPlanta] = useState(0);
  const activePlanta = Math.min(planta, plantas - 1);
  const [savingLevel, setSavingLevel] = useState(false);
  const [levelError, setLevelError] = useState('');
  // Las escrituras de niveles van en fila: dos subidas seguidas en plantas
  // distintas no se pisan (la segunda relee después de que guardó la primera).
  const queue = useRef<Promise<void>>(Promise.resolve());

  const writeLevelRender = async (i: number, url: string) => {
    setSavingLevel(true);
    setLevelError('');
    try {
      // Los niveles también los edita "Ambientes" (planos y ambientes de cada
      // planta) por su lado: se releen frescos para no pisar esos cambios con
      // la copia que el shell cargó al entrar. Sin datos frescos no se escribe.
      let fresh: UnitLevel[] | null = values.levels;
      if (unitId) {
        const res = await fetch(`/api/admin/units/${unitId}`);
        if (!res.ok) throw new Error('unit');
        fresh = ((await res.json()) as { levels: UnitLevel[] | null }).levels;
      }
      const levels = ensureLevels(fresh, plantas);
      levels[i] = { ...levels[i], plan3dImage: url || null };
      if ((await onChange({ levels })) === false) throw new Error('patch');
    } catch {
      setLevelError('No se pudo guardar el render de esta planta. Probá de nuevo.');
    } finally {
      setSavingLevel(false);
    }
  };
  const setLevelRender = (url: string) => {
    const i = activePlanta - 1;
    queue.current = queue.current.then(() => writeLevelRender(i, url));
  };

  const renderValue = activePlanta === 0 ? values.floorPlan3dUrl : values.levels?.[activePlanta - 1]?.plan3dImage;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <p className="text-[11.5px] font-medium text-gray-900">Modelo 3D interactivo (BIM)</p>
        <button
          type="button"
          onClick={() => setBimModalOpen(true)}
          className="h-10 w-full rounded-lg border border-gray-200 text-xs font-medium text-gray-700 hover:bg-gray-50 hover:border-gray-300 flex items-center justify-center gap-2 transition-colors"
        >
          Gestionar BIM 3D
        </button>
      </div>
      <hr className="border-gray-100" />
      {UNIT_PLAN_FIELDS.map(f => f.key === 'floorPlan3dUrl' && plantas > 1 ? (
        <div key={f.key} className="flex flex-col gap-1.5">
          <p className="text-[11.5px] font-medium text-gray-900">{f.label}</p>
          <div className="flex flex-wrap items-center gap-1 bg-gray-100 rounded-xl p-1 w-fit" role="tablist" aria-label="Planta">
            {Array.from({ length: plantas }, (_, p) => (
              <button
                key={p}
                type="button"
                role="tab"
                aria-selected={activePlanta === p}
                onClick={() => setPlanta(p)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${activePlanta === p ? 'bg-white text-gray-900 shadow' : 'text-gray-500 hover:text-gray-700'}`}
              >
                {values.levels?.[p - 1]?.label || plantaLabel(p, plantas)}
              </button>
            ))}
          </div>
          <ImageUploader
            key={activePlanta}
            value={renderValue ?? ''}
            onChange={url => (activePlanta === 0 ? onChange({ floorPlan3dUrl: url || null }) : setLevelRender(url))}
            folder="floorplans"
          />
          {levelError && <p className="text-[11px] text-red-700">{levelError}</p>}
          <p className="text-[10.5px] text-gray-400">
            {savingLevel ? 'Guardando…' : `Estás editando el render de ${(values.levels?.[activePlanta - 1]?.label || plantaLabel(activePlanta, plantas)).toLowerCase()}. ${f.hint}`}
          </p>
        </div>
      ) : (
        <div key={f.key} className="flex flex-col gap-1.5">
          <p className="text-[11.5px] font-medium text-gray-900">{f.label}</p>
          <ImageUploader value={values[f.key] ?? ''} onChange={url => onChange({ [f.key]: url || null })} folder="floorplans" />
          <p className="text-[10.5px] text-gray-400">{f.hint}</p>
        </div>
      ))}

      {bimModalOpen && (
        <BimEditorModal onClose={() => setBimModalOpen(false)} />
      )}
    </div>
  );
}
