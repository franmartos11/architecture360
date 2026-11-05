'use client';

import { useMemo, useState } from 'react';
import { TransitionLink as Link } from '@/components/ui/TransitionUtils';
import ImageUploader from '@/components/admin/ImageUploader';
import BulkImageUploader from '@/components/admin/BulkImageUploader';
import MultiImageUploader from '@/components/admin/MultiImageUploader';
import PolygonCanvas, { type PolygonShape } from '@/components/admin/PolygonCanvas';
import { useToast } from '@/components/ui/ToastProvider';
import { centroid, type Pt } from '@/lib/guided-structure';
import type { FlowProps } from './GuidedLoad';
import ListoScreen from './ListoScreen';
import {
  ErrorNote, GuidedHeader, Segmented, SplitLayout, StepFooter, StepIntro, useGuidedApi,
  type GFloor, type GuidedTree, type UnitDot,
} from './shared';

// Carga guiada · Proyecto único (escuela, museo, biblioteca, interiorismo):
// siempre "solo para mostrar". Niveles con su planta → espacios marcados
// en cada planta con fotos → listo.

const STEPS = [{ label: 'Niveles' }, { label: 'Espacios' }, { label: 'Listo' }];

interface LevelDraft { key: string; name: string; use: string; planImage: string }

function levelsOf(tree: GuidedTree): GFloor[] {
  return [...(tree.buildings[0]?.floors ?? [])].sort((a, b) => b.number - a.number);
}

export default function UnicoFlow({ project, tree, setTree, reload, step, goTo }: FlowProps) {
  const hasStructure = tree.buildings.length > 0;
  let current = step ?? (hasStructure ? 2 : 1);
  if (!hasStructure) current = 1;
  current = Math.min(Math.max(1, current), STEPS.length);

  return (
    <>
      <GuidedHeader project={project} kindLabel="Proyecto único" steps={STEPS} current={current} onStep={goTo} canGoTo={n => n === 1 || hasStructure} />
      {current === 1 && <LevelsStep tree={tree} setTree={setTree} goTo={goTo} />}
      {current === 2 && <SpacesStep tree={tree} reload={reload} goTo={goTo} />}
      {current === 3 && <UnicoListo project={project} tree={tree} goTo={goTo} />}
    </>
  );
}

// ─── Paso 1 · Niveles ──────────────────────────────────────────────

let keySeq = 0;
const newKey = () => `lvl-${++keySeq}`;

// Colores de los espacios sobre la planta (tonos suaves del diseño).
const SPACE_FILLS = ['#C9D3CD', '#E8D9C4', '#CDD4E0', '#E5D7D0', '#D9DFCB', '#DCD3E0'];
const fillOf = (i: number) => SPACE_FILLS[i % SPACE_FILLS.length];
const SPACE_STROKES = ['#6E8577', '#A68B62', '#7A88A3', '#A67F72', '#879866', '#8F7D9C'];
const strokeOf = (i: number) => SPACE_STROKES[i % SPACE_STROKES.length];

/**
 * Corte del edificio (diseño "así lo navega el visitante"): un bloque por
 * nivel, de arriba hacia abajo. Planta baja en verde oscuro, lo que está
 * debajo (subsuelos) en un beige más oscuro, y el terreno rayado al pie.
 */
function SectionPreview({ levels }: { levels: { key: string; name: string; use: string }[] }) {
  const pbIndex = levels.findIndex(l => /planta baja|^pb$/i.test(l.name.trim()));
  return (
    <div className="w-full max-w-[520px] flex flex-col gap-1.5">
      {levels.map((l, i) => {
        const isPb = i === pbIndex;
        const below = pbIndex >= 0 && i > pbIndex;
        const top = i === 0 && levels.length > 1;
        return (
          <div key={l.key}
            className={`flex items-center justify-between gap-3 min-h-[56px] px-4 rounded-[4px] ${isPb ? 'bg-brand-700 text-white' : below ? 'bg-[#D6D1C7] text-gray-900' : 'bg-[#EAE7E0] text-gray-900'}`}
            style={{ width: top ? '70%' : '100%' }}>
            <span className="text-[13px] font-semibold truncate">{l.name || '[Nivel]'}</span>
            <span className="text-xs opacity-80 truncate">{l.use || 'Sin uso'}</span>
          </div>
        );
      })}
      <div aria-hidden className="h-2 mt-1" style={{ background: 'repeating-linear-gradient(135deg, #9A968D 0 4px, transparent 4px 8px)' }} />
    </div>
  );
}

function LevelsStep({ tree, setTree, goTo }: { tree: GuidedTree; setTree: (t: GuidedTree) => void; goTo: (n: number) => void }) {
  const api = useGuidedApi();
  const existing = levelsOf(tree);
  const [levels, setLevels] = useState<LevelDraft[]>(() =>
    ['Terraza', 'Nivel 2', 'Nivel 1', 'Planta baja'].map(name => ({ key: newKey(), name, use: '', planImage: '' })));
  const [openPlan, setOpenPlan] = useState<string | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (existing.length > 0) {
    const withPlan = existing.filter(f => f.plan_image).length;
    return (
      <SplitLayout panelLabel="Niveles" mainLabel="Corte" panel={
        <>
          <StepIntro eyebrow="Paso 1 de 3 · Solo para mostrar" title="Los niveles ya están creados">
            Para agregar, renombrar o reordenar niveles usá la pantalla de estructura; acá seguís con los espacios.
          </StepIntro>
          <div className="flex flex-col gap-2">
            {existing.map(f => (
              <div key={f.id} className="flex items-center gap-2.5 min-h-[60px] px-3 py-2 rounded-xl border border-gray-200 bg-white">
                <span className="flex-1 min-w-0 flex flex-col gap-0.5">
                  <span className="text-[10px] text-gray-500">Nivel</span>
                  <span className="text-sm font-semibold text-gray-900 truncate">{f.label}</span>
                </span>
                <span className="flex-1 min-w-0 flex flex-col gap-0.5">
                  <span className="text-[10px] text-gray-500">Uso principal</span>
                  <span className="text-[13px] text-gray-900 truncate">{f.floor_kind_description || '—'}</span>
                </span>
                <span className={`shrink-0 text-[11px] font-semibold px-2.5 py-1.5 rounded-lg ${f.plan_image ? 'bg-brand-100 text-brand-800' : 'border-[1.5px] border-dashed border-[#C9C3B7] text-gray-600'}`}>
                  {f.plan_image ? 'Planta ✓' : 'Sin planta'}
                </span>
              </div>
            ))}
          </div>
          <Link href="/admin/edificios" className="self-start min-h-[40px] flex items-center text-[13px] font-semibold text-brand-700">Editar la estructura →</Link>
        </>
      }>
        <h2 className="m-0 text-[15px] font-semibold text-gray-900">Corte <span className="font-normal text-gray-500">— así lo navega el visitante</span></h2>
        <div className="flex-1 flex items-center justify-center p-6 sm:p-8 rounded-[18px] bg-white border border-gray-200 min-h-[320px] sm:min-h-[480px]">
          <SectionPreview levels={existing.map(f => ({ key: f.id, name: f.label, use: f.floor_kind_description ?? '' }))} />
        </div>
        <StepFooter title={`${existing.length} niveles · ${withPlan} planta${withPlan === 1 ? '' : 's'} cargada${withPlan === 1 ? '' : 's'}`}
          summary="Sin precios, estados ni leads: es un proyecto para mostrar."
          primary={{ label: 'Seguir con los espacios', onClick: () => goTo(2) }} />
      </SplitLayout>
    );
  }

  const update = (key: string, patch: Partial<LevelDraft>) => setLevels(ls => ls.map(l => (l.key === key ? { ...l, ...patch } : l)));
  const move = (i: number, dir: -1 | 1) => setLevels(ls => {
    const j = i + dir;
    if (j < 0 || j >= ls.length) return ls;
    const next = [...ls];
    [next[i], next[j]] = [next[j], next[i]];
    return next;
  });
  const withPlan = levels.filter(l => l.planImage).length;

  const create = async () => {
    setError('');
    setBusy(true);
    const res = await api.create({
      kind: 'unico',
      levels: levels.map(l => ({ name: l.name, use: l.use, planImage: l.planImage || null })),
    });
    setBusy(false);
    if (!res.ok) { setError(res.error); return; }
    setTree({ buildings: res.data.buildings });
    goTo(2);
  };

  const orderBtn = 'w-6 h-5 flex items-center justify-center rounded text-[10px] text-gray-400 hover:text-gray-900 hover:bg-gray-100 disabled:opacity-30 disabled:hover:bg-transparent';

  return (
    <SplitLayout panelLabel="Niveles" mainLabel="Corte" panel={
      <>
        <StepIntro eyebrow="Paso 1 de 3 · Solo para mostrar" title="¿Qué niveles tiene el edificio?">
          Escuela, museo, biblioteca o interiorismo: no hay unidades en venta, hay espacios. Nombrá cada nivel y soltá su planta.
        </StepIntro>

        <div className="flex flex-col gap-2">
          {levels.map((l, i) => (
            <div key={l.key} className="group rounded-xl border border-gray-200 bg-white">
              <div className="flex items-center gap-2.5 min-h-[60px] py-2 pl-1.5 pr-2.5 flex-wrap sm:flex-nowrap">
                {/* Reordenar (en el diseño es un asa de arrastre). */}
                <span className="flex flex-col shrink-0">
                  <button type="button" aria-label={`Subir ${l.name}`} disabled={i === 0} onClick={() => move(i, -1)} className={orderBtn}>▲</button>
                  <button type="button" aria-label={`Bajar ${l.name}`} disabled={i === levels.length - 1} onClick={() => move(i, 1)} className={orderBtn}>▼</button>
                </span>
                <label className="flex-[1_1_110px] min-w-0 flex flex-col gap-0.5">
                  <span className="text-[10px] text-gray-500">Nivel</span>
                  <input value={l.name} onChange={e => update(l.key, { name: e.target.value })}
                    className="min-w-0 bg-transparent outline-none text-sm font-semibold text-gray-900 rounded focus:bg-gray-50" />
                </label>
                <label className="flex-[1_1_130px] min-w-0 flex flex-col gap-0.5">
                  <span className="text-[10px] text-gray-500">Uso principal</span>
                  <input value={l.use} placeholder="Ej: Sala de lectura" onChange={e => update(l.key, { use: e.target.value })}
                    className="min-w-0 bg-transparent outline-none text-[13px] text-gray-900 placeholder:text-gray-400 rounded focus:bg-gray-50" />
                </label>
                <span className="flex items-center gap-1 shrink-0 ml-auto">
                  <button type="button" onClick={() => setOpenPlan(o => (o === l.key ? null : l.key))} aria-expanded={openPlan === l.key}
                    className={`min-h-[32px] text-[11px] font-semibold px-2.5 rounded-lg ${l.planImage ? 'bg-brand-100 text-brand-800' : 'border-[1.5px] border-dashed border-[#C9C3B7] text-gray-600 hover:border-gray-400'}`}>
                    {l.planImage ? 'Planta ✓' : '+ Planta'}
                  </button>
                  <button type="button" aria-label={`Quitar ${l.name}`} disabled={levels.length <= 1}
                    onClick={() => setLevels(ls => ls.filter(x => x.key !== l.key))}
                    className="w-7 h-8 rounded-md text-xs text-gray-400 hover:text-gray-900 hover:bg-gray-100 disabled:!opacity-30 sm:opacity-0 sm:group-hover:opacity-100 sm:focus:opacity-100">✕</button>
                </span>
              </div>
              {openPlan === l.key && (
                <div className="px-3 pb-3 pt-1 border-t border-[#F0EDE7]">
                  <ImageUploader value={l.planImage} onChange={url => update(l.key, { planImage: url })} folder="floorplans" label={`Planta de ${l.name}`} />
                </div>
              )}
            </div>
          ))}
          <button type="button" onClick={() => setLevels(ls => [{ key: newKey(), name: `Nivel ${ls.length}`, use: '', planImage: '' }, ...ls])}
            className="self-start min-h-[36px] px-1 text-[13px] font-semibold text-brand-700">+ Nivel</button>
        </div>

        <div className="flex flex-col gap-2">
          <button type="button" onClick={() => setBulkOpen(o => !o)} aria-expanded={bulkOpen}
            className="min-h-[48px] rounded-xl border-[1.5px] border-dashed border-[#C9C3B7] text-[13px] font-semibold text-gray-900 hover:border-gray-400">
            Soltar todas las plantas juntas
          </button>
          {bulkOpen && (
            <BulkImageUploader
              folder="floorplans"
              hint="Se asignan en orden, de arriba hacia abajo, a los niveles que todavía no tienen planta."
              onComplete={results => setLevels(ls => {
                const queue = [...results];
                return ls.map(l => (l.planImage || queue.length === 0 ? l : { ...l, planImage: queue.shift()!.url }));
              })}
            />
          )}
        </div>
      </>
    }>
      <h2 className="m-0 text-[15px] font-semibold text-gray-900">Corte <span className="font-normal text-gray-500">— así lo navega el visitante</span></h2>
      <div className="flex-1 flex items-center justify-center p-6 sm:p-8 rounded-[18px] bg-white border border-gray-200 min-h-[320px] sm:min-h-[480px]">
        <SectionPreview levels={levels} />
      </div>
      <ErrorNote>{error}</ErrorNote>
      <StepFooter
        title={`${levels.length} niveles · ${withPlan} planta${withPlan === 1 ? '' : 's'} cargada${withPlan === 1 ? '' : 's'}`}
        summary="Sin precios, estados ni leads: es un proyecto para mostrar."
        primary={{ label: 'Seguir con los espacios', onClick: create, disabled: levels.length === 0 || levels.some(l => !l.name.trim()), busy, busyLabel: 'Creando niveles...' }}
      />
    </SplitLayout>
  );
}

// ─── Paso 2 · Espacios ─────────────────────────────────────────────

function SpacesStep({ tree, reload, goTo }: { tree: GuidedTree; reload: () => Promise<void>; goTo: (n: number) => void }) {
  const api = useGuidedApi();
  const toast = useToast();
  const levels = useMemo(() => levelsOf(tree), [tree]);
  const [floorId, setFloorId] = useState<string | null>(() => levels.find(f => f.number === 0)?.id ?? levels[0]?.id ?? null);
  const floor = levels.find(f => f.id === floorId) ?? levels[0] ?? null;
  const [newName, setNewName] = useState('');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [points, setPoints] = useState<Record<string, Pt[]>>({});
  const [photos, setPhotos] = useState<Record<string, string[]>>({});
  const [mode, setMode] = useState<'rectangle' | 'point'>('rectangle');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const spaces = floor?.units ?? [];
  const active = spaces.find(s => s.id === activeId) ?? null;
  const pointsOf = (id: string) => points[id] ?? spaces.find(s => s.id === id)?.polygon ?? [];
  const photosOf = (id: string) => photos[id] ?? spaces.find(s => s.id === id)?.gallery_images ?? [];

  const totalSpaces = levels.reduce((s, f) => s + f.units.length, 0);
  const withPhotos = levels.reduce((s, f) => s + f.units.filter(u => u.gallery_images.length > 0).length, 0);

  const shapes: PolygonShape[] = spaces.map((s, i) => ({ id: s.id, label: s.code, points: pointsOf(s.id), color: strokeOf(i) }));

  const addSpace = async () => {
    const name = newName.trim();
    if (!floor || !name) return;
    setError('');
    setBusy(true);
    const res = await api.create<{ units: { id: string }[] }>({ kind: 'spaces', floorId: floor.id, spaces: [{ code: name, type: floor.floor_kind_description || 'Espacio' }] });
    setBusy(false);
    if (!res.ok) { setError(res.error); return; }
    setNewName('');
    await reload();
    if (res.data.units[0]) setActiveId(res.data.units[0].id);
  };

  const savePlan = async (url: string) => {
    if (!floor) return;
    const res = await api.patch({ floors: [{ id: floor.id, planImage: url }] });
    if (!res.ok) { toast(res.error, 'error'); return; }
    await reload();
  };

  const saveSpace = async () => {
    if (!floor || !active) return;
    setBusy(true);
    const pts = pointsOf(active.id);
    const dots: UnitDot[] = [
      ...floor.unit_dots.filter(d => d.unitId !== active.code),
      ...(pts.length >= 3 ? [{ unitId: active.code, ...centroid(pts) }] : []),
    ];
    const res = await api.patch({
      units: [{ id: active.id, polygon: pts.length >= 3 ? pts : null, galleryImages: photosOf(active.id) }],
      floors: [{ id: floor.id, unitDots: dots }],
    });
    setBusy(false);
    if (!res.ok) { toast(res.error, 'error'); return; }
    toast(`${active.code} guardado.`);
    await reload();
  };

  if (!floor) return null;

  return (
    <div className="flex flex-wrap items-stretch flex-1">
      {/* Niveles: columna clara a la izquierda; en celular, chips con scroll horizontal. */}
      <nav aria-label="Niveles"
        className="md:flex-[0_1_200px] md:min-w-[180px] w-full md:w-auto min-w-0 px-4 py-4 md:px-4 md:py-10 bg-gray-50 border-b md:border-b-0 md:border-r border-gray-200 flex flex-row md:flex-col gap-1.5 overflow-x-auto">
        <span className="hidden md:block text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-500 px-2 pb-1.5">Niveles</span>
        {levels.map(f => {
          const on = f.id === floor.id;
          return (
            <button key={f.id} type="button" aria-pressed={on} onClick={() => { setFloorId(f.id); setActiveId(null); }}
              className={`shrink-0 flex items-center justify-between gap-3 min-h-[44px] px-3 rounded-[9px] text-left text-[13px] font-semibold ${on ? 'bg-gray-900 text-white' : 'bg-white border border-gray-200 text-gray-900 hover:border-gray-300'}`}>
              <span className="truncate">{f.label}</span>
              <span className="text-[11px] opacity-75">{f.units.length}</span>
            </button>
          );
        })}
      </nav>

      <main className="flex-[999_1_560px] min-w-0 px-4 py-8 sm:p-10 flex flex-col gap-5">
        <div className="max-w-[640px]">
          <StepIntro eyebrow={`Paso 2 de 3 · ${floor.label}`} title="Los espacios que cuentan el proyecto">
            Nombrá cada espacio, marcalo en la planta y sumale fotos. Es lo que el visitante recorre en vez de unidades.
          </StepIntro>
        </div>

        <div className="flex gap-[18px] flex-wrap items-start flex-1">
          {/* Planta */}
          <div className="flex-[1_1_360px] min-w-0 rounded-2xl border border-gray-200 bg-white overflow-hidden flex flex-col">
            {floor.plan_image ? (
              <>
                <div className="flex items-center justify-between gap-2 flex-wrap px-4 pt-4">
                  <span className="text-xs text-gray-500">{active ? <>Marcando <b className="text-gray-900">{active.code}</b></> : 'Elegí un espacio para marcarlo'}</span>
                  <Segmented fit label="Forma" value={mode} onChange={setMode} options={[{ value: 'rectangle', label: 'Rectángulo' }, { value: 'point', label: 'Forma libre' }]} />
                </div>
                <div className="p-4">
                  <PolygonCanvas imageUrl={floor.plan_image} shapes={shapes} activeId={activeId} mode={mode}
                    onPointsChange={(id, pts) => setPoints(p => ({ ...p, [id]: pts }))} />
                </div>
              </>
            ) : (
              <div className="m-4 rounded-xl border-[1.5px] border-dashed border-[#C9C3B7] p-4 flex flex-col gap-2 min-h-[300px] justify-center">
                <p className="m-0 text-sm text-gray-700">Este nivel todavía no tiene planta. Subila para marcar los espacios.</p>
                <ImageUploader value="" onChange={savePlan} folder="floorplans" label={`Planta de ${floor.label}`} />
              </div>
            )}
          </div>

          {/* Espacios del nivel */}
          <div className="flex-[1_1_320px] min-w-0 flex flex-col gap-2">
            {spaces.length === 0 && <p className="m-0 px-1 py-2 text-sm text-gray-500">Todavía no hay espacios en este nivel.</p>}
            {spaces.map((s, i) => {
              const on = s.id === activeId;
              const drawn = pointsOf(s.id).length >= 3;
              const imgs = photosOf(s.id);
              return (
                <button key={s.id} type="button" aria-pressed={on} onClick={() => setActiveId(s.id)}
                  className={`flex items-center gap-3 min-h-[64px] px-3 py-2 rounded-xl bg-white text-left ${on ? 'border-[1.5px] border-gray-900' : 'border border-gray-200 hover:border-gray-300'}`}>
                  {imgs[0]
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={imgs[0]} alt="" className="w-[52px] h-10 rounded-[7px] object-cover shrink-0" />
                    : <span aria-hidden className="w-[52px] h-10 rounded-[7px] shrink-0 border-[1.5px] border-dashed border-[#C9C3B7]" style={{ background: drawn ? fillOf(i) : undefined }} />}
                  <span className="flex-1 min-w-0 flex flex-col gap-0.5">
                    <span className="text-sm font-semibold text-gray-900 truncate">{s.code}</span>
                    <span className="text-xs text-gray-500">{imgs.length ? `${imgs.length} foto${imgs.length === 1 ? '' : 's'}` : 'sin fotos'}</span>
                  </span>
                  <span className={`shrink-0 text-[11px] font-semibold px-2 py-[3px] rounded-full ${on ? 'bg-gray-900 text-white' : drawn ? 'bg-brand-100 text-brand-800' : 'bg-gray-100 text-gray-600'}`}>
                    {on ? 'Dibujando' : drawn ? 'Marcado' : 'Sin marcar'}
                  </span>
                </button>
              );
            })}

            {active && (
              <div className="flex flex-col gap-3 p-4 rounded-xl bg-white border border-gray-200">
                <MultiImageUploader values={photosOf(active.id)} onChange={urls => setPhotos(p => ({ ...p, [active.id]: urls }))} folder="units" label={`Fotos de ${active.code}`} />
                <button type="button" onClick={saveSpace} disabled={busy}
                  className="self-start min-h-[44px] px-4 rounded-[10px] bg-gray-900 text-white text-[13px] font-semibold hover:bg-black disabled:opacity-50">
                  {busy ? 'Guardando...' : `Guardar ${active.code}`}
                </button>
              </div>
            )}

            {/* Alta de espacio: la tarjeta punteada del diseño, con el nombre adentro. */}
            <div className="flex items-center gap-2 min-h-[48px] pl-3 pr-1.5 py-1.5 rounded-xl border-[1.5px] border-dashed border-[#C9C3B7] focus-within:border-brand-700">
              <label className="flex-1 min-w-0">
                <span className="sr-only">Nombre del espacio nuevo en {floor.label}</span>
                <input value={newName} onChange={e => setNewName(e.target.value)} placeholder={`+ Espacio en ${floor.label}`}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addSpace(); } }}
                  className="w-full bg-transparent outline-none text-[13px] font-semibold text-gray-900 placeholder:text-brand-700" />
              </label>
              {newName.trim() && (
                <button type="button" onClick={addSpace} disabled={busy}
                  className="shrink-0 min-h-[36px] px-3 rounded-lg bg-gray-900 text-white text-xs font-semibold disabled:opacity-50">Agregar</button>
              )}
            </div>
            <ErrorNote>{error}</ErrorNote>
          </div>
        </div>

        <StepFooter
          back={{ label: 'Niveles', onClick: () => goTo(1) }}
          summary={`${totalSpaces} espacios en ${levels.length} niveles · ${withPhotos} con fotos`}
          primary={{ label: 'Terminar', onClick: () => goTo(3) }}
        />
      </main>
    </div>
  );
}

// ─── Listo ─────────────────────────────────────────────────────────

function UnicoListo({ project, tree, goTo }: { project: FlowProps['project']; tree: GuidedTree; goTo: (n: number) => void }) {
  const levels = levelsOf(tree);
  const spaces = levels.reduce((s, f) => s + f.units.length, 0);
  return (
    <ListoScreen
      project={project}
      eyebrow="Paso 3 de 3"
      title="El edificio ya se puede recorrer."
      text={`${levels.length} niveles y ${spaces} espacios. Al ser un proyecto para mostrar, lo que más pesa ahora es el relato, el equipo y las imágenes.`}
      stats={[{ value: String(levels.length), label: 'niveles' }, { value: String(spaces), label: 'espacios' }]}
      required={[{ key: 'equipo', title: 'Equipo y ficha académica', text: 'Aparece en el portfolio de cada persona', href: '/admin/proyecto' }]}
      optional={[
        { label: 'Relato', text: 'La idea, el programa, el lugar.', href: '/admin/sitio' },
        { label: 'Proceso y antes / después', text: 'Maquetas, bocetos y obra.', href: '/admin/proyecto' },
        { label: 'Recorrido 360° y BIM', text: 'Escenas por espacio y modelo IFC.', href: '/admin/proyecto/recorrido' },
        { label: 'Ubicación', text: 'El edificio en su contexto.', href: '/admin/proyecto/ubicacion' },
      ]}
      hiddenInShowcase="Precios, estados y leads"
      onBackToStart={() => goTo(2)}
    />
  );
}
