'use client';

import { useMemo, useState } from 'react';
import { TransitionLink as Link } from '@/components/ui/TransitionUtils';
import ImageUploader from '@/components/admin/ImageUploader';
import PolygonCanvas, { type PolygonShape } from '@/components/admin/PolygonCanvas';
import { useToast } from '@/components/ui/ToastProvider';
import {
  planEdificio, countUnits, duplicateCodes, positionLetter, centroid, GROUND_FLOOR_OPTIONS,
  type TowerInput, type NumberingScheme, type GroundFloorUse, type PlannedBuilding,
} from '@/lib/guided-structure';
import ListoScreen, { PreviewCard } from './ListoScreen';
import {
  GuidedHeader, StepIntro, StepFooter, NumberStepper, Segmented, FieldLabel, NumberField, ErrorNote,
  inputClass, allUnits, allFloors, useGuidedApi, SHAPE_PALETTE,
  type GBuilding, type GFloor, type GUnit, type GuidedTree, type UnitDot,
} from './shared';
import type { FlowProps } from './GuidedLoad';

const STEPS = [{ label: 'Estructura' }, { label: 'Tipologías' }, { label: 'Planta tipo' }, { label: 'Listo' }];

// ─── Helpers sobre el árbol ya creado ──────────────────────────────

const byCode = (a: GUnit, b: GUnit) => a.code.localeCompare(b.code, 'es', { numeric: true });

/** Pisos tipo: numerados desde 1, de departamentos, y que no sean el último piso distinto (PH). */
function typicalFloors(b: GBuilding): GFloor[] {
  return b.floors
    .filter(f => f.number >= 1 && f.label !== 'Penthouse' && f.floor_kind === 'units' && f.units.length > 0)
    .sort((a, c) => a.number - c.number);
}

function phFloors(b: GBuilding): GFloor[] {
  return b.floors.filter(f => f.label === 'Penthouse');
}

function positionsOf(b: GBuilding): number {
  return typicalFloors(b).reduce((m, f) => Math.max(m, f.units.length), 0);
}

function codeFromModel(modelName: string | null): string | null {
  const m = modelName?.match(/^Tipología\s+(.+)$/);
  return m ? m[1].trim() : null;
}

// ─── Flujo ─────────────────────────────────────────────────────────

export default function EdificioFlow({ project, tree, setTree, reload, step, goTo }: FlowProps) {
  const hasStructure = tree.buildings.length > 0;
  const current = Math.min(4, Math.max(1, step ?? (hasStructure ? 2 : 1)));
  const effective = hasStructure ? current : 1;

  return (
    <>
      <GuidedHeader
        project={project}
        kindLabel="Edificio"
        steps={STEPS}
        current={effective}
        onStep={goTo}
        canGoTo={n => n === 1 || hasStructure}
      />
      {effective === 1 && (hasStructure
        ? <StructureSummary tree={tree} onNext={() => goTo(2)} />
        : <EstructuraStep onCreated={t => { setTree(t); goTo(2); }} />)}
      {effective === 2 && <TipologiasStep tree={tree} reload={reload} onBack={() => goTo(1)} onNext={() => goTo(3)} />}
      {effective === 3 && <PlantaStep tree={tree} reload={reload} onBack={() => goTo(2)} onNext={() => goTo(4)} />}
      {effective === 4 && <ListoStep project={project} tree={tree} onBackToStart={() => goTo(1)} />}
    </>
  );
}

// ─── Paso 1 · Estructura ───────────────────────────────────────────

const SCHEME_OPTIONS: { value: NumberingScheme; label: string }[] = [
  { value: 'letter', label: '1A, 1B, 1C' },
  { value: 'number', label: '101, 102' },
  { value: 'custom', label: 'Propio' },
];

function EstructuraStep({ onCreated }: { onCreated: (t: GuidedTree) => void }) {
  const { create } = useGuidedApi();
  const [towers, setTowers] = useState<TowerInput[]>([
    { name: 'Torre 1', floors: 7, perFloor: 4, groundFloor: 'amenities', penthouses: 0 },
  ]);
  const [scheme, setScheme] = useState<NumberingScheme>('letter');
  const [template, setTemplate] = useState('{piso}{letra}');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const plan = useMemo(() => planEdificio(towers, scheme, scheme === 'custom' ? template : undefined), [towers, scheme, template]);
  const total = countUnits(plan);
  const levels = plan.reduce((s, b) => s + b.floors.length, 0);
  const dups = duplicateCodes(plan);

  const update = (i: number, patch: Partial<TowerInput>) => setTowers(ts => ts.map((t, j) => (j === i ? { ...t, ...patch } : t)));

  const submit = async () => {
    setError('');
    setBusy(true);
    const res = await create<GuidedTree>({ kind: 'edificio', towers, scheme, template: scheme === 'custom' ? template : undefined });
    setBusy(false);
    if (!res.ok) { setError(res.error); return; }
    onCreated({ buildings: res.data.buildings });
  };

  return (
    <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-8 flex gap-8 flex-wrap items-start">
      <section aria-label="Estructura" className="flex-[2_1_420px] min-w-0 flex flex-col gap-6">
        <StepIntro eyebrow="Paso 1 de 4" title="¿Cómo es el edificio?">
          Contanos cuántas torres, pisos y unidades por piso. Armamos toda la estructura de una vez; después ajustás lo que sea distinto.
        </StepIntro>

        {towers.map((t, i) => (
          <div key={i} className="flex flex-col gap-4 p-4 rounded-2xl border border-gray-200 bg-white">
            <div className="flex items-end gap-3">
              <label className="flex flex-col gap-1.5 flex-1 min-w-0">
                <FieldLabel>Nombre</FieldLabel>
                <input value={t.name} onChange={e => update(i, { name: e.target.value })} className={inputClass} />
              </label>
              {towers.length > 1 && (
                <button type="button" onClick={() => setTowers(ts => ts.filter((_, j) => j !== i))}
                  className="min-h-[44px] px-3 text-[13px] font-medium text-red-600 hover:bg-red-50 rounded-lg">
                  Quitar
                </button>
              )}
            </div>
            <div className="flex gap-x-3 gap-y-4 sm:gap-4 flex-wrap">
              <NumberStepper label="Pisos tipo" value={t.floors} onChange={n => update(i, { floors: n })} min={1} max={200} />
              <NumberStepper label="Unidades por piso" value={t.perFloor} onChange={n => update(i, { perFloor: n })} min={1} max={60} />
              <NumberStepper label="Penthouses (último piso distinto)" value={t.penthouses} onChange={n => update(i, { penthouses: n })} min={0} max={20} />
            </div>
            <label className="flex flex-col gap-1.5 max-w-[280px]">
              <FieldLabel>Planta baja</FieldLabel>
              <select value={t.groundFloor} onChange={e => update(i, { groundFloor: e.target.value as GroundFloorUse })} className={inputClass}>
                {GROUND_FLOOR_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </label>
          </div>
        ))}

        <button type="button"
          onClick={() => setTowers(ts => [...ts, { name: `Torre ${ts.length + 1}`, floors: ts[ts.length - 1]?.floors ?? 5, perFloor: ts[ts.length - 1]?.perFloor ?? 4, groundFloor: 'none', penthouses: 0 }])}
          disabled={towers.length >= 12}
          className="self-start min-h-[44px] px-4 rounded-xl border-[1.5px] border-dashed border-gray-300 text-sm font-semibold text-brand-700 hover:border-brand-500 disabled:opacity-50">
          + Agregar otra torre
        </button>

        <div className="flex flex-col gap-2">
          <FieldLabel>Cómo se numeran las unidades</FieldLabel>
          <Segmented label="Numeración" value={scheme} options={SCHEME_OPTIONS} onChange={setScheme} />
          {scheme === 'custom' && (
            <label className="flex flex-col gap-1.5 max-w-[320px] mt-1">
              <FieldLabel>Formato</FieldLabel>
              <input value={template} onChange={e => setTemplate(e.target.value)} className={`${inputClass} font-mono`} />
              <span className="text-xs text-gray-500">Usá {'{piso}'}, {'{letra}'} y {'{n}'}. Ej: {'{piso}-{n}'} → 5-2</span>
            </label>
          )}
          {towers.length > 1 && <p className="text-xs text-gray-500">Con más de una torre, cada código lleva la inicial de la torre adelante para no repetirse.</p>}
        </div>

        {dups.length > 0 && <ErrorNote>Hay códigos repetidos ({dups.slice(0, 5).join(', ')}). Cambiá la numeración o los nombres de las torres.</ErrorNote>}
        <ErrorNote>{error}</ErrorNote>

        <StepFooter
          summary={`${towers.length} torre${towers.length === 1 ? '' : 's'} · ${levels} niveles · ${total} unidades`}
          primary={{ label: 'Crear estructura y seguir', onClick: submit, disabled: dups.length > 0 || total === 0, busy, busyLabel: 'Creando...' }}
        />
      </section>

      <Elevation plan={plan} total={total} levels={levels} towers={towers.length} />
    </div>
  );
}

function Elevation({ plan, total, levels, towers }: { plan: PlannedBuilding[]; total: number; levels: number; towers: number }) {
  return (
    <section aria-label="Vista del edificio" className="flex-[3_1_480px] min-w-0 flex flex-col gap-4 p-5 rounded-2xl bg-white border border-gray-200 lg:sticky lg:top-6">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <h2 className="m-0 text-[15px] font-semibold text-gray-900">Así queda</h2>
        <span className="text-xs text-gray-500">Vista frontal</span>
      </div>
      <div className="flex gap-6 overflow-x-auto pb-2 items-end max-h-[620px] overflow-y-auto">
        {plan.map(b => (
          <div key={b.name} className="flex flex-col items-center gap-2 shrink-0">
            <div className="flex flex-col gap-1 p-2 rounded-lg bg-gray-50 border border-gray-200">
              {[...b.floors].reverse().map(f => (
                <div key={f.number} className="flex items-center gap-1">
                  <span className="w-7 text-[10px] font-semibold text-gray-500 text-right shrink-0">{f.role === 'pb' ? 'PB' : f.role === 'ph' ? 'PH' : f.number}</span>
                  {f.units.length > 0 ? f.units.map(u => (
                    <span key={u.code} className={`h-[28px] min-w-[46px] px-1.5 rounded text-[10px] font-semibold flex items-center justify-center whitespace-nowrap ${
                      f.role === 'ph' ? 'bg-gray-900 text-white' : 'bg-white border border-gray-300 text-gray-700'
                    }`}>{u.code}</span>
                  )) : (
                    <span className="h-[28px] px-3 min-w-[100px] flex-1 rounded text-[10px] font-semibold flex items-center justify-center bg-brand-200 text-brand-800">
                      {f.floorKindDescription ?? GROUND_FLOOR_OPTIONS.find(o => o.value === (f.floorKind === 'amenity' ? 'amenities' : f.floorKind === 'parking' ? 'cocheras' : 'locales'))?.label}
                    </span>
                  )}
                </div>
              ))}
            </div>
            <div className="h-1.5 w-full rounded bg-gray-300" aria-hidden />
            <span className="text-[13px] font-semibold text-gray-900">{b.name}</span>
            <span className="text-xs text-gray-500">{b.floors.reduce((s, f) => s + f.units.length, 0)} unidades</span>
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-0.5 p-3 rounded-xl bg-brand-50 border border-brand-100">
        <span className="text-sm font-semibold text-gray-900">{towers} torre{towers === 1 ? '' : 's'} · {levels} niveles · {total} unidades</span>
        <span className="text-xs text-gray-600">Antes eran {total} altas de unidad, una por una. Ahora es un clic.</span>
      </div>
    </section>
  );
}

function StructureSummary({ tree, onNext }: { tree: GuidedTree; onNext: () => void }) {
  const total = allUnits(tree).length;
  return (
    <div className="max-w-[900px] mx-auto px-4 sm:px-6 py-8 flex flex-col gap-6">
      <StepIntro eyebrow="Paso 1 de 4" title="La estructura ya está creada">
        Para sumar o quitar pisos y unidades, o cambiar códigos, usá la pantalla de edificios. Acá seguís con las tipologías y la planta tipo.
      </StepIntro>
      <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
        {tree.buildings.map(b => (
          <div key={b.id} className="p-4 rounded-xl bg-white border border-gray-200 flex flex-col gap-1">
            <span className="text-sm font-semibold text-gray-900">{b.name}</span>
            <span className="text-xs text-gray-500">{b.floors.length} niveles · {b.floors.reduce((s, f) => s + f.units.length, 0)} unidades</span>
          </div>
        ))}
      </div>
      <StepFooter
        summary={<span>{tree.buildings.length} torre{tree.buildings.length === 1 ? '' : 's'} · {total} unidades · <Link href="/admin/edificios" className="font-semibold text-brand-700 underline underline-offset-2">Cambiar estructura</Link></span>}
        primary={{ label: 'Seguir', onClick: onNext }}
      />
    </div>
  );
}

// ─── Paso 2 · Tipologías ───────────────────────────────────────────

interface Typology {
  code: string;
  name: string;
  bedrooms: number | null;
  totalArea: number | null;
  innerArea: number | null;
}

function nextTypologyCode(list: Typology[]): string {
  for (let i = 0; ; i++) {
    const c = positionLetter(i);
    if (!list.some(t => t.code === c)) return c;
  }
}

function TipologiasStep({ tree, reload, onBack, onNext }: { tree: GuidedTree; reload: () => Promise<void>; onBack: () => void; onNext: () => void }) {
  const { patch } = useGuidedApi();
  const toast = useToast();
  const towers = tree.buildings.filter(b => positionsOf(b) > 0);

  // Prefill: lo que ya tenga model_name "Tipología X" en las unidades; si no
  // hay nada, una tipología por posición de la primera torre.
  const initial = useMemo(() => {
    const found = new Map<string, Typology>();
    const assign: Record<string, string[]> = {};
    for (const b of towers) {
      const floors = typicalFloors(b);
      const n = positionsOf(b);
      assign[b.id] = Array.from({ length: n }, (_, p) => {
        for (const f of floors) {
          const u = [...f.units].sort(byCode)[p];
          const code = codeFromModel(u?.model_name ?? null);
          if (u && code) {
            if (!found.has(code)) {
              found.set(code, {
                code,
                name: u.type && u.type !== u.model_name && u.type !== 'Unidad' ? u.type : '',
                bedrooms: u.bedrooms || null,
                totalArea: u.total_area,
                innerArea: u.inner_area,
              });
            }
            return code;
          }
        }
        return '';
      });
    }
    if (found.size > 0) return { typologies: [...found.values()].sort((a, b) => a.code.localeCompare(b.code)), assign };
    const n = towers.reduce((m, b) => Math.max(m, positionsOf(b)), 0);
    const typologies = Array.from({ length: n }, (_, i) => ({ code: positionLetter(i), name: '', bedrooms: null, totalArea: null, innerArea: null }));
    for (const b of towers) assign[b.id] = Array.from({ length: positionsOf(b) }, (_, p) => positionLetter(p));
    return { typologies, assign };
  }, [towers]);

  const [typologies, setTypologies] = useState<Typology[]>(initial.typologies);
  const [assign, setAssign] = useState<Record<string, string[]>>(initial.assign);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const unitsPerTypology = useMemo(() => {
    const m = new Map<string, number>();
    for (const b of towers) {
      for (const f of typicalFloors(b)) {
        [...f.units].sort(byCode).forEach((_, p) => {
          const c = assign[b.id]?.[p];
          if (c) m.set(c, (m.get(c) ?? 0) + 1);
        });
      }
    }
    return m;
  }, [towers, assign]);
  const coveredUnits = [...unitsPerTypology.values()].reduce((s, n) => s + n, 0);
  const usedTypologies = typologies.filter(t => (unitsPerTypology.get(t.code) ?? 0) > 0).length;

  const updateTypology = (code: string, p: Partial<Typology>) => setTypologies(ts => ts.map(t => (t.code === code ? { ...t, ...p } : t)));
  const removeTypology = (code: string) => {
    setTypologies(ts => ts.filter(t => t.code !== code));
    setAssign(a => Object.fromEntries(Object.entries(a).map(([k, v]) => [k, v.map(c => (c === code ? '' : c))])));
  };

  const save = async () => {
    setError('');
    const byCodeMap = new Map(typologies.map(t => [t.code, t]));
    const units: Record<string, unknown>[] = [];
    for (const b of towers) {
      for (const f of typicalFloors(b)) {
        [...f.units].sort(byCode).forEach((u, p) => {
          const t = byCodeMap.get(assign[b.id]?.[p] ?? '');
          if (!t) return;
          const modelName = `Tipología ${t.code}`;
          const row: Record<string, unknown> = { id: u.id, modelName, type: t.name.trim() || modelName };
          if (t.bedrooms !== null) row.bedrooms = t.bedrooms;
          if (t.totalArea !== null) row.totalArea = t.totalArea;
          if (t.innerArea !== null) row.innerArea = t.innerArea;
          units.push(row);
        });
      }
    }
    if (units.length === 0) { onNext(); return; }
    setBusy(true);
    const res = await patch({ units });
    if (!res.ok) { setBusy(false); setError(res.error); return; }
    await reload();
    setBusy(false);
    toast(`${units.length} unidades actualizadas.`);
    onNext();
  };

  return (
    <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-8 flex flex-col gap-8">
      <StepIntro eyebrow="Paso 2 de 4" title="¿Qué unidades se repiten?">
        Cada posición del piso suele ser la misma unidad en todos los pisos. Decinos cuál es cuál y cargás superficies y planos una sola vez.
      </StepIntro>

      <div className="flex gap-8 flex-wrap items-start">
        <section aria-label="Posiciones" className="flex-[3_1_480px] min-w-0 flex flex-col gap-5">
          {towers.length === 0 && <p className="text-sm text-gray-600">No hay pisos tipo con unidades. Podés seguir con el próximo paso.</p>}
          {towers.map(b => {
            const floors = typicalFloors(b);
            return (
              <div key={b.id} className="flex flex-col gap-3 p-4 rounded-2xl bg-white border border-gray-200">
                <h2 className="m-0 text-sm font-semibold text-gray-900">Piso tipo · {b.name} <span className="font-normal text-gray-500">— {floors.length} piso{floors.length === 1 ? '' : 's'}</span></h2>
                <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(150px, 100%), 1fr))' }}>
                  {Array.from({ length: positionsOf(b) }, (_, p) => {
                    const sample = [...(floors[0]?.units ?? [])].sort(byCode)[p];
                    const value = assign[b.id]?.[p] ?? '';
                    return (
                      <label key={p} className={`flex flex-col gap-2 p-2.5 sm:p-3 rounded-xl border ${value ? 'border-brand-700 bg-brand-50' : 'border-dashed border-gray-300'}`}>
                        <span className="flex items-baseline justify-between gap-2">
                          <span className="text-[13px] font-semibold text-gray-900">Posición {positionLetter(p)}</span>
                          <span className="text-[11px] text-gray-500">{sample?.code ?? ''}…</span>
                        </span>
                        <select
                          value={value}
                          aria-label={`Tipología de la posición ${positionLetter(p)} en ${b.name}`}
                          onChange={e => setAssign(a => ({ ...a, [b.id]: (a[b.id] ?? []).map((c, j) => (j === p ? e.target.value : c)) }))}
                          className={inputClass}
                        >
                          <option value="">Sin tipología</option>
                          {typologies.map(t => <option key={t.code} value={t.code}>Tipología {t.code}{t.name ? ` · ${t.name}` : ''}</option>)}
                        </select>
                      </label>
                    );
                  })}
                </div>
              </div>
            );
          })}
          <p className="text-xs text-gray-500">¿Algún piso es distinto? Lo cambiás después en Unidades; no frena este paso.</p>
        </section>

        <section aria-label="Tipologías" className="flex-[2_1_360px] min-w-0 flex flex-col gap-3">
          <div className="flex items-baseline justify-between gap-3 flex-wrap">
            <h2 className="m-0 text-[15px] font-semibold text-gray-900">
              {typologies.length} tipología{typologies.length === 1 ? '' : 's'} <span className="font-normal text-gray-500">— completá lo que tengas a mano; nada es obligatorio acá</span>
            </h2>
            <button type="button"
              onClick={() => setTypologies(ts => [...ts, { code: nextTypologyCode(ts), name: '', bedrooms: null, totalArea: null, innerArea: null }])}
              className="min-h-[40px] px-3 text-[13px] font-semibold text-brand-700 hover:bg-brand-50 rounded-lg">
              + Tipología
            </button>
          </div>
          {typologies.map(t => (
            <div key={t.code} className="flex flex-col gap-3 p-4 rounded-xl bg-white border border-gray-200">
              <div className="flex items-center gap-x-3 gap-y-1 flex-wrap">
                <span className="w-9 h-9 rounded-lg bg-gray-900 text-white text-sm font-semibold flex items-center justify-center shrink-0">{t.code}</span>
                <input
                  aria-label={`Nombre de la tipología ${t.code}`}
                  value={t.name}
                  placeholder="Ej: 2 dormitorios"
                  onChange={e => updateTypology(t.code, { name: e.target.value })}
                  className={`${inputClass} flex-1 !w-auto min-w-0`}
                />
                <span className="order-last basis-full sm:basis-auto sm:order-none pl-12 sm:pl-0 text-xs text-gray-500 whitespace-nowrap">{unitsPerTypology.get(t.code) ?? 0} unidades</span>
                <button type="button" aria-label={`Quitar tipología ${t.code}`} onClick={() => removeTypology(t.code)}
                  className="w-10 h-10 shrink-0 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50">✕</button>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <NumberField label="Dormitorios" value={t.bedrooms} onChange={n => updateTypology(t.code, { bedrooms: n === null ? null : Math.floor(n) })} />
                <NumberField label="Sup. total" suffix="m²" value={t.totalArea} onChange={n => updateTypology(t.code, { totalArea: n })} />
                <NumberField label="Cubierta" suffix="m²" value={t.innerArea} onChange={n => updateTypology(t.code, { innerArea: n })} />
              </div>
            </div>
          ))}
        </section>
      </div>

      <ErrorNote>{error}</ErrorNote>
      <StepFooter
        back={{ label: 'Estructura', onClick: onBack }}
        summary={<>Esto completa la ficha de <b className="text-gray-900">{coveredUnits} unidades</b> con {usedTypologies} carga{usedTypologies === 1 ? '' : 's'}.</>}
        primary={{ label: 'Seguir con la planta', onClick: save, busy }}
      />
    </div>
  );
}

// ─── Paso 3 · Planta tipo ──────────────────────────────────────────

type Pt = { x: number; y: number };

function PlantaStep({ tree, reload, onBack, onNext }: { tree: GuidedTree; reload: () => Promise<void>; onBack: () => void; onNext: () => void }) {
  const { patch } = useGuidedApi();
  const toast = useToast();
  const towers = tree.buildings.filter(b => positionsOf(b) > 0);
  const hasPh = tree.buildings.some(b => phFloors(b).length > 0);

  const reference = towers.length > 0 ? typicalFloors(towers[0])[0] : undefined;
  const [planImage, setPlanImage] = useState(reference?.plan_image ?? '');
  const [selected, setSelected] = useState<Record<string, boolean>>(() => Object.fromEntries(towers.map(b => [b.id, true])));
  const [includePh, setIncludePh] = useState(false);
  const [points, setPoints] = useState<Record<string, Pt[]>>(() => {
    const units = [...(reference?.units ?? [])].sort(byCode);
    return Object.fromEntries(units.map((u, p) => [`pos-${p}`, u.polygon ?? []]));
  });
  const [mode, setMode] = useState<'rectangle' | 'point'>('rectangle');
  const [activeId, setActiveId] = useState<string | null>('pos-0');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const selectedTowers = towers.filter(b => selected[b.id]);
  const positions = selectedTowers.reduce((m, b) => Math.max(m, positionsOf(b)), 0);

  // Tipología por posición (de la primera torre seleccionada) para rotular.
  const typologyAt = (p: number): string | null => {
    const b = selectedTowers[0];
    const u = b ? [...(typicalFloors(b)[0]?.units ?? [])].sort(byCode)[p] : undefined;
    return codeFromModel(u?.model_name ?? null);
  };

  const shapes: PolygonShape[] = Array.from({ length: positions }, (_, p) => ({
    id: `pos-${p}`,
    label: positionLetter(p),
    points: points[`pos-${p}`] ?? [],
    color: SHAPE_PALETTE[p % SHAPE_PALETTE.length],
  }));
  const drawn = shapes.filter(s => s.points.length >= 3).length;
  const floorsAffected = selectedTowers.reduce((s, b) => s + typicalFloors(b).length, 0)
    + (includePh ? tree.buildings.reduce((s, b) => s + phFloors(b).length, 0) : 0);

  const advanceActive = (id: string) => {
    const p = Number(id.replace('pos-', ''));
    const next = shapes.find((s, i) => i > p && s.points.length < 3);
    if (next) setActiveId(next.id);
  };

  const apply = async () => {
    setError('');
    if (!planImage) { setError('Subí el plano del piso tipo para aplicarlo.'); return; }
    const floors: Record<string, unknown>[] = [];
    const units: Record<string, unknown>[] = [];
    for (const b of selectedTowers) {
      for (const f of typicalFloors(b)) {
        const sorted = [...f.units].sort(byCode);
        const setCodes = new Set<string>();
        const newDots: UnitDot[] = [];
        sorted.forEach((u, p) => {
          const pts = points[`pos-${p}`] ?? [];
          if (pts.length < 3) return;
          units.push({ id: u.id, polygon: pts });
          const c = centroid(pts);
          setCodes.add(u.code);
          const prev = (f.unit_dots ?? []).find(d => d.unitId === u.code);
          newDots.push({ unitId: u.code, x: c.x, y: c.y, color: prev?.color, style: prev?.style });
        });
        floors.push({ id: f.id, planImage, unitDots: [...(f.unit_dots ?? []).filter(d => !setCodes.has(d.unitId)), ...newDots] });
      }
    }
    if (includePh) for (const b of tree.buildings) for (const f of phFloors(b)) floors.push({ id: f.id, planImage });
    if (floors.length === 0) { setError('Elegí al menos una torre para aplicar la planta.'); return; }
    setBusy(true);
    const res = await patch({ floors, units });
    if (!res.ok) { setBusy(false); setError(res.error); return; }
    await reload();
    setBusy(false);
    toast(`Planta aplicada a ${floors.length} piso${floors.length === 1 ? '' : 's'}.`);
    onNext();
  };

  const activeIndex = activeId ? Number(activeId.replace('pos-', '')) : -1;
  const activeTypo = activeIndex >= 0 ? typologyAt(activeIndex) : null;

  return (
    <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-8 flex flex-col gap-8">
      <div className="flex gap-8 flex-wrap items-start">
        <section aria-label="Planta tipo" className="flex-[2_1_340px] min-w-0 flex flex-col gap-6">
          <StepIntro eyebrow="Paso 3 de 4" title="Marcá la planta tipo una vez">
            Subí el plano del piso tipo y dibujá cada posición. Lo aplicamos a todos los pisos iguales; así el comprador toca su unidad en el plano del sitio.
          </StepIntro>

          <ImageUploader value={planImage} onChange={setPlanImage} folder="floorplans" label="Plano del piso tipo" />

          {positions > 0 && (
            <div className="flex flex-col gap-1.5">
              <FieldLabel>Posiciones</FieldLabel>
              {shapes.map((s, p) => {
                const typo = typologyAt(p);
                const on = activeId === s.id;
                const done = s.points.length >= 3;
                return (
                  <button key={s.id} type="button" onClick={() => setActiveId(s.id)} aria-pressed={on}
                    className={`flex items-center gap-3 min-h-[48px] px-3 rounded-xl border text-left ${on ? 'border-[1.5px] border-brand-700 bg-brand-50' : 'border-gray-200 bg-white hover:border-gray-300'}`}>
                    <span className="w-6 h-6 rounded-md shrink-0" style={{ background: s.color }} aria-hidden />
                    <span className="flex-1 text-sm font-medium text-gray-900">Posición {s.label}{typo ? ` · Tipología ${typo}` : ''}</span>
                    <span className={`text-xs ${done ? 'text-brand-700 font-semibold' : 'text-gray-500'}`}>{done ? 'Dibujada' : 'Sin dibujar'}</span>
                  </button>
                );
              })}
            </div>
          )}

          <fieldset className="flex flex-col gap-2 border-0 p-0 m-0">
            <legend className="text-xs font-medium text-gray-700 mb-1">Aplicar a</legend>
            {towers.map(b => {
              const floors = typicalFloors(b);
              return (
                <label key={b.id} className="flex items-center gap-3 min-h-[44px] px-3 rounded-xl bg-white border border-gray-200 cursor-pointer">
                  <input type="checkbox" checked={!!selected[b.id]} onChange={e => setSelected(s => ({ ...s, [b.id]: e.target.checked }))} className="w-4 h-4 accent-brand-700" />
                  <span className="text-sm text-gray-900">{b.name} · pisos {floors[0]?.number ?? 1} a {floors[floors.length - 1]?.number ?? 1}</span>
                </label>
              );
            })}
            {hasPh && (
              <label className="flex items-center gap-3 min-h-[44px] px-3 rounded-xl bg-white border border-gray-200 cursor-pointer">
                <input type="checkbox" checked={includePh} onChange={e => setIncludePh(e.target.checked)} className="w-4 h-4 accent-brand-700" />
                <span className="text-sm text-gray-900">Penthouses <span className="text-gray-500">(tienen otra planta: solo se les asigna la imagen)</span></span>
              </label>
            )}
          </fieldset>

          <button type="button" onClick={onNext} className="self-start min-h-[44px] text-sm font-medium text-gray-600 hover:text-gray-900 underline underline-offset-2">
            Saltear por ahora — lo hago después
          </button>
        </section>

        <section aria-label="Dibujo" className="flex-[3_1_520px] min-w-0 flex flex-col gap-3 p-4 rounded-2xl bg-white border border-gray-200">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <span className="text-sm text-gray-700">
              {activeIndex >= 0 && activeIndex < positions
                ? <>Dibujando <b className="text-gray-900">Posición {positionLetter(activeIndex)}{activeTypo ? ` · Tipología ${activeTypo}` : ''}</b></>
                : 'Elegí una posición para dibujar'}
            </span>
            <div className="flex items-center gap-2 flex-wrap">
              <Segmented label="Modo de dibujo" value={mode} onChange={setMode} options={[{ value: 'rectangle', label: 'Rectángulo' }, { value: 'point', label: 'Forma libre' }]} />
              {activeId && (points[activeId]?.length ?? 0) > 0 && (
                <button type="button" onClick={() => setPoints(prev => ({ ...prev, [activeId]: [] }))}
                  className="min-h-[36px] px-3 rounded-lg text-[13px] font-medium text-gray-700 hover:bg-gray-100">
                  Borrar forma
                </button>
              )}
            </div>
          </div>
          {planImage ? (
            <PolygonCanvas
              imageUrl={planImage}
              shapes={shapes}
              activeId={activeId}
              mode={mode}
              onPointsChange={(id, pts) => setPoints(prev => ({ ...prev, [id]: pts }))}
              onComplete={advanceActive}
            />
          ) : (
            <div className="aspect-[4/3] rounded-xl border-[1.5px] border-dashed border-gray-300 bg-gray-50 flex items-center justify-center text-sm text-gray-500 text-center px-6">
              Subí el plano del piso tipo para empezar a marcar las posiciones.
            </div>
          )}
        </section>
      </div>

      <ErrorNote>{error}</ErrorNote>
      <StepFooter
        back={{ label: 'Tipologías', onClick: onBack }}
        summary={<>{drawn} de {positions} posiciones · se aplica a <b className="text-gray-900">{floorsAffected} pisos</b> en una sola vez</>}
        primary={{ label: 'Aplicar y terminar', onClick: apply, disabled: !planImage || selectedTowers.length + (includePh ? 1 : 0) === 0, busy, busyLabel: 'Aplicando...' }}
      />
    </div>
  );
}

// ─── Paso 4 · Listo ────────────────────────────────────────────────

function ListoStep({ project, tree, onBackToStart }: Pick<FlowProps, 'project' | 'tree'> & { onBackToStart: () => void }) {
  const units = allUnits(tree);
  const typologies = new Set(units.map(u => u.model_name).filter(Boolean)).size;
  const plans = allFloors(tree).filter(f => f.plan_image && f.units.length > 0).length;
  const n = units.length;

  if (project.saleMode === 'showcase') {
    return (
      <ListoScreen
        project={project}
        eyebrow="Paso 4 de 4"
        title="Listo para mostrarse."
        text={`${n} unidades${typologies ? ` en ${typologies} tipologías` : ''}${plans ? ', con su planta interactiva' : ''}. Sin precios ni estados: acá lo que vende es cómo contás el proyecto.`}
        stats={[{ value: String(n), label: 'unidades' }, { value: String(typologies), label: 'tipologías' }, { value: String(plans), label: 'plantas marcadas' }]}
        optionalTitle="Lo que hace lucir un proyecto de estudio"
        optional={[
          { label: 'Relato', text: 'La idea, el lugar, las decisiones.', href: '/admin/sitio', tag: 'Recomendado' },
          { label: 'Equipo', text: 'Se publica en el portfolio de cada persona.', href: '/admin/sitio', tag: 'Recomendado' },
          { label: 'Galería y renders', text: 'Soltalos juntos; se ordenan solos.', href: '/admin/proyecto', tag: 'Recomendado' },
          { label: 'Proceso y antes / después', text: 'Bocetos, maquetas, obra.', href: '/admin/proyecto', tag: 'Suma' },
          { label: 'Recorrido 360° y BIM', text: 'Para recorrerlo sin visitarlo.', href: '/admin/proyecto/recorrido', tag: 'Suma' },
          { label: 'Ficha académica', text: 'Si es un proyecto de facultad o concurso.', href: '/admin/proyecto', tag: 'Opcional' },
        ]}
        hiddenInShowcase="Precios · Estado de venta · Formulario de contacto y leads · Calculadora"
        aside={<PreviewCard project={project} meta={`Vivienda colectiva · ${n} unidades${project.location ? ` · ${project.location}` : ''}${project.academicYear ? ` · ${project.academicYear}` : ''}`} />}
        onBackToStart={onBackToStart}
      />
    );
  }

  const priced = units.length > 0 && units.every(u => u.price !== null);
  return (
    <ListoScreen
      project={project}
      eyebrow="Paso 4 de 4"
      title="La estructura está lista."
      text={`${project.name} ya tiene sus ${n} unidades con datos${plans ? ', planos y planta interactiva' : ''}. Para publicar faltan dos cosas; el resto suma, pero no bloquea.`}
      stats={[{ value: String(n), label: 'unidades' }, { value: String(typologies), label: 'tipologías' }, { value: String(plans), label: 'plantas marcadas' }]}
      required={[{ key: 'precios', title: 'Precios y estados', text: priced ? 'Listos' : 'Pegalos desde tu Excel en la tabla', href: '/admin/inventory', done: priced }]}
      optional={[
        { label: 'Soltá todos los medios', text: 'Renders, fotos y 360°: se ordenan solos.', href: '/admin/proyecto' },
        { label: 'Relato', text: 'Un texto corto y tres atributos.', href: '/admin/sitio' },
        { label: 'Entorno', text: 'Ubicación y amenidades en una pantalla.', href: '/admin/proyecto/ubicacion' },
        { label: 'Recorrido 360°', text: 'Escenas de espacios comunes.', href: '/admin/proyecto/recorrido' },
        { label: 'Avance de obra', text: 'Primera entrada de la bitácora.', href: '/admin/proyecto/avance' },
        { label: 'Equipo', text: 'Quién hizo el proyecto.', href: '/admin/sitio' },
      ]}
      onBackToStart={onBackToStart}
    />
  );
}
