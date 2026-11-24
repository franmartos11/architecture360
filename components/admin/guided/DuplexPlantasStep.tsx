'use client';

import { useMemo, useState } from 'react';
import ImageUploader from '@/components/admin/ImageUploader';
import { useToast } from '@/components/ui/ToastProvider';
import { plantaLabel, modelSlotValue, fillPlantas, type PlantaValues, type SlotKind } from '@/lib/unit-levels';
import { SplitLayout, StepIntro, StepFooter, Segmented, ErrorNote, allUnits, useGuidedApi, fetchFreshLevels, type GUnit, type GuidedTree } from './shared';

const MODEL_FALLBACK = 'Modelo único';
const KINDS: { kind: SlotKind; label: string }[] = [
  { kind: 'plano', label: 'Plano' },
  { kind: 'render', label: 'Render 3D' },
];

/** Plantas que muestra un modelo: la mayor cantidad entre sus unidades. */
function plantasOfModel(units: GUnit[]): number {
  return Math.max(1, ...units.map(u => Math.max(u.floors_count, (u.levels?.length ?? 0) + 1)));
}

function initialValues(units: GUnit[]): PlantaValues {
  return Array.from({ length: plantasOfModel(units) }, (_, planta) => ({
    plano: modelSlotValue(units, planta, 'plano').value,
    render: modelSlotValue(units, planta, 'render').value,
  }));
}

/**
 * Paso "Plantas" del dúplex: el plano y el render de cada planta se cargan
 * una vez por modelo y se aplican a todas sus unidades — completando solo lo
 * vacío, nunca pisando lo cargado a mano en una unidad puntual.
 */
export default function DuplexPlantasStep({ tree, reload, onBack, onNext }: { tree: GuidedTree; reload: () => Promise<void>; onBack: () => void; onNext: () => void }) {
  const { patch } = useGuidedApi();
  const toast = useToast();
  const models = useMemo(() => {
    const byName = new Map<string, GUnit[]>();
    for (const u of allUnits(tree)) {
      const name = u.model_name || MODEL_FALLBACK;
      byName.set(name, [...(byName.get(name) ?? []), u]);
    }
    return [...byName.entries()].map(([name, units]) => ({ name, units }));
  }, [tree]);
  const [active, setActive] = useState(models[0]?.name ?? MODEL_FALLBACK);
  const model = models.find(m => m.name === active) ?? models[0];
  // Lo que se está cargando, por modelo (cambiar de pestaña no lo pierde).
  const [drafts, setDrafts] = useState<Record<string, PlantaValues>>(() =>
    Object.fromEntries(models.map(m => [m.name, initialValues(m.units)])));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (!model) return null;
  const values = drafts[model.name] ?? initialValues(model.units);
  const plantas = values.length;
  const floorsCount = plantasOfModel(model.units);

  const setSlot = (planta: number, kind: SlotKind, url: string) => setDrafts(prev => {
    const next = [...(prev[model.name] ?? initialValues(model.units))];
    next[planta] = { ...next[planta], [kind]: url || null };
    return { ...prev, [model.name]: next };
  });

  const apply = async () => {
    setError('');
    setBusy(true);
    // Se releen las unidades: `levels` se escribe entero, y desde que se
    // abrió el paso alguien pudo cargar algo en otra planta (Ambientes, otra
    // pestaña). Sin datos frescos no se escribe nada.
    const fresh = await fetchFreshLevels(model.units);
    if (!fresh) { setBusy(false); setError('No se pudieron releer las unidades. Probá de nuevo.'); return; }
    // Lo que el modelo compartía (p. ej. lo aplicado antes desde acá) se
    // puede reemplazar; lo distinto, cargado a mano en una unidad, no.
    const previous = initialValues(model.units);
    const results = fresh.map(u => ({ u, ...fillPlantas(u, values, previous) }));
    const changes = results.filter(r => Object.keys(r.patch).length > 0);
    const filled = results.reduce((n, r) => n + r.filled, 0);
    const kept = results.flatMap(r => r.kept.map(k => `${r.u.code} (${plantaLabel(k.planta, floorsCount).toLowerCase()}, ${k.kind === 'plano' ? 'plano' : 'render'})`));
    if (changes.length === 0) {
      setBusy(false);
      toast(kept.length ? `No había nada vacío para completar. Se mantuvieron: ${kept.join(', ')}.` : 'No había nada para completar.');
      return;
    }
    const res = await patch({ units: changes.map(r => ({ id: r.u.id, ...r.patch })) });
    setBusy(false);
    if (!res.ok) { setError(res.error); return; }
    toast(`${filled} ${filled === 1 ? 'imagen cargada' : 'imágenes cargadas'}${kept.length ? `. Se mantuvieron: ${kept.join(', ')}` : ''}.`);
    await reload();
  };

  const loadedSlots = values.reduce((n, v) => n + (v.plano ? 1 : 0) + (v.render ? 1 : 0), 0);

  return (
    <SplitLayout
      panel={
        <>
          <StepIntro eyebrow="Paso 3 de 4" title="Plano y render de cada planta">
            Se cargan una vez por modelo y se aplican a todas sus unidades. Si una unidad ya tiene una imagen propia, se mantiene.
          </StepIntro>
          {models.length > 1 && (
            <Segmented label="Modelo" value={model.name} options={models.map(m => ({ value: m.name, label: m.name }))} onChange={setActive} fit />
          )}
          <p className="m-0 text-[13px] text-gray-600">
            {model.name}: {model.units.map(u => u.code).join(', ')}
          </p>
          <button type="button" onClick={onNext} className="self-start min-h-[40px] text-[13px] font-semibold text-brand-700 underline underline-offset-2">
            Lo cargo después
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {Array.from({ length: plantas }, (_, planta) => (
          <section key={planta} className="rounded-[14px] border border-gray-200 bg-white p-4 flex flex-col gap-3">
            <h3 className="m-0 text-sm font-semibold text-gray-900">{plantaLabel(planta, floorsCount)}</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {KINDS.map(({ kind, label }) => {
                const { differing } = modelSlotValue(model.units, planta, kind);
                return (
                  <div key={kind} className="flex flex-col gap-1.5">
                    <ImageUploader label={label} value={values[planta]?.[kind] ?? ''} onChange={url => setSlot(planta, kind, url)} folder="floorplans" />
                    {differing.length > 0 && (
                      <p className="m-0 text-xs text-gray-500">
                        {differing.join(', ')} {differing.length === 1 ? 'tiene' : 'tienen'} otro cargado; no se va a pisar.
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>
      <ErrorNote>{error}</ErrorNote>
      <StepFooter
        back={{ label: 'Plano del conjunto', onClick: onBack }}
        summary={<>{loadedSlots} de {plantas * 2} imágenes · se aplican a {model.units.length} {model.units.length === 1 ? 'unidad' : 'unidades'}</>}
        primary={{ label: `Aplicar a las ${model.units.length}`, onClick: apply, busy, disabled: loadedSlots === 0 }}
      />
      <div className="flex justify-end">
        <button type="button" onClick={onNext} className="min-h-[40px] px-4 rounded-[9px] border border-gray-300 bg-white text-[13px] font-semibold text-gray-900 hover:border-gray-400">
          Continuar
        </button>
      </div>
    </SplitLayout>
  );
}
