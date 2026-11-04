'use client';

import { useEffect, useMemo, useState } from 'react';
import { TransitionLink as Link } from '@/components/ui/TransitionUtils';
import ImageUploader from '@/components/admin/ImageUploader';
import PolygonCanvas, { type PolygonShape } from '@/components/admin/PolygonCanvas';
import { useToast } from '@/components/ui/ToastProvider';
import {
  blockOfCode, centroid, parsePastedPrices, polygonAreaM2, priceForLot, splitQuad,
  type BlockInput, type PriceRule, type Pt,
} from '@/lib/guided-structure';
import type { UnitStatus } from '@/types';
import type { FlowProps } from './GuidedLoad';
import ListoScreen, { PreviewCard } from './ListoScreen';
import {
  ChoiceCard, ErrorNote, FieldLabel, GuidedHeader, NumberField, NumberStepper, Segmented, StepFooter, StepIntro,
  SHAPE_PALETTE, formatMoney, formatNumber, inputClass, useGuidedApi,
  type GFloor, type GUnit, type GuidedTree, type UnitDot,
} from './shared';

// Carga guiada · Loteo: plano + numeración → dibujar manzanas y dividirlas
// en lotes → precios por reglas (solo "para vender") → listo.

type Corner = 'NO' | 'NE' | 'SE' | 'SO';
const CORNER_LABEL: Record<Corner, string> = { NO: '↖ esquina NO', NE: '↗ esquina NE', SE: '↘ esquina SE', SO: '↙ esquina SO' };

const STATUS_LABEL: Record<UnitStatus, string> = { available: 'Disponible', reserved: 'Reservado', sold: 'Vendido' };

function lotFloor(tree: GuidedTree): GFloor | null {
  return tree.buildings[0]?.floors[0] ?? null;
}

/** Agrupa los lotes por manzana ("Mz3") — null = numeración corrida. */
function groupBlocks(lots: GUnit[]): { tag: string | null; lots: GUnit[] }[] {
  const map = new Map<string | null, GUnit[]>();
  for (const l of lots) {
    const tag = blockOfCode(l.code);
    map.set(tag, [...(map.get(tag) ?? []), l]);
  }
  return [...map.entries()]
    .map(([tag, ls]) => ({ tag, lots: ls }))
    .sort((a, b) => Number(a.tag?.slice(2) ?? 0) - Number(b.tag?.slice(2) ?? 0));
}

function lotArea(u: GUnit): number | null {
  return u.lot_size ?? u.total_area ?? null;
}

function useImageSize(src: string | null | undefined) {
  const [size, setSize] = useState<{ src: string; w: number; h: number } | null>(null);
  useEffect(() => {
    if (!src) return;
    const img = new Image();
    img.onload = () => setSize({ src, w: img.naturalWidth, h: img.naturalHeight });
    img.src = src;
  }, [src]);
  return size && size.src === src ? size : null;
}

/** Ordena 4 esquinas como NO, NE, SE, SO y rota para que la primera sea la de inicio. */
function orientQuad(points: Pt[], start: Corner): Pt[] | null {
  if (points.length !== 4) return null;
  const c = centroid(points);
  const sorted = [...points].sort((a, b) => Math.atan2(a.y - c.y, a.x - c.x) - Math.atan2(b.y - c.y, b.x - c.x));
  const [no, ne, se, so] = sorted;
  switch (start) {
    case 'NO': return [no, ne, se, so];
    case 'NE': return [ne, no, so, se];
    case 'SE': return [se, so, no, ne];
    case 'SO': return [so, se, ne, no];
  }
}

export default function LoteoFlow({ project, tree, setTree, reload, step, goTo }: FlowProps) {
  const showcase = project.saleMode === 'showcase';
  const steps = showcase
    ? [{ label: 'Plano y numeración' }, { label: 'Dibujar lotes' }, { label: 'Listo' }]
    : [{ label: 'Plano y numeración' }, { label: 'Dibujar lotes' }, { label: 'Superficies y precios' }, { label: 'Listo' }];
  const hasStructure = tree.buildings.length > 0;
  let current = step ?? (hasStructure ? 2 : 1);
  if (!hasStructure) current = 1;
  current = Math.min(Math.max(1, current), steps.length);
  const total = steps.length;

  return (
    <>
      <GuidedHeader project={project} kindLabel="Loteo" steps={steps} current={current} onStep={goTo} canGoTo={n => n === 1 || hasStructure} />
      {current === 1 && <PlanStep tree={tree} setTree={setTree} goTo={goTo} total={total} />}
      {current === 2 && <DrawStep tree={tree} reload={reload} goTo={goTo} total={total} />}
      {current === 3 && !showcase && <PricesStep tree={tree} reload={reload} goTo={goTo} />}
      {current === total && <LoteoListo project={project} tree={tree} goTo={goTo} total={total} />}
    </>
  );
}

// ─── Paso 1 · Plano y numeración ───────────────────────────────────

function PlanStep({ tree, setTree, goTo, total }: { tree: GuidedTree; setTree: (t: GuidedTree) => void; goTo: (n: number) => void; total: number }) {
  const api = useGuidedApi();
  const floor = lotFloor(tree);
  const [planImage, setPlanImage] = useState('');
  const [mode, setMode] = useState<'blocks' | 'sequential'>('blocks');
  const [blocks, setBlocks] = useState<BlockInput[]>([{ name: 'Manzana 1', lots: 20 }, { name: 'Manzana 2', lots: 20 }]);
  const [totalLots, setTotalLots] = useState(40);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (floor) {
    const lots = floor.units;
    const groups = groupBlocks(lots);
    return (
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-8 sm:py-10 flex flex-col gap-8">
        <StepIntro eyebrow={`Paso 1 de ${total}`} title="El loteo ya está creado">
          Tiene {lots.length} lotes{groups[0]?.tag ? ` en ${groups.length} manzanas` : ''}. Para agregar o renombrar lotes usá la pantalla de estructura; acá seguís con el dibujo y los precios.
        </StepIntro>
        <div className="flex gap-6 flex-wrap items-start">
          <div className="flex-[1_1_320px] max-w-[560px] rounded-2xl border border-gray-200 bg-white overflow-hidden">
            {floor.plan_image
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={floor.plan_image} alt="Plano del loteo" className="w-full max-h-[360px] object-contain bg-gray-50" />
              : <div className="h-40 flex items-center justify-center text-sm text-gray-500">Todavía sin plano — lo subís en el paso siguiente.</div>}
          </div>
          <div className="flex-[1_1_240px] flex flex-col gap-2">
            {groups.map(g => (
              <div key={g.tag ?? 'all'} className="flex justify-between min-h-[44px] items-center px-3 rounded-lg bg-white border border-gray-200 text-sm">
                <span className="font-semibold text-gray-900">{g.tag ?? 'Numeración corrida'}</span>
                <span className="text-gray-500">{g.lots.length} lotes</span>
              </div>
            ))}
            <Link href="/admin/edificios" className="text-sm font-semibold text-brand-700 min-h-[44px] flex items-center">Editar la estructura →</Link>
          </div>
        </div>
        <StepFooter primary={{ label: 'Seguir con el dibujo →', onClick: () => goTo(2) }} />
      </div>
    );
  }

  const lotCount = mode === 'blocks' ? blocks.reduce((s, b) => s + b.lots, 0) : totalLots;
  const create = async () => {
    setError('');
    setBusy(true);
    const res = await api.create({ kind: 'loteo', planImage: planImage || null, mode, blocks, totalLots });
    setBusy(false);
    if (!res.ok) { setError(res.error); return; }
    setTree({ buildings: res.data.buildings });
    goTo(2);
  };

  return (
    <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-8 sm:py-10 flex flex-col gap-8">
      <div className="flex gap-8 flex-wrap items-start">
        <section aria-label="Plano y numeración" className="flex-[1_1_420px] min-w-0 flex flex-col gap-6">
          <StepIntro eyebrow={`Paso 1 de ${total}`} title="Subí el plano del loteo">
            Es la base de todo: sobre este plano vas a marcar cada lote y el comprador lo va a recorrer en el sitio.
          </StepIntro>
          <ImageUploader value={planImage} onChange={setPlanImage} folder="floorplans" label="Plano de subdivisión" />

          <div className="flex flex-col gap-3">
            <FieldLabel>¿Cómo están organizados los lotes?</FieldLabel>
            <div className="grid grid-cols-2 gap-2">
              <ChoiceCard on={mode === 'blocks'} onClick={() => setMode('blocks')} title="Por manzanas" hint="Mz 1 · Lote 01" />
              <ChoiceCard on={mode === 'sequential'} onClick={() => setMode('sequential')} title="Numeración corrida" hint={`Lote 1 a ${totalLots}`} />
            </div>
          </div>

          {mode === 'blocks' ? (
            <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
              <div className="grid grid-cols-[1fr_auto_44px] gap-3 px-4 py-2 border-b border-gray-100 text-xs font-medium text-gray-500">
                <span>Manzana</span><span>Lotes</span><span />
              </div>
              {blocks.map((b, i) => (
                <div key={i} className="grid grid-cols-[1fr_auto_44px] gap-3 items-center px-4 py-2 border-b border-gray-50">
                  <input
                    aria-label={`Nombre de la manzana ${i + 1}`}
                    value={b.name}
                    onChange={e => setBlocks(bs => bs.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
                    className={inputClass}
                  />
                  <NumberStepper hideLabel label={`Lotes de ${b.name}`} value={b.lots} min={0} max={500}
                    onChange={n => setBlocks(bs => bs.map((x, j) => (j === i ? { ...x, lots: n } : x)))} />
                  <button type="button" aria-label={`Quitar ${b.name}`} disabled={blocks.length <= 1}
                    onClick={() => setBlocks(bs => bs.filter((_, j) => j !== i))}
                    className="w-11 h-11 rounded-lg text-gray-500 hover:bg-gray-100 disabled:opacity-30">✕</button>
                </div>
              ))}
              <button type="button" onClick={() => setBlocks(bs => [...bs, { name: `Manzana ${bs.length + 1}`, lots: 20 }])}
                className="w-full min-h-[48px] text-sm font-semibold text-brand-700 hover:bg-gray-50">+ Manzana</button>
            </div>
          ) : (
            <NumberStepper label="Cantidad de lotes" value={totalLots} min={1} max={2000} onChange={setTotalLots} />
          )}

          <p className="text-[13px] text-gray-600 p-3 rounded-lg bg-gray-100">
            El loteo se carga como una sola etapa. Si tiene varias, escribinos y lo armamos con vos.
          </p>
        </section>

        <aside aria-label="Vista del plano" className="flex-[1_1_380px] min-w-0 flex flex-col gap-3">
          <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
            {planImage
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={planImage} alt="Plano del loteo" className="w-full max-h-[460px] object-contain bg-gray-50" />
              : <div className="aspect-[4/3] flex items-center justify-center text-sm text-gray-500 bg-gray-50">Acá vas a ver el plano</div>}
          </div>
          {mode === 'blocks' && (
            <div className="flex flex-wrap gap-1.5">
              {blocks.map((b, i) => (
                <span key={i} className="text-xs px-2.5 py-1 rounded-full bg-white border border-gray-200 text-gray-700">{b.name || `Manzana ${i + 1}`} · {b.lots}</span>
              ))}
            </div>
          )}
          <p className="text-sm font-semibold text-gray-900">
            {mode === 'blocks' ? `${blocks.length} manzana${blocks.length === 1 ? '' : 's'} · ` : ''}{lotCount} lotes
          </p>
          <p className="text-xs text-gray-500">Se crean ahora con su código; los dibujás en el paso siguiente.</p>
        </aside>
      </div>
      <ErrorNote>{error}</ErrorNote>
      <StepFooter primary={{ label: 'Crear lotes y seguir →', onClick: create, disabled: lotCount === 0, busy, busyLabel: 'Creando lotes...' }} />
    </div>
  );
}

// ─── Paso 2 · Dibujar ──────────────────────────────────────────────

const MZ_SHAPE = '__manzana';

function DrawStep({ tree, reload, goTo, total }: { tree: GuidedTree; reload: () => Promise<void>; goTo: (n: number) => void; total: number }) {
  const api = useGuidedApi();
  const toast = useToast();
  const floor = lotFloor(tree);
  const lots = useMemo(() => floor?.units ?? [], [floor]);
  const groups = useMemo(() => groupBlocks(lots), [lots]);
  const sequential = groups.length === 1 && groups[0].tag === null;

  const [blockTag, setBlockTag] = useState<string | null>(groups[0]?.tag ?? null);
  const [tool, setTool] = useState<'manzana' | 'lote'>('manzana');
  const [drawMode, setDrawMode] = useState<'rectangle' | 'point'>('rectangle');
  const [quad, setQuad] = useState<Pt[]>([]);
  const [rows, setRows] = useState(2);
  const [cols, setCols] = useState(() => Math.max(1, Math.ceil((groups[0]?.lots.length ?? 2) / 2)));
  const [start, setStart] = useState<Corner>('NO');
  const [order, setOrder] = useState<'rows' | 'u'>('rows');
  const [scale, setScale] = useState<number | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [editPoints, setEditPoints] = useState<Pt[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const imgSize = useImageSize(floor?.plan_image);
  const drawn = lots.filter(l => (l.polygon?.length ?? 0) >= 3).length;

  const blockLots = sequential ? lots : (groups.find(g => g.tag === blockTag)?.lots ?? []);
  // En numeración corrida se dividen los siguientes lotes sin dibujar.
  const targetLots = sequential
    ? lots.filter(l => (l.polygon?.length ?? 0) < 3).slice(0, rows * cols)
    : blockLots.slice(0, rows * cols);
  const oriented = orientQuad(quad, start);
  const split = oriented ? splitQuad(oriented, rows, cols, order) : [];
  const areaOf = (pts: Pt[]) => (imgSize && scale ? polygonAreaM2(pts, imgSize.w, imgSize.h, scale) : null);
  const avgArea = split.length && imgSize && scale
    ? Math.round(split.reduce((s, l) => s + (areaOf(l.points) ?? 0), 0) / split.length)
    : null;

  const colorFor = (code: string) => {
    const idx = groups.findIndex(g => g.tag === blockOfCode(code));
    return SHAPE_PALETTE[Math.max(0, idx) % SHAPE_PALETTE.length];
  };

  const shapes: PolygonShape[] = [
    ...lots
      .filter(l => (l.polygon?.length ?? 0) >= 3 && l.id !== editId)
      .map(l => ({ id: l.id, label: l.code.replace(/^Mz\d+-/, ''), points: l.polygon ?? [], color: colorFor(l.code) })),
    ...(tool === 'manzana' && split.length
      ? split.slice(0, targetLots.length).map((s, i) => ({ id: `preview-${i}`, label: targetLots[i]?.code.replace(/^Mz\d+-/, '') ?? '', points: s.points, color: '#d97706' }))
      : []),
    ...(tool === 'manzana' ? [{ id: MZ_SHAPE, label: blockTag ?? 'Manzana', points: quad, color: '#111827' }] : []),
    ...(tool === 'lote' && editId ? [{ id: editId, label: lots.find(l => l.id === editId)?.code ?? '', points: editPoints, color: '#e11d48' }] : []),
  ];

  const mergedDots = (changed: { code: string; points: Pt[] }[]): UnitDot[] => {
    const codes = new Set(changed.map(c => c.code));
    return [
      ...(floor?.unit_dots ?? []).filter(d => !codes.has(d.unitId)),
      ...changed.map(c => ({ unitId: c.code, ...centroid(c.points) })),
    ];
  };

  const savePlan = async (url: string) => {
    if (!floor) return;
    const res = await api.patch({ floors: [{ id: floor.id, planImage: url }] });
    if (!res.ok) { toast(res.error, 'error'); return; }
    await reload();
  };

  const divide = async () => {
    if (!floor || !oriented || targetLots.length === 0) return;
    setError('');
    setBusy(true);
    const assigned = targetLots.map((u, i) => ({ u, lot: split[i] })).filter(x => x.lot);
    const res = await api.patch({
      units: assigned.map(({ u, lot }) => {
        const area = areaOf(lot.points);
        const features = u.features.filter(f => f !== 'esquina');
        return {
          id: u.id,
          polygon: lot.points,
          features: lot.corner ? [...features, 'esquina'] : features,
          ...(area ? { lotSize: area, totalArea: area } : {}),
        };
      }),
      floors: [{ id: floor.id, unitDots: mergedDots(assigned.map(({ u, lot }) => ({ code: u.code, points: lot.points }))) }],
    });
    setBusy(false);
    if (!res.ok) { setError(res.error); return; }
    toast(`${assigned.length} lotes dibujados.`);
    setQuad([]);
    await reload();
    // Pasa sola a la próxima manzana sin dibujar.
    if (!sequential) {
      const next = groups.find(g => g.tag !== blockTag && g.lots.every(l => (l.polygon?.length ?? 0) < 3));
      if (next) { setBlockTag(next.tag); setCols(Math.max(1, Math.ceil(next.lots.length / rows))); }
    }
  };

  const selectLot = (id: string) => {
    setEditId(id || null);
    setEditPoints(lots.find(l => l.id === id)?.polygon ?? []);
  };

  const saveLot = async () => {
    const u = lots.find(l => l.id === editId);
    if (!floor || !u || editPoints.length < 3) return;
    setBusy(true);
    const area = areaOf(editPoints);
    const res = await api.patch({
      units: [{ id: u.id, polygon: editPoints, ...(area ? { lotSize: area, totalArea: area } : {}) }],
      floors: [{ id: floor.id, unitDots: mergedDots([{ code: u.code, points: editPoints }]) }],
    });
    setBusy(false);
    if (!res.ok) { toast(res.error, 'error'); return; }
    toast(`${u.code} guardado.`);
    await reload();
  };

  if (!floor) return null;

  return (
    <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-8 sm:py-10 flex flex-col gap-8">
      <StepIntro eyebrow={`Paso 2 de ${total}`} title="Dibujá la manzana, el sistema la divide">
        Marcá el contorno de cada manzana y decí en cuántos lotes se parte. Después ajustás los que sean irregulares.
      </StepIntro>

      <div className="flex gap-6 flex-wrap items-start">
        {/* Manzanas */}
        {/* En celular las manzanas son chips con scroll horizontal; en desktop, columna. */}
        <nav aria-label="Manzanas" className="flex-[1_1_200px] md:max-w-[260px] min-w-0 flex flex-row md:flex-col gap-1.5 overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0 pb-1 md:pb-0">
          {groups.map(g => {
            const d = g.lots.filter(l => (l.polygon?.length ?? 0) >= 3).length;
            const on = g.tag === blockTag;
            return (
              <button key={g.tag ?? 'all'} type="button" onClick={() => { setBlockTag(g.tag); setQuad([]); setCols(Math.max(1, Math.ceil(g.lots.length / rows))); }}
                aria-pressed={on}
                className={`shrink-0 flex flex-col items-start min-h-[52px] px-3 py-2 rounded-xl border text-left ${on ? 'border-[1.5px] border-brand-700 bg-brand-50' : 'border-gray-200 bg-white hover:border-gray-300'}`}>
                <span className="text-sm font-semibold text-gray-900">{g.tag ?? 'Todos los lotes'}</span>
                <span className="text-xs text-gray-500">{d} de {g.lots.length} dibujados</span>
              </button>
            );
          })}
          <div className="hidden md:flex mt-3 p-3 rounded-xl bg-white border border-gray-200 flex-col gap-1">
            <span className="text-[13px] font-semibold text-gray-900">Lotes en esquina o irregulares</span>
            <span className="text-xs text-gray-500 leading-snug">Elegí “Lote suelto”, tocá un lote y arrastrá sus vértices. La superficie se recalcula sola con la escala del plano.</span>
          </div>
        </nav>

        {/* Plano */}
        <div className="flex-[3_1_480px] min-w-0 flex flex-col gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            <Segmented label="Herramienta" value={tool} onChange={v => { setTool(v); setEditId(null); }}
              options={[{ value: 'manzana', label: 'Manzana' }, { value: 'lote', label: 'Lote suelto' }]} />
            {tool === 'manzana' && (
              <Segmented label="Forma" value={drawMode} onChange={v => { setDrawMode(v); setQuad([]); }}
                options={[{ value: 'rectangle', label: 'Rectángulo' }, { value: 'point', label: '4 esquinas' }]} />
            )}
            {tool === 'lote' && (
              <label className="flex items-center gap-2">
                <span className="sr-only">Lote a editar</span>
                <select value={editId ?? ''} onChange={e => selectLot(e.target.value)} className={`${inputClass} w-auto min-w-[160px]`}>
                  <option value="">Elegí un lote</option>
                  {blockLots.map(l => <option key={l.id} value={l.id}>{l.code}{(l.polygon?.length ?? 0) >= 3 ? '' : ' (sin dibujar)'}</option>)}
                </select>
              </label>
            )}
          </div>
          {floor.plan_image ? (
            <div className="rounded-2xl border border-gray-200 bg-white p-2">
              <PolygonCanvas
                imageUrl={floor.plan_image}
                shapes={shapes}
                activeId={tool === 'manzana' ? MZ_SHAPE : editId}
                mode={tool === 'manzana' ? drawMode : 'point'}
                onPointsChange={(id, pts) => {
                  if (id === MZ_SHAPE) setQuad(pts);
                  else if (id === editId) setEditPoints(pts);
                }}
              />
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-4 flex flex-col gap-2">
              <p className="text-sm text-gray-700">Para dibujar los lotes primero subí el plano del loteo.</p>
              <ImageUploader value="" onChange={savePlan} folder="floorplans" label="Plano de subdivisión" />
            </div>
          )}
          {tool === 'manzana' && quad.length > 0 && quad.length !== 4 && (
            <p className="text-xs text-amber-800">Marcá exactamente 4 esquinas ({quad.length} marcadas).</p>
          )}
        </div>

        {/* Panel de división */}
        <aside className="flex-[1_1_260px] max-w-[320px] min-w-0 flex flex-col gap-4 p-4 rounded-2xl bg-white border border-gray-200">
          {tool === 'manzana' ? (
            <>
              <h2 className="m-0 text-[15px] font-semibold text-gray-900">Dividir {blockTag ?? 'lotes'}</h2>
              <div className="flex gap-3 flex-wrap">
                <NumberStepper label="Filas" value={rows} min={1} max={20} onChange={setRows} />
                <NumberStepper label="Lotes por fila" value={cols} min={1} max={100} onChange={setCols} />
              </div>
              <label className="flex flex-col gap-1.5">
                <FieldLabel>Numerar desde</FieldLabel>
                <select value={start} onChange={e => setStart(e.target.value as Corner)} className={inputClass}>
                  {(Object.keys(CORNER_LABEL) as Corner[]).map(c => <option key={c} value={c}>{CORNER_LABEL[c]}</option>)}
                </select>
              </label>
              <Segmented label="Orden" value={order} onChange={setOrder} options={[{ value: 'rows', label: 'Por filas' }, { value: 'u', label: 'En U' }]} />
              <NumberField label="Escala: ancho real del plano" suffix="m" value={scale} onChange={setScale} placeholder="Ej: 600" />
              <div className="text-[13px] text-gray-700 p-3 rounded-lg bg-gray-50">
                {rows * cols} lotes{avgArea ? ` de ~${formatNumber(avgArea)} m² cada uno` : ''}
                {!sequential && rows * cols !== blockLots.length && (
                  <span className="block text-xs text-amber-800 mt-1">{blockTag} tiene {blockLots.length} lotes; se dibujan {Math.min(rows * cols, blockLots.length)}.</span>
                )}
                {!scale && <span className="block text-xs text-gray-500 mt-1">Sin escala, la superficie la cargás en el paso de precios.</span>}
              </div>
              <ErrorNote>{error}</ErrorNote>
              <button type="button" onClick={divide} disabled={!oriented || busy || targetLots.length === 0}
                className="min-h-[44px] rounded-xl bg-brand-700 text-white text-sm font-semibold hover:bg-brand-800 disabled:bg-gray-200 disabled:text-gray-400">
                {busy ? 'Dividiendo...' : 'Dividir'}
              </button>
            </>
          ) : (
            <>
              <h2 className="m-0 text-[15px] font-semibold text-gray-900">Editar vértices</h2>
              <p className="m-0 text-xs text-gray-500 leading-snug">Arrastrá un vértice para moverlo; tocá el plano para agregar uno; doble clic sobre un vértice lo borra.</p>
              <NumberField label="Escala: ancho real del plano" suffix="m" value={scale} onChange={setScale} placeholder="Ej: 600" />
              {editId && editPoints.length >= 3 && areaOf(editPoints) && (
                <p className="text-[13px] text-gray-700">Superficie: {formatNumber(areaOf(editPoints))} m²</p>
              )}
              <button type="button" onClick={saveLot} disabled={!editId || editPoints.length < 3 || busy}
                className="min-h-[44px] rounded-xl bg-brand-700 text-white text-sm font-semibold hover:bg-brand-800 disabled:bg-gray-200 disabled:text-gray-400">
                {busy ? 'Guardando...' : 'Guardar lote'}
              </button>
            </>
          )}
        </aside>
      </div>

      <StepFooter
        back={{ label: 'Plano', onClick: () => goTo(1) }}
        summary={<><b className="text-gray-900">{drawn} de {lots.length}</b> lotes dibujados</>}
        primary={{ label: 'Seguir →', onClick: () => goTo(3) }}
      />
    </div>
  );
}

// ─── Paso 3 · Precios ──────────────────────────────────────────────

const RULE_TARGETS: { value: PriceRule['target']; label: string }[] = [
  { value: 'corner', label: 'Lotes en esquina' },
  { value: 'blocks', label: 'Manzanas' },
  { value: 'first', label: 'Primeros N lotes' },
];

function PricesStep({ tree, reload, goTo }: { tree: GuidedTree; reload: () => Promise<void>; goTo: (n: number) => void }) {
  const api = useGuidedApi();
  const toast = useToast();
  const lots = useMemo(() => lotFloor(tree)?.units ?? [], [tree]);
  const groups = useMemo(() => groupBlocks(lots), [lots]);
  const blockTags = groups.map(g => g.tag).filter((t): t is string => !!t);

  const [base, setBase] = useState<number | null>(null);
  const [rules, setRules] = useState<PriceRule[]>([{ id: 'r1', label: 'Lotes en esquina', pct: 10, target: 'corner' }]);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasted, setPasted] = useState('');
  const [overrides, setOverrides] = useState<Record<string, number | null>>({});
  const [areas, setAreas] = useState<Record<string, number | null>>({});
  const [statuses, setStatuses] = useState<Record<string, UnitStatus>>({});
  const [tab, setTab] = useState<string | null>(groups[0]?.tag ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const pastedMap = useMemo(() => parsePastedPrices(pasted), [pasted]);

  const rowsAll = lots.map((u, index) => {
    const area = u.id in areas ? areas[u.id] : lotArea(u);
    const priced = priceForLot({ id: u.id, code: u.code, area, corner: u.features.includes('esquina'), block: blockOfCode(u.code), index }, base ?? 0, rules);
    const override = overrides[u.id];
    const price = override !== undefined && override !== null ? override
      : pastedMap.get(u.code) ?? priced.price ?? u.price;
    return { u, area, pct: priced.pct, price, status: statuses[u.id] ?? u.status };
  });
  const visible = rowsAll.filter(r => blockOfCode(r.u.code) === tab);
  const withPrice = rowsAll.filter(r => r.price !== null && r.price !== undefined);
  const minPrice = withPrice.length ? Math.min(...withPrice.map(r => r.price as number)) : null;
  const blockTotal = visible.reduce((s, r) => s + (r.price ?? 0), 0);

  const updateRule = (id: string, patch: Partial<PriceRule>) => setRules(rs => rs.map(r => (r.id === id ? { ...r, ...patch } : r)));

  const apply = async () => {
    setError('');
    setBusy(true);
    const res = await api.patch({
      units: rowsAll.map(r => ({
        id: r.u.id,
        status: r.status,
        ...(r.price !== null && r.price !== undefined ? { price: r.price } : {}),
        ...(r.area ? { lotSize: r.area, totalArea: r.area } : {}),
      })),
    });
    setBusy(false);
    if (!res.ok) { setError(res.error); return; }
    toast('Precios guardados.');
    await reload();
    goTo(4);
  };

  return (
    <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-8 sm:py-10 flex flex-col gap-8">
      <div className="flex gap-8 flex-wrap items-start">
        <section aria-label="Reglas de precio" className="flex-[1_1_360px] md:max-w-[460px] min-w-0 flex flex-col gap-6">
          <StepIntro eyebrow="Paso 3 de 4" title="Poné precio con reglas, no lote por lote">
            Las superficies salen del dibujo. Definí un precio por m² y los ajustes; los precios se calculan solos y podés retocar cualquiera.
          </StepIntro>
          <NumberField label="Precio base por m²" prefix="USD" suffix="/ m²" value={base} onChange={setBase} placeholder="Ej: 80" />

          <div className="flex flex-col gap-2">
            <FieldLabel>Ajustes</FieldLabel>
            {rules.map(r => (
              <div key={r.id} className="flex flex-col gap-2 p-3 rounded-xl bg-white border border-gray-200">
                <div className="flex gap-2">
                  <input aria-label="Nombre del ajuste" value={r.label} onChange={e => updateRule(r.id, { label: e.target.value })} className={`${inputClass} flex-1`} />
                  <label className="flex items-center h-11 rounded-[10px] border border-gray-300 bg-white w-[96px] overflow-hidden">
                    <span className="sr-only">Porcentaje de {r.label}</span>
                    <input inputMode="decimal" value={r.pct}
                      onChange={e => { const n = Number(e.target.value.replace(',', '.')); if (Number.isFinite(n) || e.target.value === '-') updateRule(r.id, { pct: Number.isFinite(n) ? n : 0 }); }}
                      className="w-full h-full px-2 text-sm text-right outline-none" />
                    <span className="pr-2 text-xs text-gray-500">%</span>
                  </label>
                  <button type="button" aria-label={`Quitar ${r.label}`} onClick={() => setRules(rs => rs.filter(x => x.id !== r.id))}
                    className="w-11 h-11 rounded-lg text-gray-500 hover:bg-gray-100">✕</button>
                </div>
                <select aria-label="A qué lotes aplica" value={r.target} onChange={e => updateRule(r.id, { target: e.target.value as PriceRule['target'] })} className={inputClass}>
                  {RULE_TARGETS.filter(t => t.value !== 'blocks' || blockTags.length > 0).map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
                {r.target === 'blocks' && (
                  <div className="flex flex-wrap gap-1.5">
                    {blockTags.map(t => {
                      const on = (r.blocks ?? []).includes(t);
                      return (
                        <button key={t} type="button" aria-pressed={on}
                          onClick={() => updateRule(r.id, { blocks: on ? (r.blocks ?? []).filter(b => b !== t) : [...(r.blocks ?? []), t] })}
                          className={`min-h-[36px] px-3 rounded-full text-xs border ${on ? 'border-brand-700 bg-brand-50 font-semibold text-gray-900' : 'border-gray-200 text-gray-600'}`}>{t}</button>
                      );
                    })}
                  </div>
                )}
                {r.target === 'first' && (
                  <NumberStepper label="Cantidad de lotes" value={r.first ?? 20} min={1} max={2000} onChange={n => updateRule(r.id, { first: n })} />
                )}
              </div>
            ))}
            <button type="button" onClick={() => setRules(rs => [...rs, { id: `r${Date.now()}`, label: 'Ajuste', pct: 5, target: 'first', first: 20 }])}
              className="self-start min-h-[44px] text-sm font-semibold text-brand-700">+ Ajuste</button>
          </div>

          <div className="flex flex-col gap-2">
            <button type="button" onClick={() => setPasteOpen(o => !o)} aria-expanded={pasteOpen}
              className="self-start min-h-[44px] text-sm font-semibold text-gray-900 underline underline-offset-2">O pegá tu lista de precios desde Excel</button>
            {pasteOpen && (
              <label className="flex flex-col gap-1.5">
                <FieldLabel>Una fila por lote: código y precio ({pastedMap.size} reconocidos)</FieldLabel>
                <textarea value={pasted} onChange={e => setPasted(e.target.value)} rows={6}
                  placeholder={'Mz1-L01\t25500\nMz1-L02\t26800'}
                  className="p-3 rounded-[10px] border border-gray-300 bg-white text-sm font-mono outline-none focus:ring-2 focus:ring-brand-500" />
              </label>
            )}
          </div>
        </section>

        <section aria-label="Lotes" className="flex-[2_1_520px] min-w-0 flex flex-col gap-3">
          {blockTags.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              <div className="max-w-full overflow-x-auto"><Segmented label="Manzana" value={tab ?? ''} onChange={v => setTab(v || null)} options={blockTags.map(t => ({ value: t, label: t }))} /></div>
              <span className="text-[13px] text-gray-600">{tab} · {visible.length} lotes · {formatMoney(blockTotal)} en total</span>
            </div>
          )}
          {/* Tabla en desktop; en celular cada fila se apila como tarjeta (código y ajuste arriba, superficie/precio, estado). */}
          <div className="rounded-xl border border-gray-200 bg-white overflow-x-auto">
            <table className="w-full text-sm sm:min-w-[560px] max-sm:block">
              <thead className="max-sm:hidden">
                <tr className="text-left text-xs text-gray-500 border-b border-gray-100">
                  <th className="font-medium px-3 py-2">Lote</th>
                  <th className="font-medium px-3 py-2">Superficie</th>
                  <th className="font-medium px-3 py-2">Ajuste</th>
                  <th className="font-medium px-3 py-2">Precio USD</th>
                  <th className="font-medium px-3 py-2">Estado</th>
                </tr>
              </thead>
              <tbody className="max-sm:block">
                {visible.map(r => (
                  <tr key={r.u.id} className="border-b border-gray-50 max-sm:grid max-sm:grid-cols-2 max-sm:gap-x-3 max-sm:gap-y-2 max-sm:p-3 max-sm:border-gray-100">
                    <td className="px-3 py-1.5 max-sm:p-0 font-mono text-xs text-gray-900 whitespace-nowrap max-sm:self-center max-sm:text-[13px] max-sm:font-semibold">{r.u.code}{r.u.features.includes('esquina') && <span className="ml-1.5 font-sans text-[10.5px] text-gray-500">esquina</span>}</td>
                    <td className="px-3 py-1.5 max-sm:p-0 max-sm:order-3">
                      <span className="sm:hidden block text-[11px] text-gray-500 mb-1">Superficie</span>
                      <span className="flex items-center gap-1">
                        <input aria-label={`Superficie de ${r.u.code}`} inputMode="decimal" value={r.area ?? ''}
                          onChange={e => { const v = e.target.value.replace(/[^\d.]/g, ''); setAreas(a => ({ ...a, [r.u.id]: v === '' ? null : Number(v) })); }}
                          className="w-20 max-sm:flex-1 max-sm:min-w-0 h-9 max-sm:h-11 px-2 rounded-md border border-gray-200 text-sm" />
                        <span className="text-xs text-gray-500">m²</span>
                      </span>
                    </td>
                    <td className="px-3 py-1.5 max-sm:p-0 max-sm:order-2 max-sm:text-right max-sm:self-center text-xs text-gray-600">{r.pct ? `${r.pct > 0 ? '+' : ''}${r.pct} %` : '—'}</td>
                    <td className="px-3 py-1.5 max-sm:p-0 max-sm:order-4">
                      <span className="sm:hidden block text-[11px] text-gray-500 mb-1">Precio USD</span>
                      <input aria-label={`Precio de ${r.u.code}`} inputMode="numeric" value={r.price ?? ''}
                        onChange={e => { const v = e.target.value.replace(/\D/g, ''); setOverrides(o => ({ ...o, [r.u.id]: v === '' ? null : Number(v) })); }}
                        className="w-28 max-sm:w-full h-9 max-sm:h-11 px-2 rounded-md border border-gray-200 text-sm" />
                    </td>
                    <td className="px-3 py-1.5 max-sm:p-0 max-sm:order-5 max-sm:col-span-2">
                      <select aria-label={`Estado de ${r.u.code}`} value={r.status} onChange={e => setStatuses(s => ({ ...s, [r.u.id]: e.target.value as UnitStatus }))}
                        className="h-9 max-sm:h-11 max-sm:w-full px-2 rounded-md border border-gray-200 text-sm bg-white">
                        {(Object.keys(STATUS_LABEL) as UnitStatus[]).map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
      <ErrorNote>{error}</ErrorNote>
      <StepFooter
        back={{ label: 'Dibujar', onClick: () => goTo(2) }}
        summary={<><b className="text-gray-900">{withPrice.length} lotes con precio</b>{minPrice !== null ? ` · desde ${formatMoney(minPrice)}` : ''}</>}
        primary={{ label: 'Aplicar y terminar →', onClick: apply, busy, busyLabel: 'Aplicando...' }}
      />
    </div>
  );
}

// ─── Listo ─────────────────────────────────────────────────────────

function LoteoListo({ project, tree, goTo, total }: { project: FlowProps['project']; tree: GuidedTree; goTo: (n: number) => void; total: number }) {
  const lots = lotFloor(tree)?.units ?? [];
  const blocks = groupBlocks(lots).filter(g => g.tag).length;
  const drawn = lots.filter(l => (l.polygon?.length ?? 0) >= 3).length;
  const listed = lots.reduce((s, l) => s + (l.price ?? 0), 0);
  const showcase = project.saleMode === 'showcase';

  return (
    <ListoScreen
      project={project}
      eyebrow={`Paso ${total} de ${total}`}
      title="El loteo ya se puede recorrer."
      text={`${lots.length} lotes${drawn < lots.length ? ` (${drawn} dibujados)` : ' dibujados'}${showcase ? '' : ', con superficie, precio y estado'}. Falta la portada para publicar.`}
      stats={[
        { value: formatNumber(lots.length), label: 'lotes' },
        ...(blocks ? [{ value: formatNumber(blocks), label: 'manzanas' }] : []),
        ...(!showcase && listed ? [{ value: formatMoney(listed).replace('USD ', ''), label: 'USD listado' }] : []),
      ]}
      optional={[
        { label: 'Vista aérea con el loteo encima', text: 'Foto de dron + manzanas clicables.', href: '/admin/proyecto' },
        { label: 'Una foto por lote', text: 'Nombrá los archivos "Mz1-L05" y se asignan solos.', href: '/admin/inventory' },
        { label: 'Entorno y servicios', text: 'Luz, agua, accesos y lugares cercanos.', href: '/admin/proyecto/ubicacion' },
        { label: 'Avance de infraestructura', text: 'Calles, redes, alumbrado.', href: '/admin/proyecto/avance' },
        { label: 'Relato', text: 'Por qué vivir o invertir acá.', href: '/admin/sitio' },
      ]}
      hiddenInShowcase="Precios · Estado de venta · Formulario de contacto y leads"
      onBackToStart={() => goTo(2)}
      aside={<PreviewCard project={project} meta={`Loteo · ${lots.length} lotes${project.location ? ` · ${project.location}` : ''}`} />}
    />
  );
}
