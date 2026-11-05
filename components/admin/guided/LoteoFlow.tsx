'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
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
  formatMoney, formatNumber, useGuidedApi, useCanvasUndo, ToolbarUndo,
  type GFloor, type GUnit, type GuidedTree, type UnitDot,
} from './shared';

// Carga guiada · Loteo: plano + numeración → dibujar manzanas y dividirlas
// en lotes → precios por reglas (solo "para vender") → listo.

type Corner = 'NO' | 'NE' | 'SE' | 'SO';
const CORNER_LABEL: Record<Corner, string> = { NO: '↖ esquina NO', NE: '↗ esquina NE', SE: '↘ esquina SE', SO: '↙ esquina SO' };

const STATUS_LABEL: Record<UnitStatus, string> = { available: 'Disponible', reserved: 'Reservado', sold: 'Vendido' };
const STATUS_PILL: Record<UnitStatus, string> = {
  available: 'bg-brand-100 text-brand-800',
  reserved: 'bg-[#F6E9D3] text-[#7A4E12]',
  sold: 'bg-gray-800 text-white',
};

// Colores de manzana del diseño (muestra en la lista y relleno en el plano).
const BLOCK_COLORS = ['#9DB3A5', '#C7B58F', '#A7B4C9', '#C9A79D', '#B3C29D', '#B8A9C6'];
const blockColor = (i: number) => BLOCK_COLORS[Math.max(0, i) % BLOCK_COLORS.length];

/** Paso partido con panel izquierdo de ancho propio (el diseño usa 340–440 según el paso). */
function Split({ panel, children, panelMax, panelBasis, panelLabel }: { panel: ReactNode; children: ReactNode; panelMax: number; panelBasis: number; panelLabel?: string }) {
  return (
    <div className="flex flex-wrap items-stretch flex-1">
      <section aria-label={panelLabel}
        className="min-w-0 px-4 py-8 sm:px-8 sm:py-10 flex flex-col gap-5 bg-gray-50 md:border-r border-b md:border-b-0 border-gray-200 max-md:!max-w-none"
        style={{ flex: `1 1 ${panelBasis}px`, maxWidth: panelMax }}>
        {panel}
      </section>
      <main className="flex-[999_1_520px] min-w-0 px-4 py-8 sm:px-10 sm:py-8 flex flex-col gap-4">
        {children}
      </main>
    </div>
  );
}

/** Marco del plano del diseño: caja beige redondeada. */
const viewerBox = 'relative rounded-[18px] border border-gray-200 bg-[#F7F5EF] overflow-hidden';

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

/** Esquema de manzanas con sus lotes — la vista previa cuando todavía no hay plano subido. */
function BlocksSchematic({ blocks }: { blocks: { name: string; lots: number }[] }) {
  const cols = Math.min(3, Math.max(1, blocks.length));
  return (
    <div className="absolute inset-0 p-[6%] grid gap-[5%]" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gridAutoRows: '1fr' }}>
      {blocks.map((b, i) => {
        const perRow = Math.max(1, Math.ceil(b.lots / 2));
        return (
          <div key={i} className="relative border-2 border-gray-600 flex items-center justify-center min-h-[80px]" style={{ background: `${blockColor(i)}33` }}>
            <div aria-hidden className="absolute inset-0 grid" style={{ gridTemplateColumns: `repeat(${Math.min(perRow, 30)}, minmax(0, 1fr))`, gridTemplateRows: b.lots > 1 ? 'repeat(2, minmax(0, 1fr))' : '1fr' }}>
              {Array.from({ length: Math.min(b.lots, 60) }, (_, k) => <span key={k} className="border-r border-b border-gray-400" />)}
            </div>
            <span className="relative text-[13px] font-bold bg-white px-2 py-[3px] rounded-md">{b.name || `Mz ${i + 1}`}</span>
          </div>
        );
      })}
    </div>
  );
}

function PlanStep({ tree, setTree, goTo, total }: { tree: GuidedTree; setTree: (t: GuidedTree) => void; goTo: (n: number) => void; total: number }) {
  const api = useGuidedApi();
  const floor = lotFloor(tree);
  const [planImage, setPlanImage] = useState('');
  const [changing, setChanging] = useState(false);
  const [mode, setMode] = useState<'blocks' | 'sequential'>('blocks');
  const [blocks, setBlocks] = useState<BlockInput[]>([{ name: 'Mz 1', lots: 20 }, { name: 'Mz 2', lots: 20 }]);
  const [totalLots, setTotalLots] = useState(40);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (floor) {
    const lots = floor.units;
    const groups = groupBlocks(lots);
    return (
      <Split panelMax={440} panelBasis={380} panelLabel="Loteo creado" panel={
        <>
          <StepIntro eyebrow={`Paso 1 de ${total}`} title="El loteo ya está creado">
            Tiene {lots.length} lotes{groups[0]?.tag ? ` en ${groups.length} manzanas` : ''}. Para agregar o renombrar lotes usá la pantalla de estructura; acá seguís con el dibujo y los precios.
          </StepIntro>
          <div className="flex flex-col gap-2">
            {groups.map((g, i) => (
              <div key={g.tag ?? 'all'} className="flex items-center gap-2.5 min-h-[42px] px-3 rounded-[9px] border border-gray-200 bg-white text-[13px]">
                <span aria-hidden className="w-2.5 h-2.5 rounded-[3px]" style={{ background: blockColor(i) }} />
                <span className="flex-1 font-semibold text-gray-900">{g.tag ?? 'Numeración corrida'}</span>
                <span className="text-gray-500">{g.lots.length} lotes</span>
              </div>
            ))}
          </div>
          <Link href="/admin/edificios" className="self-start min-h-[40px] flex items-center text-[13px] font-semibold text-brand-700">Editar la estructura →</Link>
        </>
      }>
        <div className={`${viewerBox} flex-1 min-h-[320px] sm:min-h-[560px] flex items-center justify-center`}>
          {floor.plan_image
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={floor.plan_image} alt="Plano del loteo" className="max-w-full max-h-[640px] object-contain p-6" />
            : <BlocksSchematic blocks={groups.map(g => ({ name: g.tag ?? 'Lotes', lots: g.lots.length }))} />}
        </div>
        <StepFooter title={`${groups[0]?.tag ? `${groups.length} manzanas · ` : ''}${lots.length} lotes`} summary="La estructura ya está creada."
          primary={{ label: 'Seguir con el dibujo', onClick: () => goTo(2) }} />
      </Split>
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
    <Split panelMax={440} panelBasis={380} panelLabel="Plano y numeración" panel={
      <>
        <StepIntro eyebrow={`Paso 1 de ${total}`} title="Subí el plano del loteo">
          Es la base de todo: sobre este plano vas a marcar cada lote y el comprador lo va a recorrer en el sitio.
        </StepIntro>

        {planImage && !changing ? (
          <div className="flex items-center gap-3 p-3.5 rounded-xl border border-gray-200 bg-white">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={planImage} alt="" className="w-[50px] h-[42px] rounded-lg object-cover bg-[#F1EEE8] shrink-0" />
            <span className="flex-1 min-w-0 flex flex-col">
              <span className="text-[13px] font-semibold text-gray-900 truncate">Plano de subdivisión</span>
              <span className="text-xs text-gray-500">Imagen cargada</span>
            </span>
            <button type="button" onClick={() => setChanging(true)}
              className="min-h-[36px] px-2.5 rounded-lg border border-gray-300 bg-white text-xs font-medium text-gray-900 hover:border-gray-400">Cambiar</button>
          </div>
        ) : (
          <ImageUploader value={planImage} onChange={url => { setPlanImage(url); setChanging(false); }} folder="floorplans" label="Plano de subdivisión" />
        )}

        <div className="flex flex-col gap-2.5">
          <span className="text-[13px] font-semibold text-gray-900">¿Cómo están organizados los lotes?</span>
          <div className="grid grid-cols-2 gap-2">
            <ChoiceCard on={mode === 'blocks'} onClick={() => setMode('blocks')} title="Por manzanas" hint="Mz 1 · Lote 01" />
            <ChoiceCard on={mode === 'sequential'} onClick={() => setMode('sequential')} title="Numeración corrida" hint={`Lote 1 a ${totalLots}`} />
          </div>
        </div>

        {mode === 'blocks' ? (
          <div className="flex flex-col gap-2">
            <div className="grid grid-cols-[1fr_100px] sm:grid-cols-[1fr_120px] gap-2 px-1 text-[11px] text-gray-500">
              <span>Manzana</span><span className="text-right">Lotes</span>
            </div>
            {blocks.map((b, i) => (
              <div key={i} className="grid grid-cols-[1fr_100px] sm:grid-cols-[1fr_120px] gap-2 items-center">
                <label className="min-w-0 flex items-center gap-2.5 min-h-[44px] px-3 rounded-[9px] border border-gray-200 bg-white focus-within:border-brand-700">
                  <span aria-hidden className="w-2.5 h-2.5 rounded-[3px] shrink-0" style={{ background: blockColor(i) }} />
                  <span className="sr-only">Nombre de la manzana {i + 1}</span>
                  <input value={b.name}
                    onChange={e => setBlocks(bs => bs.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
                    className="flex-1 min-w-0 bg-transparent outline-none text-[13px] font-semibold text-gray-900" />
                  {blocks.length > 1 && (
                    <button type="button" aria-label={`Quitar ${b.name}`} onClick={() => setBlocks(bs => bs.filter((_, j) => j !== i))}
                      className="w-7 h-7 -mr-1 rounded-md text-gray-400 hover:text-gray-900 hover:bg-gray-100 text-xs">✕</button>
                  )}
                </label>
                <label className="min-w-0">
                  <span className="sr-only">Lotes de {b.name}</span>
                  <input inputMode="numeric" value={b.lots}
                    onChange={e => { const n = Math.min(500, Number(e.target.value.replace(/\D/g, '') || 0)); setBlocks(bs => bs.map((x, j) => (j === i ? { ...x, lots: n } : x))); }}
                    className="w-full min-h-[44px] px-3 rounded-[9px] border border-gray-300 bg-white text-sm text-right text-gray-900 outline-none focus:border-brand-700 focus:ring-2 focus:ring-brand-500/30" />
                </label>
              </div>
            ))}
            <button type="button" onClick={() => setBlocks(bs => [...bs, { name: `Mz ${bs.length + 1}`, lots: 20 }])}
              className="self-start min-h-[40px] px-1 text-[13px] font-semibold text-brand-700">+ Manzana</button>
          </div>
        ) : (
          <NumberStepper label="Cantidad de lotes" value={totalLots} min={1} max={2000} onChange={setTotalLots} />
        )}

        <p className="m-0 text-xs leading-relaxed text-gray-500">
          El loteo se carga como una sola etapa. Si tiene varias, escribinos y lo armamos con vos.
        </p>
      </>
    }>
      <div className={`${viewerBox} flex-1 min-h-[320px] sm:min-h-[600px]`}>
        {planImage
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={planImage} alt="Plano del loteo" className="absolute inset-0 w-full h-full object-contain p-6" />
          : mode === 'blocks'
            ? <BlocksSchematic blocks={blocks} />
            : <div className="absolute inset-0 flex items-center justify-center text-sm text-gray-500">Acá vas a ver el plano</div>}
        <span className="absolute left-4 bottom-4 text-xs px-2.5 py-1.5 rounded-lg bg-white border border-gray-200 text-gray-700">
          {planImage ? 'Plano cargado' : 'Vista previa · subí el plano para ver el real'}
        </span>
      </div>
      <ErrorNote>{error}</ErrorNote>
      <StepFooter
        title={`${mode === 'blocks' ? `${blocks.length} manzana${blocks.length === 1 ? '' : 's'} · ` : ''}${lotCount} lotes`}
        summary="Se crean ahora con su código; los dibujás en el paso siguiente."
        primary={{ label: 'Crear lotes y seguir', onClick: create, disabled: lotCount === 0, busy, busyLabel: 'Creando lotes...' }}
      />
    </Split>
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
  // manzana = contorno + dividir; lote = dibujar un lote suelto; vertices = retocar uno ya dibujado.
  const [tool, setTool] = useState<'manzana' | 'lote' | 'vertices'>('manzana');
  const undoCtl = useCanvasUndo();
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

  const colorFor = (code: string) => blockColor(groups.findIndex(g => g.tag === blockOfCode(code)));

  const shapes: PolygonShape[] = [
    ...lots
      .filter(l => (l.polygon?.length ?? 0) >= 3 && l.id !== editId)
      .map(l => ({ id: l.id, label: l.code.replace(/^Mz\d+-/, ''), points: l.polygon ?? [], color: colorFor(l.code) })),
    ...(tool === 'manzana' && split.length
      ? split.slice(0, targetLots.length).map((s, i) => ({ id: `preview-${i}`, label: targetLots[i]?.code.replace(/^Mz\d+-/, '') ?? '', points: s.points, color: '#6B6A65' }))
      : []),
    ...(tool === 'manzana' ? [{ id: MZ_SHAPE, label: blockTag ?? 'Manzana', points: quad, color: '#17191A' }] : []),
    ...(tool !== 'manzana' && editId ? [{ id: editId, label: lots.find(l => l.id === editId)?.code ?? '', points: editPoints, color: '#37463F' }] : []),
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
    // "Lote suelto" arranca de cero; "Editar vértices" parte de la forma guardada.
    setEditPoints(tool === 'lote' ? [] : (lots.find(l => l.id === id)?.polygon ?? []));
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

  const smallInput = 'w-full min-h-[40px] px-2.5 rounded-lg border border-gray-300 bg-white text-sm text-gray-900 outline-none focus:border-brand-700 focus:ring-2 focus:ring-brand-500/30';
  const toolBtn = (on: boolean) => `shrink-0 min-h-[36px] px-3 rounded-lg text-xs ${on ? 'bg-[#3A3D3B] text-white font-semibold' : 'text-[#C9C6BE] hover:text-white'}`;

  return (
    <Split panelMax={400} panelBasis={340} panelLabel="Manzanas" panel={
      <>
        <StepIntro eyebrow={`Paso 2 de ${total}`} title="Dibujá la manzana, el sistema la divide">
          Marcá el contorno de cada manzana y decí en cuántos lotes se parte. Después ajustás los que sean irregulares.
        </StepIntro>

        {/* En celular las manzanas son chips con scroll horizontal; en desktop, columna. */}
        <nav aria-label="Manzanas" className="flex flex-row md:flex-col gap-1.5 overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0 pb-1 md:pb-0">
          {groups.map((g, i) => {
            const d = g.lots.filter(l => (l.polygon?.length ?? 0) >= 3).length;
            const on = g.tag === blockTag;
            const pct = g.lots.length ? Math.round((d / g.lots.length) * 100) : 0;
            return (
              <button key={g.tag ?? 'all'} type="button" onClick={() => { setBlockTag(g.tag); setQuad([]); setCols(Math.max(1, Math.ceil(g.lots.length / rows))); }}
                aria-pressed={on}
                className={`shrink-0 min-w-[180px] md:min-w-0 flex items-center gap-2.5 min-h-[44px] px-3 rounded-[9px] bg-white text-left ${on ? 'border-[1.5px] border-gray-900' : 'border border-gray-200 hover:border-gray-300'}`}>
                <span aria-hidden className="w-2.5 h-2.5 rounded-[3px] shrink-0" style={{ background: blockColor(i) }} />
                <span className="flex-1 text-[13px] font-semibold text-gray-900">{g.tag ?? 'Todos los lotes'}</span>
                <span aria-hidden className="w-[70px] h-[5px] rounded-[3px] bg-[#EAE7E0] overflow-hidden">
                  <span className="block h-full bg-brand-700" style={{ width: `${pct}%` }} />
                </span>
                <span className="w-11 text-right text-xs text-gray-500">{d}/{g.lots.length}</span>
              </button>
            );
          })}
        </nav>
        <div className="hidden md:flex p-3.5 rounded-xl bg-white border border-gray-200 flex-col gap-1.5">
          <span className="text-xs font-semibold text-gray-900">Lotes en esquina o irregulares</span>
          <span className="text-xs leading-relaxed text-gray-600">Elegí “Lote suelto”, tocá un lote y arrastrá sus vértices. La superficie se recalcula sola con la escala del plano.</span>
        </div>
      </>
    }>
      <div className={`${viewerBox} flex-1 min-h-[420px] sm:min-h-[600px] flex flex-col`}>
        {/* Barra de herramientas flotante (oscura, centrada) */}
        <div className="relative z-10 mx-auto mt-3.5 max-w-[calc(100%-24px)] flex flex-wrap sm:flex-nowrap justify-center sm:w-fit gap-0.5 p-1 rounded-xl bg-gray-900 shadow-[0_8px_24px_rgba(23,25,26,0.25)] sm:overflow-x-auto">
          <button type="button" aria-pressed={tool === 'manzana'} onClick={() => { setTool('manzana'); setEditId(null); }} className={toolBtn(tool === 'manzana')}>Manzana</button>
          <button type="button" aria-pressed={tool === 'lote'} onClick={() => { setTool('lote'); setEditId(null); setEditPoints([]); }} className={toolBtn(tool === 'lote')}>Lote suelto</button>
          <button type="button" aria-pressed={tool === 'vertices'} onClick={() => { setTool('vertices'); setEditId(null); setEditPoints([]); }} className={toolBtn(tool === 'vertices')}>Editar vértices</button>
          {tool !== 'vertices' && (
            <>
              <span aria-hidden className="w-px my-2 mx-1 bg-[#3A3D3B] shrink-0" />
              <button type="button" aria-pressed={drawMode === 'rectangle'} onClick={() => { setDrawMode('rectangle'); if (tool === 'manzana') setQuad([]); else setEditPoints([]); }} className={toolBtn(drawMode === 'rectangle')}>Rectángulo</button>
              <button type="button" aria-pressed={drawMode === 'point'} onClick={() => { setDrawMode('point'); if (tool === 'manzana') setQuad([]); else setEditPoints([]); }} className={toolBtn(drawMode === 'point')}>{tool === 'manzana' ? '4 esquinas' : 'Forma libre'}</button>
            </>
          )}
          {tool !== 'manzana' && (
            <label className="shrink-0 flex items-center">
              <span className="sr-only">{tool === 'lote' ? 'Lote a dibujar' : 'Lote a editar'}</span>
              <select value={editId ?? ''} onChange={e => selectLot(e.target.value)}
                className="min-h-[36px] px-2 rounded-lg bg-[#3A3D3B] text-white text-xs outline-none">
                <option value="">Elegí un lote</option>
                {blockLots
                  .filter(l => tool === 'lote' || (l.polygon?.length ?? 0) >= 3)
                  .map(l => <option key={l.id} value={l.id}>{l.code}{(l.polygon?.length ?? 0) >= 3 ? (tool === 'lote' ? ' (redibujar)' : '') : ' (sin dibujar)'}</option>)}
              </select>
            </label>
          )}
          <ToolbarUndo canUndo={undoCtl.canUndo} undo={undoCtl.undo} />
        </div>

        <div className="flex-1 flex flex-col lg:block gap-3 p-3 sm:p-5 lg:pr-[276px]">
          {floor.plan_image ? (
            <div className="flex flex-col gap-2">
              {tool === 'manzana' && <span className="text-[13px] font-bold text-gray-900">{blockTag ?? 'Lotes'}</span>}
              <PolygonCanvas
                imageUrl={floor.plan_image}
                shapes={shapes}
                activeId={tool === 'manzana' ? MZ_SHAPE : editId}
                mode={tool === 'vertices' ? 'point' : drawMode}
                {...undoCtl.canvasProps}
                onPointsChange={(id, pts) => {
                  if (id === MZ_SHAPE) setQuad(pts);
                  else if (id === editId) setEditPoints(pts);
                }}
              />
              {tool === 'manzana' && quad.length > 0 && quad.length !== 4 && (
                <p className="m-0 text-xs text-amber-800">Marcá exactamente 4 esquinas ({quad.length} marcadas).</p>
              )}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-4 flex flex-col gap-2">
              <p className="m-0 text-sm text-gray-700">Para dibujar los lotes primero subí el plano del loteo.</p>
              <ImageUploader value="" onChange={savePlan} folder="floorplans" label="Plano de subdivisión" />
            </div>
          )}

          {/* Panel de división: tarjeta flotante a la derecha en desktop, debajo del plano en celular. */}
          <aside className="lg:absolute lg:right-4 lg:top-[76px] lg:w-[248px] rounded-[14px] bg-white border border-gray-200 shadow-[0_16px_40px_-12px_rgba(23,25,26,0.3)] p-4 flex flex-col gap-3">
            {tool === 'manzana' ? (
              <>
                <h2 className="m-0 text-sm font-semibold text-gray-900">Dividir {blockTag ?? 'lotes'}</h2>
                <div className="grid grid-cols-2 gap-2">
                  <label className="flex flex-col gap-1">
                    <span className="text-[11px] text-gray-500">Filas</span>
                    <input inputMode="numeric" value={rows} onChange={e => setRows(Math.min(20, Math.max(1, Number(e.target.value.replace(/\D/g, '') || 1))))} className={smallInput} />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-[11px] text-gray-500">Lotes por fila</span>
                    <input inputMode="numeric" value={cols} onChange={e => setCols(Math.min(100, Math.max(1, Number(e.target.value.replace(/\D/g, '') || 1))))} className={smallInput} />
                  </label>
                </div>
                <div className="flex flex-col gap-1.5">
                  <span className="text-[11px] text-gray-500">Numerar desde</span>
                  <label>
                    <span className="sr-only">Esquina de inicio</span>
                    <select value={start} onChange={e => setStart(e.target.value as Corner)} className={`${smallInput} text-xs font-semibold`}>
                      {(Object.keys(CORNER_LABEL) as Corner[]).map(c => <option key={c} value={c}>{CORNER_LABEL[c]}</option>)}
                    </select>
                  </label>
                  <Segmented label="Orden" value={order} onChange={setOrder} options={[{ value: 'rows', label: 'Por filas' }, { value: 'u', label: 'En U' }]} />
                </div>
                <NumberField label="Escala: ancho real del plano" suffix="m" value={scale} onChange={setScale} placeholder="Ej: 600" />
                <p className="m-0 text-xs text-gray-600">
                  {rows * cols} lotes{avgArea ? ` de ~${formatNumber(avgArea)} m² cada uno` : ''}
                  {!sequential && rows * cols !== blockLots.length && (
                    <span className="block text-amber-800 mt-1">{blockTag} tiene {blockLots.length} lotes; se dibujan {Math.min(rows * cols, blockLots.length)}.</span>
                  )}
                  {!scale && <span className="block text-gray-500 mt-1">Sin escala, la superficie la cargás en el paso de precios.</span>}
                </p>
                <ErrorNote>{error}</ErrorNote>
                <button type="button" onClick={divide} disabled={!oriented || busy || targetLots.length === 0}
                  className="min-h-[44px] rounded-[10px] bg-gray-900 text-white text-[13px] font-semibold hover:bg-black disabled:bg-gray-200 disabled:text-gray-400">
                  {busy ? 'Dividiendo...' : 'Dividir'}
                </button>
              </>
            ) : (
              <>
                <h2 className="m-0 text-sm font-semibold text-gray-900">{tool === 'lote' ? 'Lote suelto' : 'Editar vértices'}</h2>
                <p className="m-0 text-xs text-gray-600 leading-relaxed">
                  {tool === 'lote'
                    ? 'Elegí el lote arriba y dibujalo sobre el plano, como rectángulo o punto por punto.'
                    : 'Elegí un lote dibujado: arrastrá un vértice para moverlo, tocá el plano para agregar uno, doble clic sobre un vértice lo borra.'}
                </p>
                <NumberField label="Escala: ancho real del plano" suffix="m" value={scale} onChange={setScale} placeholder="Ej: 600" />
                {editId && editPoints.length >= 3 && areaOf(editPoints) && (
                  <p className="m-0 text-xs text-gray-700">Superficie: {formatNumber(areaOf(editPoints))} m²</p>
                )}
                <button type="button" onClick={saveLot} disabled={!editId || editPoints.length < 3 || busy}
                  className="min-h-[44px] rounded-[10px] bg-gray-900 text-white text-[13px] font-semibold hover:bg-black disabled:bg-gray-200 disabled:text-gray-400">
                  {busy ? 'Guardando...' : 'Guardar lote'}
                </button>
              </>
            )}
          </aside>
        </div>
      </div>

      <StepFooter
        back={{ label: 'Plano', onClick: () => goTo(1) }}
        summary={`${drawn} de ${lots.length} lotes dibujados`}
        primary={{ label: 'Seguir', onClick: () => goTo(3) }}
      />
    </Split>
  );
}

// ─── Paso 3 · Precios ──────────────────────────────────────────────

/** Ajuste de precio con su check de prendido/apagado (solo los prendidos se aplican). */
type RuleRow = PriceRule & { on: boolean };

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
  // Los 3 ejemplos del diseño vienen cargados; solo "esquina" arranca prendido.
  const [rules, setRules] = useState<RuleRow[]>(() => [
    { id: 'r1', label: 'Lotes en esquina', pct: 10, target: 'corner', on: true },
    ...(blockTags.length >= 2
      ? [{ id: 'r2', label: `Frente a la laguna (${blockTags.slice(-2).join(' y ')})`, pct: 18, target: 'blocks' as const, blocks: blockTags.slice(-2), on: false }]
      : []),
    { id: 'r3', label: 'Lanzamiento · primeros 20', pct: -5, target: 'first', first: 20, on: false },
  ]);
  const activeRules = rules.filter(r => r.on);
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
    const priced = priceForLot({ id: u.id, code: u.code, area, corner: u.features.includes('esquina'), block: blockOfCode(u.code), index }, base ?? 0, activeRules);
    const override = overrides[u.id];
    const price = override !== undefined && override !== null ? override
      : pastedMap.get(u.code) ?? priced.price ?? u.price;
    return { u, area, pct: priced.pct, price, status: statuses[u.id] ?? u.status };
  });
  const visible = rowsAll.filter(r => blockOfCode(r.u.code) === tab);
  const withPrice = rowsAll.filter(r => r.price !== null && r.price !== undefined);
  const minPrice = withPrice.length ? Math.min(...withPrice.map(r => r.price as number)) : null;
  const blockTotal = visible.reduce((s, r) => s + (r.price ?? 0), 0);

  const updateRule = (id: string, patch: Partial<RuleRow>) => setRules(rs => rs.map(r => (r.id === id ? { ...r, ...patch } : r)));

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

  const cellInput = 'bg-transparent outline-none rounded-md border border-transparent hover:border-gray-200 focus:border-brand-700 focus:bg-white tabular-nums';

  return (
    <Split panelMax={420} panelBasis={360} panelLabel="Reglas de precio" panel={
      <>
        <StepIntro eyebrow="Paso 3 de 4" title="Poné precio con reglas, no lote por lote">
          Las superficies salen del dibujo. Definí un precio por m² y los ajustes; los precios se calculan solos y podés retocar cualquiera.
        </StepIntro>

        <label className="flex flex-col gap-1.5">
          <FieldLabel>Precio base por m²</FieldLabel>
          <span className="flex items-center min-h-[48px] rounded-[10px] border-[1.5px] border-brand-700 bg-white shadow-[0_0_0_4px_rgba(55,70,63,0.1)]">
            <span className="pl-3.5 text-[13px] font-semibold text-gray-900">USD</span>
            <input inputMode="decimal" value={base ?? ''} placeholder="Ej: 85"
              onChange={e => { const raw = e.target.value.replace(/[^\d.,]/g, '').replace(',', '.'); setBase(raw === '' ? null : Number(raw)); }}
              className="flex-1 min-w-0 px-3 bg-transparent outline-none font-display text-xl font-semibold text-gray-900 placeholder:text-gray-400" />
            <span className="pr-3.5 text-xs text-gray-500">/ m²</span>
          </span>
        </label>

        <div className="flex flex-col gap-2">
          <FieldLabel>Ajustes</FieldLabel>
          {rules.map(r => (
            <div key={r.id} className={`flex flex-col gap-2 px-3 py-2 rounded-[10px] bg-white border ${r.on ? 'border-gray-200' : 'border-gray-200 opacity-70'}`}>
              <div className="flex items-center gap-2 min-h-[32px]">
                <input type="checkbox" checked={r.on} onChange={e => updateRule(r.id, { on: e.target.checked })}
                  aria-label={`Aplicar ${r.label}`} className="w-[18px] h-[18px] shrink-0 accent-[#37463F]" />
                <input aria-label="Nombre del ajuste" value={r.label} onChange={e => updateRule(r.id, { label: e.target.value })}
                  className="flex-1 min-w-0 bg-transparent outline-none text-[13px] text-gray-900 rounded px-1 -mx-1 focus:bg-gray-50" />
                <label className="flex items-center gap-0.5">
                  <span className="sr-only">Porcentaje de {r.label}</span>
                  <input inputMode="decimal" value={r.pct > 0 ? `+${r.pct}` : String(r.pct)}
                    onChange={e => { const n = Number(e.target.value.replace('+', '').replace(',', '.')); if (Number.isFinite(n) || e.target.value === '-') updateRule(r.id, { pct: Number.isFinite(n) ? n : 0 }); }}
                    className="w-12 bg-transparent outline-none text-[13px] font-semibold text-right text-gray-900 rounded focus:bg-gray-50" />
                  <span className="text-[13px] font-semibold text-gray-900">%</span>
                </label>
                <button type="button" aria-label={`Quitar ${r.label}`} onClick={() => setRules(rs => rs.filter(x => x.id !== r.id))}
                  className="w-8 h-8 -mr-1 rounded-md text-xs text-gray-400 hover:text-gray-900 hover:bg-gray-100">✕</button>
              </div>
              <div className="flex items-center gap-2 flex-wrap pb-1">
                <select aria-label="A qué lotes aplica" value={r.target} onChange={e => updateRule(r.id, { target: e.target.value as PriceRule['target'] })}
                  className="min-h-[32px] px-2 rounded-md border border-gray-200 bg-gray-50 text-xs text-gray-700 outline-none">
                  {RULE_TARGETS.filter(t => t.value !== 'blocks' || blockTags.length > 0).map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
                {r.target === 'first' && (
                  <label className="flex items-center gap-1.5 text-xs text-gray-600">
                    <input inputMode="numeric" value={r.first ?? 20} aria-label="Cantidad de lotes"
                      onChange={e => updateRule(r.id, { first: Math.max(1, Number(e.target.value.replace(/\D/g, '') || 1)) })}
                      className="w-14 min-h-[32px] px-2 rounded-md border border-gray-200 text-xs text-right outline-none" />
                    lotes
                  </label>
                )}
                {r.target === 'blocks' && blockTags.map(t => {
                  const on = (r.blocks ?? []).includes(t);
                  return (
                    <button key={t} type="button" aria-pressed={on}
                      onClick={() => updateRule(r.id, { blocks: on ? (r.blocks ?? []).filter(b => b !== t) : [...(r.blocks ?? []), t] })}
                      className={`min-h-[30px] px-2.5 rounded-full text-[11px] ${on ? 'bg-gray-900 text-white font-semibold' : 'bg-white border border-gray-200 text-gray-600'}`}>{t}</button>
                  );
                })}
              </div>
            </div>
          ))}
          <button type="button" onClick={() => setRules(rs => [...rs, { id: `r${Date.now()}`, label: 'Ajuste', pct: 5, target: 'first', first: 20, on: true }])}
            className="self-start min-h-[36px] px-1 text-[13px] font-semibold text-brand-700">+ Ajuste</button>
        </div>

        <div className="flex flex-col gap-2">
          <button type="button" onClick={() => setPasteOpen(o => !o)} aria-expanded={pasteOpen}
            className="min-h-[44px] rounded-[10px] border-[1.5px] border-dashed border-[#C9C3B7] text-[13px] font-semibold text-gray-900 hover:border-gray-400">
            O pegá tu lista de precios desde Excel
          </button>
          {pasteOpen && (
            <label className="flex flex-col gap-1.5">
              <FieldLabel>Una fila por lote: código y precio ({pastedMap.size} reconocidos)</FieldLabel>
              <textarea value={pasted} onChange={e => setPasted(e.target.value)} rows={6}
                placeholder={'Mz1-L01\t25500\nMz1-L02\t26800'}
                className="p-3 rounded-[10px] border border-gray-300 bg-white text-sm font-mono outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-700" />
            </label>
          )}
        </div>
      </>
    }>
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <h2 className="m-0 text-[15px] font-semibold text-gray-900">
          {tab ?? 'Lotes'} <span className="font-normal text-gray-500">· {visible.length || rowsAll.length} lotes · {formatMoney(tab ? blockTotal : rowsAll.reduce((s, r) => s + (r.price ?? 0), 0))} en total</span>
        </h2>
        {blockTags.length > 0 && (
          <div role="tablist" aria-label="Manzana" className="flex gap-1.5 max-w-full overflow-x-auto pb-1">
            {blockTags.map(t => (
              <button key={t} type="button" role="tab" aria-selected={t === tab} onClick={() => setTab(t)}
                className={`shrink-0 min-h-[36px] px-3 rounded-full text-xs ${t === tab ? 'bg-gray-900 text-white font-semibold' : 'bg-white border border-gray-200 text-gray-900 hover:border-gray-300'}`}>{t}</button>
            ))}
          </div>
        )}
      </div>
      {/* Tabla en desktop; en celular cada fila se apila como tarjeta (código y ajuste arriba, superficie/precio, estado). */}
      <div className="rounded-[14px] border border-gray-200 bg-white overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[13px] border-collapse sm:min-w-[640px] max-sm:block">
            <thead className="max-sm:hidden">
              <tr className="text-left text-[11px] uppercase tracking-[0.06em] text-gray-500">
                <th className="font-semibold px-4 py-3 border-b border-gray-200">Lote</th>
                <th className="font-semibold px-2 py-3 border-b border-gray-200 text-right">Superficie</th>
                <th className="font-semibold px-2 py-3 border-b border-gray-200">Ajuste</th>
                <th className="font-semibold px-2 py-3 border-b border-gray-200 text-right">Precio USD</th>
                <th className="font-semibold pl-2 pr-4 py-3 border-b border-gray-200">Estado</th>
              </tr>
            </thead>
            <tbody className="max-sm:block">
              {(tab ? visible : rowsAll).map(r => (
                <tr key={r.u.id} className="max-sm:grid max-sm:grid-cols-2 max-sm:gap-x-3 max-sm:gap-y-2 max-sm:p-3 max-sm:border-b max-sm:border-[#F0EDE7]">
                  <td className="px-4 h-[46px] max-sm:h-auto max-sm:p-0 border-b border-[#F0EDE7] max-sm:border-0 font-semibold text-gray-900 whitespace-nowrap max-sm:self-center">
                    {r.u.code}{r.u.features.includes('esquina') && <span className="ml-1.5 text-[10.5px] font-normal text-gray-500">esquina</span>}
                  </td>
                  <td className="px-2 border-b border-[#F0EDE7] max-sm:border-0 max-sm:p-0 max-sm:order-3 text-right max-sm:text-left">
                    <span className="sm:hidden block text-[11px] text-gray-500 mb-1">Superficie</span>
                    <span className="inline-flex items-center gap-1 justify-end text-gray-600 max-sm:w-full">
                      <input aria-label={`Superficie de ${r.u.code}`} inputMode="decimal" value={r.area ?? ''} placeholder="—"
                        onChange={e => { const v = e.target.value.replace(/[^\d.]/g, ''); setAreas(a => ({ ...a, [r.u.id]: v === '' ? null : Number(v) })); }}
                        className={`${cellInput} w-16 max-sm:flex-1 max-sm:min-w-0 h-9 max-sm:h-11 px-1.5 text-right max-sm:text-left max-sm:border-gray-200 text-gray-600`} />
                      <span>m²</span>
                    </span>
                  </td>
                  <td className="px-2 border-b border-[#F0EDE7] max-sm:border-0 max-sm:p-0 max-sm:order-2 max-sm:text-right max-sm:self-center">
                    {r.pct
                      ? <span className={`text-[11px] px-2 py-[3px] rounded-md ${r.pct > 0 ? 'bg-[#E6E9F0] text-[#2F3A52] font-semibold' : 'bg-gray-100 text-gray-600'}`}>{r.pct > 0 ? '+' : ''}{r.pct} %</span>
                      : <span className="text-gray-400">—</span>}
                  </td>
                  <td className="px-2 border-b border-[#F0EDE7] max-sm:border-0 max-sm:p-0 max-sm:order-4 text-right max-sm:text-left">
                    <span className="sm:hidden block text-[11px] text-gray-500 mb-1">Precio USD</span>
                    <input aria-label={`Precio de ${r.u.code}`} inputMode="numeric" value={r.price ?? ''} placeholder="—"
                      onChange={e => { const v = e.target.value.replace(/\D/g, ''); setOverrides(o => ({ ...o, [r.u.id]: v === '' ? null : Number(v) })); }}
                      className={`${cellInput} w-28 max-sm:w-full h-9 max-sm:h-11 px-1.5 text-right max-sm:text-left max-sm:border-gray-200 font-semibold text-gray-900`} />
                  </td>
                  <td className="pl-2 pr-4 border-b border-[#F0EDE7] max-sm:border-0 max-sm:p-0 max-sm:order-5 max-sm:col-span-2">
                    <label className="sr-only" htmlFor={`st-${r.u.id}`}>Estado de {r.u.code}</label>
                    <select id={`st-${r.u.id}`} value={r.status} onChange={e => setStatuses(s => ({ ...s, [r.u.id]: e.target.value as UnitStatus }))}
                      className={`min-h-[28px] max-sm:min-h-[44px] max-sm:w-full px-2.5 rounded-full max-sm:rounded-lg text-xs font-semibold outline-none appearance-none cursor-pointer ${STATUS_PILL[r.status]}`}>
                      {(Object.keys(STATUS_LABEL) as UnitStatus[]).map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <ErrorNote>{error}</ErrorNote>
      <div className="mt-auto">
        <StepFooter
          back={{ label: 'Dibujar', onClick: () => goTo(2) }}
          summary={`${withPrice.length} lotes con precio${minPrice !== null ? ` · desde ${formatMoney(minPrice)}` : ''}`}
          primary={{ label: 'Aplicar y terminar', onClick: apply, busy, busyLabel: 'Aplicando...' }}
        />
      </div>
    </Split>
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
      // En el diseño la vista aérea va al lado de la portada, en la fila destacada.
      required={[{
        key: 'aerea', title: 'Vista aérea con el loteo encima', text: 'Foto de dron + manzanas clicables', href: '/admin/proyecto/galeria',
        icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M3 3h18v18H3zM3 9h18M3 15h18M9 3v18M15 3v18" /></svg>,
      }]}
      optional={[
        { label: 'Una foto por lote', text: 'Nombrá los archivos "Mz1-L05" y se asignan solos.', href: '/admin/inventory' },
        { label: 'Entorno y servicios', text: 'Luz, agua, accesos y lugares cercanos.', href: '/admin/proyecto/entorno' },
        { label: 'Avance de infraestructura', text: 'Calles, redes, alumbrado.', href: '/admin/proyecto/avance' },
        { label: 'Relato', text: 'Por qué vivir o invertir acá.', href: '/admin/proyecto/relato' },
      ]}
      hiddenInShowcase="Precios · Estado de venta · Formulario de contacto y leads"
      onBackToStart={() => goTo(2)}
      // El diseño de "para vender" no lleva columna lateral; en "solo para mostrar" va la vista del portfolio.
      aside={showcase ? <PreviewCard project={project} meta={`Loteo · ${lots.length} lotes${project.location ? ` · ${project.location}` : ''}`} /> : undefined}
    />
  );
}
