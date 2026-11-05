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
  GuidedHeader, SplitLayout, StepIntro, StepFooter, NumberStepper, Segmented, FieldLabel, ErrorNote,
  inputClass, allUnits, allFloors, useGuidedApi, useCanvasUndo, ToolbarUndo,
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

/** Colores de cada tipología (chip + caja) — mismos tonos que el diseño (A verde, B azul, C arena…). */
const TYPO_COLORS: [string, string][] = [
  ['#E4ECE7', '#2C4136'],
  ['#E6E9F0', '#2F3A52'],
  ['#F3E7DA', '#6B4510'],
  ['#EFE4EC', '#5A2F4E'],
  ['#E3EEF0', '#1F4A52'],
  ['#ECE9DC', '#4F4A22'],
];
function typoColor(code: string | null | undefined): [string, string] {
  if (!code) return ['#F4F2EE', '#6B6A65'];
  if (code === 'P') return ['#17191A', '#FFFFFF'];
  const i = Math.max(0, code.charCodeAt(0) - 65);
  return TYPO_COLORS[i % TYPO_COLORS.length];
}
/** Relleno semitransparente para las formas dibujadas sobre el plano. */
const SHAPE_FILLS = ['#6E8577', '#7C88A6', '#B58E5E', '#9A6F8E', '#5E8E96', '#8C8656'];

function Chevron() {
  return <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#6B6A65" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>;
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
  // Piso tocado en la vista frontal para darle otra cantidad de unidades.
  const [picked, setPicked] = useState<{ tower: number; floor: number } | null>(null);

  const plan = useMemo(() => planEdificio(towers, scheme, scheme === 'custom' ? template : undefined), [towers, scheme, template]);
  const total = countUnits(plan);
  const levels = plan.reduce((s, b) => s + b.floors.length, 0);
  const dups = duplicateCodes(plan);

  // Al bajar los pisos tipo se descartan los cambios de pisos que dejaron de
  // existir (si no, reaparecerían en silencio al volver a subirlos).
  const update = (i: number, patch: Partial<TowerInput>) => setTowers(ts => ts.map((t, j) => {
    if (j !== i) return t;
    const next = { ...t, ...patch };
    if (patch.floors !== undefined && next.floorOverrides) {
      const kept = Object.fromEntries(Object.entries(next.floorOverrides).filter(([f]) => Number(f) <= next.floors));
      next.floorOverrides = Object.keys(kept).length ? kept : undefined;
    }
    return next;
  }));
  const removeTower = (i: number) => {
    setTowers(ts => ts.filter((_, j) => j !== i));
    // El piso elegido apunta a una torre por posición: se ajusta o se cierra.
    setPicked(p => (!p ? p : p.tower === i ? null : p.tower > i ? { ...p, tower: p.tower - 1 } : p));
  };
  const setFloorUnits = (ti: number, floor: number, n: number) => setTowers(ts => ts.map((t, j) => {
    if (j !== ti) return t;
    const next = { ...(t.floorOverrides ?? {}) };
    if (n === t.perFloor) delete next[floor]; else next[floor] = n;
    return { ...t, floorOverrides: Object.keys(next).length ? next : undefined };
  }));
  const pickedTower = picked ? towers[picked.tower] : undefined;
  const pickedCount = picked && pickedTower ? (pickedTower.floorOverrides?.[picked.floor] ?? pickedTower.perFloor) : 0;
  const distinctFloors = towers.reduce((s, t) => s + Object.keys(t.floorOverrides ?? {}).filter(k => Number(k) <= t.floors).length, 0);

  const submit = async () => {
    setError('');
    setBusy(true);
    const res = await create<GuidedTree>({ kind: 'edificio', towers, scheme, template: scheme === 'custom' ? template : undefined });
    setBusy(false);
    if (!res.ok) { setError(res.error); return; }
    onCreated({ buildings: res.data.buildings });
  };

  const panel = (
    <>
      <StepIntro eyebrow="Paso 1 de 4" title="¿Cómo es el edificio?">
        Contanos cuántas torres, pisos y unidades por piso. Armamos toda la estructura de una vez; después ajustás lo que sea distinto.
      </StepIntro>

      {towers.map((t, i) => (
        <div key={i} className="relative flex flex-col gap-3.5 p-4 rounded-[14px] border border-gray-200 bg-white">
          <label className="flex flex-col gap-1.5 min-w-0">
            <span className="flex items-center justify-between">
              <FieldLabel>Nombre</FieldLabel>
              {towers.length > 1 && (
                <button type="button" onClick={() => removeTower(i)}
                  className="min-h-[28px] px-1 text-xs font-medium text-gray-500 hover:text-red-600">
                  Quitar torre
                </button>
              )}
            </span>
            <input value={t.name} onChange={e => update(i, { name: e.target.value })} className={`${inputClass} !text-[15px] font-semibold`} />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <NumberStepper label="Pisos tipo" value={t.floors} onChange={n => update(i, { floors: n })} min={1} max={200} />
            <NumberStepper label="Unidades por piso" value={t.perFloor} onChange={n => update(i, { perFloor: n })} min={1} max={60} />
          </div>
          <div className="flex gap-2 flex-wrap">
            <PillSelect
              on={t.groundFloor !== 'none'}
              prefix={t.groundFloor !== 'none' ? 'Planta baja:' : ''}
              label={`Planta baja de ${t.name}`}
              value={t.groundFloor}
              onChange={v => update(i, { groundFloor: v as GroundFloorUse })}
              options={GROUND_FLOOR_OPTIONS.map(o => ({ value: o.value, label: o.label }))}
            />
            <PillSelect
              on={t.penthouses > 0}
              prefix={t.penthouses > 0 ? 'Último piso distinto:' : ''}
              label={`Último piso distinto de ${t.name}`}
              value={String(t.penthouses)}
              onChange={v => update(i, { penthouses: Number(v) })}
              options={[{ value: '0', label: 'Sin último piso distinto' }, ...Array.from({ length: 8 }, (_, k) => ({ value: String(k + 1), label: `${k + 1} penthouse${k === 0 ? '' : 's'}` }))]}
            />
          </div>
        </div>
      ))}

      <button type="button"
        onClick={() => setTowers(ts => [...ts, { name: `Torre ${ts.length + 1}`, floors: ts[ts.length - 1]?.floors ?? 5, perFloor: ts[ts.length - 1]?.perFloor ?? 4, groundFloor: 'none', penthouses: 0 }])}
        disabled={towers.length >= 12}
        className="self-start min-h-[40px] px-1 text-[13px] font-semibold text-brand-700 hover:text-gray-900 disabled:opacity-50">
        + Agregar otra torre
      </button>

      <div className="flex flex-col gap-2">
        <FieldLabel>Cómo se numeran las unidades</FieldLabel>
        <Segmented label="Numeración" value={scheme} options={SCHEME_OPTIONS} onChange={setScheme} />
        {scheme === 'custom' && (
          <label className="flex flex-col gap-1.5 mt-1">
            <FieldLabel>Formato</FieldLabel>
            <input value={template} onChange={e => setTemplate(e.target.value)} className={`${inputClass} font-mono`} />
            <span className="text-xs text-gray-500">Usá {'{piso}'}, {'{letra}'} y {'{n}'}. Ej: {'{piso}-{n}'} → 5-2</span>
          </label>
        )}
        {towers.length > 1 && <p className="m-0 text-xs text-gray-500 leading-relaxed">Con más de una torre, cada código lleva la inicial de la torre adelante para no repetirse.</p>}
      </div>
    </>
  );

  return (
    <SplitLayout panel={panel} panelLabel="Estructura" mainLabel="Vista del edificio">
      <Elevation plan={plan} hint="— tocá un piso para cambiar sus unidades"
        selected={picked ? { building: picked.tower, floor: picked.floor } : null}
        onFloorClick={(tower, floor) => setPicked(p => (p && p.tower === tower && p.floor === floor ? null : { tower, floor }))} />
      {picked && pickedTower && picked.floor <= pickedTower.floors && (
        <div className="flex items-center gap-4 flex-wrap p-4 rounded-[14px] bg-white border-[1.5px] border-brand-700">
          <div className="flex-1 min-w-[180px] flex flex-col gap-0.5">
            <span className="text-sm font-semibold text-gray-900">Piso {picked.floor} · {pickedTower.name}</span>
            <span className="text-xs text-gray-500">{pickedCount === pickedTower.perFloor ? 'Igual que el piso tipo.' : `Distinto del piso tipo (${pickedTower.perFloor}).`}</span>
          </div>
          <div className="w-[170px]">
            <NumberStepper label={`Unidades del piso ${picked.floor}`} value={pickedCount} min={1} max={60} onChange={n => setFloorUnits(picked.tower, picked.floor, n)} />
          </div>
          {pickedCount !== pickedTower.perFloor && (
            <button type="button" onClick={() => setFloorUnits(picked.tower, picked.floor, pickedTower.perFloor)}
              className="min-h-[40px] px-1 text-[13px] font-semibold text-brand-700 underline underline-offset-2">Volver al piso tipo</button>
          )}
          <button type="button" onClick={() => setPicked(null)} className="min-h-[40px] px-3 rounded-[10px] border border-gray-300 text-[13px] font-medium text-gray-900">Listo</button>
        </div>
      )}
      {dups.length > 0 && <ErrorNote>Hay códigos repetidos ({dups.slice(0, 5).join(', ')}). Cambiá la numeración o los nombres de las torres.</ErrorNote>}
      <ErrorNote>{error}</ErrorNote>
      <StepFooter
        title={`${towers.length} torre${towers.length === 1 ? '' : 's'} · ${levels} niveles · ${total} unidades`}
        summary={distinctFloors > 0
          ? `${distinctFloors} piso${distinctFloors === 1 ? '' : 's'} distinto${distinctFloors === 1 ? '' : 's'} del tipo. Antes eran ${total} altas de unidad, una por una.`
          : `Antes eran ${total} altas de unidad, una por una. Ahora es un clic.`}
        primary={{ label: 'Crear estructura y seguir', onClick: submit, disabled: dups.length > 0 || total === 0, busy, busyLabel: 'Creando...' }}
      />
    </SplitLayout>
  );
}

/** Pill verde del diseño ("✓ Planta baja: Amenities") que es un select editable. */
function PillSelect({ on, prefix, label, value, onChange, options }: {
  on: boolean; prefix: string; label: string; value: string;
  onChange: (v: string) => void; options: { value: string; label: string }[];
}) {
  return (
    <label className={`relative inline-flex items-center gap-1 min-h-[36px] pl-2.5 pr-7 rounded-full text-xs font-semibold cursor-pointer ${
      on ? 'bg-brand-100 text-brand-800' : 'border border-dashed border-gray-300 text-gray-600 bg-white'
    }`}>
      <span aria-hidden>{on ? '✓' : '+'}</span>
      {prefix && <span>{prefix}</span>}
      <select aria-label={label} value={value} onChange={e => onChange(e.target.value)}
        style={{ fieldSizing: 'content' } as React.CSSProperties}
        className="appearance-none bg-transparent font-semibold outline-none cursor-pointer max-w-[200px] truncate min-h-[36px]">
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <span className="absolute right-2.5 pointer-events-none"><Chevron /></span>
    </label>
  );
}

const CELL_W = 50;
const CELL_GAP = 4;

function groundLabel(f: PlannedBuilding['floors'][number]): string {
  if (f.floorKindDescription) return f.floorKindDescription;
  const key = f.floorKind === 'amenity' ? 'amenities' : f.floorKind === 'parking' ? 'cocheras' : 'locales';
  return GROUND_FLOOR_OPTIONS.find(o => o.value === key)?.label ?? '';
}

function Elevation({ plan, title = 'Así queda', hint = '— los códigos son los que se van a crear', onFloorClick, selected }: {
  plan: PlannedBuilding[];
  title?: string;
  hint?: string;
  /** Si está, los pisos tipo se pueden tocar (índice de torre, número de piso). */
  onFloorClick?: (building: number, floor: number) => void;
  selected?: { building: number; floor: number } | null;
}) {
  return (
    <>
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <h2 className="m-0 text-[15px] font-semibold text-gray-900">{title} <span className="font-normal text-gray-500">{hint}</span></h2>
        <span className="text-xs text-gray-500">Vista frontal</span>
      </div>
      <div className="flex-1 min-h-[360px] md:min-h-[520px] flex gap-10 items-end justify-center flex-wrap p-4 sm:p-6 rounded-[18px] bg-white border border-gray-200 overflow-x-auto">
        {plan.map((b, bi) => {
          const per = b.floors.reduce((m, f) => Math.max(m, f.role === 'typical' ? f.units.length : 0), 0) || 1;
          const rowW = per * CELL_W + (per - 1) * CELL_GAP;
          const units = b.floors.reduce((s, f) => s + f.units.length, 0);
          return (
            <div key={b.name} className="flex flex-col items-center gap-2.5 max-w-full">
              <div className="flex flex-col gap-1 p-2 rounded-t-md bg-gray-100 border border-b-0 border-[#E0DCD3] max-w-full overflow-x-auto">
                {[...b.floors].reverse().map(f => {
                  const clickable = !!onFloorClick && f.role === 'typical';
                  const isSel = !!selected && selected.building === bi && selected.floor === f.number;
                  const Row = clickable ? 'button' : 'div';
                  return (
                  <Row key={f.number} {...(clickable ? { type: 'button' as const, onClick: () => onFloorClick!(bi, f.number), 'aria-pressed': isSel, 'aria-label': `Piso ${f.number} de ${b.name}: ${f.units.length} unidades` } : {})}
                    className={`flex items-center gap-1 rounded-md ${clickable ? 'cursor-pointer hover:outline hover:outline-1 hover:outline-gray-400 outline-offset-2' : ''} ${isSel ? '!outline !outline-2 !outline-brand-700' : ''}`}>
                    <span className="w-[22px] shrink-0 text-[10px] text-gray-500 text-right">{f.role === 'pb' ? 'PB' : f.role === 'ph' ? 'PH' : f.number}</span>
                    <div className="flex gap-1 shrink-0" style={{ width: rowW }}>
                      {f.units.length > 0 ? f.units.map(u => (
                        <span key={u.code}
                          className={`h-[30px] rounded text-[10px] font-semibold flex items-center justify-center whitespace-nowrap overflow-hidden px-0.5 ${
                            f.role === 'ph' ? 'flex-1 bg-gray-900 text-white' : f.role === 'pb' ? 'flex-1 bg-white border border-gray-300 text-gray-700' : 'bg-white border border-gray-300 text-gray-700'
                          }`}
                          style={f.role === 'typical' ? { width: CELL_W } : undefined}>
                          {u.code}
                        </span>
                      )) : (
                        <span className="flex-1 h-[30px] rounded text-[10px] font-semibold flex items-center justify-center bg-brand-200 text-brand-800 truncate px-1">
                          {groundLabel(f)}
                        </span>
                      )}
                    </div>
                  </Row>
                  );
                })}
              </div>
              <div className="h-2 w-full rounded-sm bg-gray-800" aria-hidden />
              <span className="text-[13px] font-semibold text-gray-900">{b.name}</span>
              <span className="-mt-2 text-xs text-gray-500">{units} unidades</span>
            </div>
          );
        })}
      </div>
    </>
  );
}

/** El árbol ya creado, en la forma que espera Elevation. */
function planFromTree(tree: GuidedTree): PlannedBuilding[] {
  return tree.buildings.map(b => ({
    name: b.name,
    floors: [...b.floors].sort((a, c) => a.number - c.number).map(f => ({
      number: f.number,
      label: f.label,
      floorKind: f.floor_kind,
      floorKindDescription: f.floor_kind_description,
      role: f.label === 'Penthouse' ? 'ph' as const : f.number === 0 ? 'pb' as const : 'typical' as const,
      units: [...f.units].sort(byCode).map(u => ({ code: u.code, type: u.type, position: null })),
    })),
  }));
}

function StructureSummary({ tree, onNext }: { tree: GuidedTree; onNext: () => void }) {
  const total = allUnits(tree).length;
  const levels = allFloors(tree).length;
  const plan = useMemo(() => planFromTree(tree), [tree]);
  return (
    <SplitLayout
      panelLabel="Estructura"
      mainLabel="Vista del edificio"
      panel={
        <>
          <StepIntro eyebrow="Paso 1 de 4" title="La estructura ya está creada">
            Para sumar o quitar pisos y unidades, o cambiar códigos, usá la pantalla de edificios. Acá seguís con las tipologías y la planta tipo.
          </StepIntro>
          <div className="flex flex-col gap-2">
            {tree.buildings.map(b => (
              <div key={b.id} className="flex items-center justify-between gap-3 min-h-[52px] px-4 rounded-[10px] bg-white border border-gray-200">
                <span className="text-sm font-semibold text-gray-900">{b.name}</span>
                <span className="text-xs text-gray-500">{b.floors.length} niveles · {b.floors.reduce((s, f) => s + f.units.length, 0)} unidades</span>
              </div>
            ))}
          </div>
          <Link href="/admin/edificios" className="self-start min-h-[40px] flex items-center text-[13px] font-semibold text-brand-700 underline underline-offset-2">
            Cambiar estructura
          </Link>
        </>
      }
    >
      <Elevation plan={plan} hint="— la estructura creada" />
      <StepFooter
        title={`${tree.buildings.length} torre${tree.buildings.length === 1 ? '' : 's'} · ${levels} niveles · ${total} unidades`}
        summary="Ya está creada. Seguí con las tipologías."
        primary={{ label: 'Seguir', onClick: onNext }}
      />
    </SplitLayout>
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
    // "P" queda reservada para Penthouse.
    if (c !== 'P' && !list.some(t => t.code === c)) return c;
  }
}

function TipologiasStep({ tree, reload, onBack, onNext }: { tree: GuidedTree; reload: () => Promise<void>; onBack: () => void; onNext: () => void }) {
  const { patch } = useGuidedApi();
  const toast = useToast();
  const towers = useMemo(() => tree.buildings.filter(b => positionsOf(b) > 0), [tree.buildings]);
  // Penthouses: unidades del último piso distinto, con su propia tipología "P".
  const phUnits = useMemo(
    () => tree.buildings.flatMap(b => phFloors(b).flatMap(f => [...f.units].sort(byCode).map(u => ({ u, building: b.name })))),
    [tree.buildings],
  );

  // Prefill: lo que ya tenga model_name "Tipología X" en las unidades; si no
  // hay nada, una tipología por posición de la primera torre (+ P si hay PH).
  const initial = useMemo(() => {
    const found = new Map<string, Typology>();
    const assign: Record<string, string[]> = {};
    const phAssign: Record<string, string> = {};
    for (const { u } of phUnits) {
      const code = codeFromModel(u.model_name);
      phAssign[u.id] = code ?? 'P';
      if (code && !found.has(code)) {
        found.set(code, { code, name: u.type && u.type !== u.model_name ? u.type : 'Penthouse', bedrooms: u.bedrooms || null, totalArea: u.total_area, innerArea: u.inner_area });
      }
    }
    const withPh = (list: Typology[]) =>
      phUnits.length > 0 && !list.some(t => t.code === 'P')
        ? [...list, { code: 'P', name: 'Penthouse', bedrooms: null, totalArea: null, innerArea: null }]
        : list;
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
    const sortTypos = (list: Typology[]) => [...list].sort((a, b) => (a.code === 'P' ? 1 : b.code === 'P' ? -1 : a.code.localeCompare(b.code)));
    if ([...found.keys()].some(c => c !== 'P') || Object.values(assign).some(v => v.some(Boolean))) {
      return { typologies: sortTypos(withPh([...found.values()])), assign, phAssign };
    }
    const n = towers.reduce((m, b) => Math.max(m, positionsOf(b)), 0);
    const base: Typology[] = [];
    for (let i = 0; base.length < n; i++) {
      const c = positionLetter(i);
      if (c !== 'P') base.push({ code: c, name: '', bedrooms: null, totalArea: null, innerArea: null });
    }
    for (const b of towers) assign[b.id] = Array.from({ length: positionsOf(b) }, (_, p) => base[p]?.code ?? '');
    return { typologies: sortTypos(withPh([...base, ...found.values()].filter((t, i, arr) => arr.findIndex(x => x.code === t.code) === i))), assign, phAssign };
  }, [towers, phUnits]);

  const [typologies, setTypologies] = useState<Typology[]>(initial.typologies);
  const [assign, setAssign] = useState<Record<string, string[]>>(initial.assign);
  const [phAssign, setPhAssign] = useState<Record<string, string>>(initial.phAssign);
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
    for (const { u } of phUnits) {
      const c = phAssign[u.id];
      if (c) m.set(c, (m.get(c) ?? 0) + 1);
    }
    return m;
  }, [towers, assign, phUnits, phAssign]);
  const coveredUnits = [...unitsPerTypology.values()].reduce((s, n) => s + n, 0);
  const usedTypologies = typologies.filter(t => (unitsPerTypology.get(t.code) ?? 0) > 0).length;

  const updateTypology = (code: string, p: Partial<Typology>) => setTypologies(ts => ts.map(t => (t.code === code ? { ...t, ...p } : t)));
  const removeTypology = (code: string) => {
    setTypologies(ts => ts.filter(t => t.code !== code));
    setAssign(a => Object.fromEntries(Object.entries(a).map(([k, v]) => [k, v.map(c => (c === code ? '' : c))])));
    setPhAssign(a => Object.fromEntries(Object.entries(a).map(([k, c]) => [k, c === code ? '' : c])));
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
    for (const { u } of phUnits) {
      const t = byCodeMap.get(phAssign[u.id] ?? '');
      if (!t) continue;
      const modelName = `Tipología ${t.code}`;
      const row: Record<string, unknown> = { id: u.id, modelName, type: t.name.trim() || modelName };
      if (t.bedrooms !== null) row.bedrooms = t.bedrooms;
      if (t.totalArea !== null) row.totalArea = t.totalArea;
      if (t.innerArea !== null) row.innerArea = t.innerArea;
      units.push(row);
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

  const typoName = (code: string) => typologies.find(t => t.code === code)?.name || (code ? `Tipología ${code}` : 'Sin tipología');

  const panel = (
    <>
      <StepIntro eyebrow="Paso 2 de 4" title="¿Qué unidades se repiten?">
        Cada posición del piso suele ser la misma unidad en todos los pisos. Decinos cuál es cuál y cargás superficies y planos una sola vez.
      </StepIntro>
      {towers.length === 0 && <p className="m-0 text-sm text-gray-600">No hay pisos tipo con unidades. Podés seguir con el próximo paso.</p>}
      {towers.map(b => {
        const floors = typicalFloors(b);
        const n = positionsOf(b);
        const firstSorted = [...(floors[0]?.units ?? [])].sort(byCode);
        const lastSorted = [...(floors[floors.length - 1]?.units ?? [])].sort(byCode);
        return (
          <div key={b.id} className="flex flex-col gap-3">
            <div className="flex flex-col gap-3 p-4 rounded-[14px] border border-gray-200 bg-white">
              <span className="text-xs font-semibold text-gray-700">Piso tipo · {b.name} <span className="font-normal text-gray-500">— {floors.length} piso{floors.length === 1 ? '' : 's'}</span></span>
              <div className="grid gap-1.5 p-2 border-[3px] border-gray-800 rounded" style={{ gridTemplateColumns: `repeat(${n <= 4 ? Math.min(2, n) : 3}, minmax(0, 1fr))` }}>
                {Array.from({ length: n }, (_, p) => {
                  const code = assign[b.id]?.[p] ?? '';
                  const [bg, fg] = typoColor(code);
                  return (
                    <span key={p} className="min-h-[72px] sm:min-h-[84px] rounded flex flex-col items-center justify-center gap-0.5" style={{ background: bg, color: fg }}>
                      <span className="text-[11px] font-semibold">{positionLetter(p)}</span>
                      <span className="font-display text-[22px] font-semibold">{code || '—'}</span>
                    </span>
                  );
                })}
              </div>
            </div>
            <div className="flex flex-col gap-2">
              {Array.from({ length: n }, (_, p) => {
                const value = assign[b.id]?.[p] ?? '';
                const [bg, fg] = typoColor(value);
                const first = firstSorted[p]?.code;
                const last = lastSorted[p]?.code;
                return (
                  <div key={p} className="flex items-center gap-3 min-h-[48px] px-3 py-1.5 rounded-[10px] border border-gray-200 bg-white">
                    <span className="shrink-0 whitespace-nowrap text-[13px] font-semibold text-gray-900">Posición {positionLetter(p)}</span>
                    <span className="flex-1 min-w-0 text-xs text-gray-500 truncate">{first ? `${first}${last && last !== first ? `…${last}` : ''}` : ''}</span>
                    <label className="relative shrink-0 flex items-center gap-2 min-h-[36px] pl-2.5 pr-7 rounded-lg border border-gray-300 bg-white text-[13px] font-semibold text-gray-900 cursor-pointer max-w-[60%]">
                      <span aria-hidden className="w-[22px] h-[22px] shrink-0 rounded-[5px] text-[11px] flex items-center justify-center" style={{ background: bg, color: fg }}>{value || '–'}</span>
                      <span className="truncate">{typoName(value)}</span>
                      <select
                        value={value}
                        aria-label={`Tipología de la posición ${positionLetter(p)} en ${b.name}`}
                        onChange={e => setAssign(a => ({ ...a, [b.id]: (a[b.id] ?? []).map((c, j) => (j === p ? e.target.value : c)) }))}
                        className="absolute inset-0 opacity-0 cursor-pointer"
                      >
                        <option value="">Sin tipología</option>
                        {typologies.map(t => <option key={t.code} value={t.code}>{t.code} · {t.name || `Tipología ${t.code}`}</option>)}
                      </select>
                      <span className="absolute right-2.5 pointer-events-none"><Chevron /></span>
                    </label>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
      {phUnits.length > 0 && (
        <div className="flex flex-col gap-2">
          <span className="text-xs font-semibold text-gray-700">Penthouses <span className="font-normal text-gray-500">— último piso distinto</span></span>
          {phUnits.map(({ u, building }) => {
            const value = phAssign[u.id] ?? '';
            const [bg, fg] = typoColor(value);
            return (
              <div key={u.id} className="flex items-center gap-3 min-h-[48px] px-3 py-1.5 rounded-[10px] border border-gray-200 bg-white">
                <span className="shrink-0 whitespace-nowrap text-[13px] font-semibold text-gray-900">{u.code}</span>
                <span className="flex-1 min-w-0 text-xs text-gray-500 truncate">{building}</span>
                <label className="relative shrink-0 flex items-center gap-2 min-h-[36px] pl-2.5 pr-7 rounded-lg border border-gray-300 bg-white text-[13px] font-semibold text-gray-900 cursor-pointer max-w-[60%]">
                  <span aria-hidden className="w-[22px] h-[22px] shrink-0 rounded-[5px] text-[11px] flex items-center justify-center" style={{ background: bg, color: fg }}>{value || '–'}</span>
                  <span className="truncate">{typoName(value)}</span>
                  <select value={value} aria-label={`Tipología de ${u.code}`}
                    onChange={e => setPhAssign(a => ({ ...a, [u.id]: e.target.value }))}
                    className="absolute inset-0 opacity-0 cursor-pointer">
                    <option value="">Sin tipología</option>
                    {typologies.map(t => <option key={t.code} value={t.code}>{t.code} · {t.name || `Tipología ${t.code}`}</option>)}
                  </select>
                  <span className="absolute right-2.5 pointer-events-none"><Chevron /></span>
                </label>
              </div>
            );
          })}
        </div>
      )}
      <p className="m-0 text-xs leading-relaxed text-gray-500">¿Algún piso es distinto? Lo cambiás después en Unidades; no frena este paso.</p>
    </>
  );

  return (
    <SplitLayout panel={panel} panelLabel="Asignar tipologías" mainLabel="Tipologías">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <h2 className="m-0 text-[15px] font-semibold text-gray-900">
          {typologies.length} tipología{typologies.length === 1 ? '' : 's'} <span className="font-normal text-gray-500">— completá lo que tengas a mano; nada es obligatorio acá</span>
        </h2>
        <button type="button"
          onClick={() => setTypologies(ts => [...ts, { code: nextTypologyCode(ts), name: '', bedrooms: null, totalArea: null, innerArea: null }])}
          className="min-h-[36px] px-1 text-[13px] font-semibold text-brand-700 hover:text-gray-900">
          + Tipología
        </button>
      </div>
      <div className="grid gap-3.5 content-start" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(300px, 100%), 1fr))' }}>
        {typologies.map(t => {
          const [bg, fg] = typoColor(t.code);
          return (
            <div key={t.code} className="relative flex flex-col gap-3.5 p-4 rounded-[14px] bg-white border border-gray-200 focus-within:border-[1.5px] focus-within:border-brand-700 focus-within:shadow-[0_0_0_3px_rgba(55,70,63,0.08)]">
              <div className="flex items-center gap-3 pr-8">
                <span className="w-10 h-10 shrink-0 rounded-[10px] font-display text-[17px] font-semibold flex items-center justify-center" style={{ background: bg, color: fg }}>{t.code}</span>
                <span className="flex-1 min-w-0 flex flex-col">
                  <input
                    aria-label={`Nombre de la tipología ${t.code}`}
                    value={t.name}
                    placeholder="Ej: 2 dormitorios"
                    onChange={e => updateTypology(t.code, { name: e.target.value })}
                    className="min-w-0 border-0 p-0 text-base font-semibold text-gray-900 bg-transparent outline-none placeholder:text-gray-400"
                  />
                  <span className="text-xs text-gray-500">{unitsPerTypology.get(t.code) ?? 0} unidades</span>
                </span>
              </div>
              <button type="button" aria-label={`Quitar tipología ${t.code}`} onClick={() => removeTypology(t.code)}
                className="absolute top-3 right-3 w-8 h-8 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50">✕</button>
              <div className="grid grid-cols-3 gap-2">
                <SmallNumber label="Dormitorios" value={t.bedrooms} onChange={n => updateTypology(t.code, { bedrooms: n === null ? null : Math.floor(n) })} />
                <SmallNumber label="Sup. total m²" value={t.totalArea} onChange={n => updateTypology(t.code, { totalArea: n })} />
                <SmallNumber label="Cubierta m²" value={t.innerArea} onChange={n => updateTypology(t.code, { innerArea: n })} />
              </div>
            </div>
          );
        })}
      </div>
      <ErrorNote>{error}</ErrorNote>
      <div className="mt-auto">
        <StepFooter
          back={{ label: 'Estructura', onClick: onBack }}
          summary={<>Esto completa la ficha de <b>{coveredUnits} unidades</b> con {usedTypologies} carga{usedTypologies === 1 ? '' : 's'}.</>}
          primary={{ label: 'Seguir con la planta', onClick: save, busy }}
        />
      </div>
    </SplitLayout>
  );
}

/** Input chico de las tarjetas de tipología (38px, label de 11px). */
function SmallNumber({ label, value, onChange }: { label: string; value: number | null; onChange: (n: number | null) => void }) {
  return (
    <label className="flex flex-col gap-1 min-w-0">
      <span className="text-[11px] text-gray-500 truncate">{label}</span>
      <input
        inputMode="decimal"
        value={value ?? ''}
        placeholder="—"
        onChange={e => {
          const raw = e.target.value.replace(/[^\d.,]/g, '').replace(',', '.');
          onChange(raw === '' ? null : Number(raw));
        }}
        className="min-h-[40px] w-full min-w-0 px-2.5 rounded-lg border border-gray-300 bg-white text-sm text-gray-900 outline-none focus:border-brand-700 placeholder:text-gray-400"
      />
    </label>
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
  const undoCtl = useCanvasUndo();
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
    color: SHAPE_FILLS[Math.max(0, (typologyAt(p) ?? positionLetter(p)).charCodeAt(0) - 65) % SHAPE_FILLS.length],
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

  const roundOk = 'w-6 h-6 shrink-0 rounded-full bg-brand-100 text-brand-800 text-xs font-bold flex items-center justify-center';
  const roundNow = 'w-6 h-6 shrink-0 rounded-full bg-gray-900 text-white text-[11px] font-bold flex items-center justify-center';
  const roundTodo = 'w-6 h-6 shrink-0 rounded-full border-[1.5px] border-gray-300 text-gray-500 text-[11px] font-bold flex items-center justify-center';

  const panel = (
    <>
      <StepIntro eyebrow="Paso 3 de 4" title="Marcá la planta tipo una vez">
        Subí el plano del piso tipo y dibujá cada posición. Lo aplicamos a todos los pisos iguales; así el comprador toca su unidad en el plano del sitio.
      </StepIntro>

      <ol className="m-0 p-0 list-none flex flex-col gap-2.5">
        <li className="flex items-center gap-3 min-h-[48px] px-3 rounded-[10px] bg-white border border-gray-200">
          <span className={planImage ? roundOk : roundNow} aria-hidden>{planImage ? '✓' : '•'}</span>
          <span className="flex-1 text-[13px] font-medium text-gray-900">Subir el plano del piso tipo</span>
          {planImage
            ? <button type="button" onClick={() => setPlanImage('')} className="min-h-[32px] text-xs text-gray-500 underline underline-offset-2 hover:text-gray-900">Cambiar</button>
            : <span className="text-xs text-gray-500">Ahora</span>}
        </li>
        {shapes.map((sh, p) => {
          const typo = typologyAt(p);
          const on = activeId === sh.id;
          const done = sh.points.length >= 3;
          return (
            <li key={sh.id}>
              <button type="button" onClick={() => setActiveId(sh.id)} aria-pressed={on} disabled={!planImage}
                className={`w-full flex items-center gap-3 min-h-[48px] px-3 rounded-[10px] bg-white text-left disabled:cursor-not-allowed ${on && planImage ? 'border-[1.5px] border-gray-900' : 'border border-gray-200 hover:border-gray-300'}`}>
                <span className={done ? roundOk : on && planImage ? roundNow : roundTodo} aria-hidden>{done ? '✓' : '•'}</span>
                <span className="flex-1 text-[13px] font-medium text-gray-900">Posición {sh.label}{typo ? ` · Tipología ${typo}` : ''}</span>
                <span className="text-xs text-gray-500">{done ? 'Dibujada' : on && planImage ? 'Ahora' : 'Sin dibujar'}</span>
              </button>
            </li>
          );
        })}
      </ol>

      <fieldset className="m-0 flex flex-col gap-1 p-3.5 rounded-xl border border-gray-200 bg-white">
        <legend className="float-left w-full mb-1.5 text-xs font-semibold text-gray-900">Aplicar a</legend>
        {towers.map(b => {
          const floors = typicalFloors(b);
          return (
            <label key={b.id} className="flex items-center gap-2.5 min-h-[36px] text-[13px] text-gray-900 cursor-pointer">
              <input type="checkbox" checked={!!selected[b.id]} onChange={e => setSelected(s => ({ ...s, [b.id]: e.target.checked }))} className="w-4 h-4 accent-brand-700" />
              {b.name} · pisos {floors[0]?.number ?? 1} a {floors[floors.length - 1]?.number ?? 1}
            </label>
          );
        })}
        {hasPh && (
          <label className="flex items-center gap-2.5 min-h-[36px] text-[13px] text-gray-600 cursor-pointer">
            <input type="checkbox" checked={includePh} onChange={e => setIncludePh(e.target.checked)} className="w-4 h-4 accent-brand-700" />
            Penthouses (tienen otra planta: solo la imagen)
          </label>
        )}
      </fieldset>

      <button type="button" onClick={onNext} className="self-start min-h-[40px] text-[13px] font-semibold text-gray-900 underline underline-offset-2 hover:text-brand-700">
        Saltear por ahora — lo hago después
      </button>
    </>
  );

  return (
    <SplitLayout panel={panel} panelLabel="Planta tipo" mainLabel="Plano">
      <div className="flex-1 min-h-[420px] md:min-h-[600px] relative flex flex-col gap-3 p-3 sm:p-4 rounded-[18px] border border-gray-200 bg-white"
        style={{ backgroundImage: 'radial-gradient(#E4E0D8 1px, transparent 1px)', backgroundSize: '16px 16px' }}>
        {planImage ? (
          <>
            <div role="toolbar" aria-label="Herramientas" className="self-center flex items-center gap-0.5 p-1 rounded-xl bg-gray-900 shadow-[0_8px_24px_rgba(23,25,26,0.25)] max-w-full overflow-x-auto">
              <span className="min-h-[36px] flex items-center px-3 text-xs text-[#C9C6BE] shrink-0">Dibujando</span>
              {activeIndex >= 0 && activeIndex < positions && (
                <span className="min-h-[36px] flex items-center gap-1.5 px-3 rounded-lg bg-[#3A3D3B] text-white text-xs font-semibold shrink-0 whitespace-nowrap">
                  <span className="w-2.5 h-2.5 rounded-[3px]" style={{ background: typoColor(activeTypo)[0] }} />
                  Posición {positionLetter(activeIndex)}{activeTypo ? ` · Tipología ${activeTypo}` : ''}
                </span>
              )}
              {(['rectangle', 'point'] as const).map(m => (
                <button key={m} type="button" onClick={() => setMode(m)} aria-pressed={mode === m}
                  className={`min-h-[36px] px-3 rounded-lg text-xs shrink-0 ${mode === m ? 'text-white font-semibold bg-[#2B302D]' : 'text-[#C9C6BE] hover:text-white'}`}>
                  {m === 'rectangle' ? 'Rectángulo' : 'Forma libre'}
                </button>
              ))}
              <ToolbarUndo canUndo={undoCtl.canUndo} undo={undoCtl.undo} />
              {activeId && (points[activeId]?.length ?? 0) > 0 && (
                <button type="button" onClick={() => setPoints(prev => ({ ...prev, [activeId]: [] }))}
                  className="min-h-[36px] px-3 rounded-lg text-xs text-[#C9C6BE] hover:text-white shrink-0">
                  Borrar forma
                </button>
              )}
            </div>
            <div className="rounded-xl overflow-hidden bg-white">
              <PolygonCanvas
                imageUrl={planImage}
                shapes={shapes}
                activeId={activeId}
                mode={mode}
                onPointsChange={(id, pts) => setPoints(prev => ({ ...prev, [id]: pts }))}
                onComplete={advanceActive}
                {...undoCtl.canvasProps}
              />
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center p-4">
            <div className="w-full max-w-[460px] flex flex-col gap-3 p-5 rounded-2xl bg-white border border-gray-200 shadow-[0_8px_24px_-12px_rgba(23,25,26,0.18)]">
              <span className="text-sm font-semibold text-gray-900">Subí el plano del piso tipo</span>
              <span className="text-xs text-gray-500">PNG o JPG. Después marcás cada posición encima.</span>
              <ImageUploader value={planImage} onChange={setPlanImage} folder="floorplans" />
            </div>
          </div>
        )}
      </div>
      <ErrorNote>{error}</ErrorNote>
      <StepFooter
        back={{ label: 'Tipologías', onClick: onBack }}
        summary={<>{drawn} de {positions} posiciones · se aplica a <b>{floorsAffected} pisos</b> en una sola vez</>}
        primary={{ label: 'Aplicar y terminar', onClick: apply, disabled: !planImage || selectedTowers.length + (includePh ? 1 : 0) === 0, busy, busyLabel: 'Aplicando...' }}
      />
    </SplitLayout>
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
        optionalTitle="Lo que hace lucir un proyecto de estudio"
        optional={[
          { label: 'Relato', text: 'La idea, el lugar, las decisiones.', href: '/admin/proyecto/relato', tag: 'Recomendado' },
          { label: 'Equipo', text: 'Se publica en el portfolio de cada persona.', href: '/admin/proyecto/equipo', tag: 'Recomendado' },
          { label: 'Galería y renders', text: 'Soltalos juntos; se ordenan solos.', href: '/admin/proyecto/galeria', tag: 'Recomendado' },
          { label: 'Proceso y antes / después', text: 'Bocetos, maquetas, obra.', href: '/admin/proyecto/avance', tag: 'Suma' },
          { label: 'Recorrido 360° y BIM', text: 'Para recorrerlo sin visitarlo.', href: '/admin/proyecto/recorrido', tag: 'Suma' },
          { label: 'Ficha académica', text: 'Si es un proyecto de facultad o concurso.', href: '/admin/proyecto/equipo', tag: 'Opcional' },
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
        { label: 'Soltá todos los medios', text: 'Renders, fotos y 360°: se ordenan solos.', href: '/admin/proyecto/galeria', time: '5 min' },
        { label: 'Relato', text: 'Un texto corto y tres atributos.', href: '/admin/proyecto/relato', time: '5 min' },
        { label: 'Entorno', text: 'Ubicación y amenidades en una pantalla.', href: '/admin/proyecto/entorno', time: '3 min' },
        { label: 'Recorrido 360°', text: 'Escenas de espacios comunes.', href: '/admin/proyecto/recorrido', time: '10 min' },
        { label: 'Avance de obra', text: 'Primera entrada de la bitácora.', href: '/admin/proyecto/avance', time: '2 min' },
        { label: 'Equipo', text: 'Quién hizo el proyecto.', href: '/admin/proyecto/equipo', time: '2 min' },
      ]}
      onBackToStart={onBackToStart}
    />
  );
}
