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
import ListoScreen, { PreviewCard } from './ListoScreen';
import {
  ErrorNote, FieldLabel, GuidedHeader, Segmented, StepFooter, StepIntro, SHAPE_PALETTE, inputClass, useGuidedApi,
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

function LevelsStep({ tree, setTree, goTo }: { tree: GuidedTree; setTree: (t: GuidedTree) => void; goTo: (n: number) => void }) {
  const api = useGuidedApi();
  const existing = levelsOf(tree);
  const [levels, setLevels] = useState<LevelDraft[]>(() =>
    ['Terraza', 'Nivel 2', 'Nivel 1', 'Planta baja'].map(name => ({ key: newKey(), name, use: '', planImage: '' })));
  const [openPlan, setOpenPlan] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (existing.length > 0) {
    return (
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-8 sm:py-10 flex flex-col gap-8">
        <StepIntro eyebrow="Paso 1 de 3 · Solo para mostrar" title="Los niveles ya están creados">
          Para agregar, renombrar o reordenar niveles usá la pantalla de estructura; acá seguís con los espacios.
        </StepIntro>
        <div className="flex gap-6 flex-wrap items-start">
          <div className="flex-[1_1_320px] max-w-[560px] flex flex-col gap-1.5">
            {existing.map(f => (
              <div key={f.id} className="flex items-center justify-between gap-3 min-h-[48px] px-4 rounded-lg bg-white border border-gray-200">
                <span className="text-sm font-semibold text-gray-900">{f.label}</span>
                <span className="text-xs text-gray-500">{f.floor_kind_description || '—'} · {f.plan_image ? 'con planta' : 'sin planta'} · {f.units.length} espacios</span>
              </div>
            ))}
          </div>
          <Link href="/admin/edificios" className="text-sm font-semibold text-brand-700 min-h-[44px] flex items-center">Editar la estructura →</Link>
        </div>
        <StepFooter primary={{ label: 'Seguir con los espacios →', onClick: () => goTo(2) }} />
      </div>
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

  return (
    <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-8 sm:py-10 flex flex-col gap-8">
      <div className="flex gap-8 flex-wrap items-start">
        <section aria-label="Niveles" className="flex-[3_1_520px] min-w-0 flex flex-col gap-6">
          <StepIntro eyebrow="Paso 1 de 3 · Solo para mostrar" title="¿Qué niveles tiene el edificio?">
            Escuela, museo, biblioteca o interiorismo: no hay unidades en venta, hay espacios. Nombrá cada nivel y soltá su planta.
          </StepIntro>

          <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
            <div className="hidden sm:grid grid-cols-[1fr_1fr_132px_96px] gap-3 px-4 py-2 border-b border-gray-100 text-xs font-medium text-gray-500">
              <span>Nivel</span><span>Uso principal</span><span>Planta</span><span />
            </div>
            {levels.map((l, i) => (
              <div key={l.key} className="border-b border-gray-50">
                <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_132px_96px] gap-2 sm:gap-3 items-center px-4 py-2">
                  <input aria-label={`Nombre del nivel ${i + 1}`} value={l.name} onChange={e => update(l.key, { name: e.target.value })} className={inputClass} />
                  <input aria-label={`Uso principal de ${l.name || `nivel ${i + 1}`}`} value={l.use} placeholder="Ej: Sala de lectura"
                    onChange={e => update(l.key, { use: e.target.value })} className={inputClass} />
                  <button type="button" onClick={() => setOpenPlan(o => (o === l.key ? null : l.key))} aria-expanded={openPlan === l.key}
                    className={`min-h-[44px] px-3 rounded-[10px] text-[13px] font-medium border ${l.planImage ? 'border-brand-200 bg-brand-50 text-brand-800' : 'border-dashed border-gray-300 text-gray-600 hover:border-gray-400'}`}>
                    {l.planImage ? 'Planta cargada' : 'Subir planta'}
                  </button>
                  <div className="flex gap-1">
                    <button type="button" aria-label={`Subir ${l.name}`} disabled={i === 0} onClick={() => move(i, -1)}
                      className="w-11 h-11 rounded-lg text-gray-600 hover:bg-gray-100 disabled:opacity-30">↑</button>
                    <button type="button" aria-label={`Bajar ${l.name}`} disabled={i === levels.length - 1} onClick={() => move(i, 1)}
                      className="w-11 h-11 rounded-lg text-gray-600 hover:bg-gray-100 disabled:opacity-30">↓</button>
                    <button type="button" aria-label={`Quitar ${l.name}`} disabled={levels.length <= 1}
                      onClick={() => setLevels(ls => ls.filter(x => x.key !== l.key))}
                      className="w-11 h-11 rounded-lg text-gray-500 hover:bg-gray-100 disabled:opacity-30">✕</button>
                  </div>
                </div>
                {openPlan === l.key && (
                  <div className="px-4 pb-4">
                    <ImageUploader value={l.planImage} onChange={url => update(l.key, { planImage: url })} folder="floorplans" label={`Planta de ${l.name}`} />
                  </div>
                )}
              </div>
            ))}
            <button type="button" onClick={() => setLevels(ls => [{ key: newKey(), name: `Nivel ${ls.length}`, use: '', planImage: '' }, ...ls])}
              className="w-full min-h-[48px] text-sm font-semibold text-brand-700 hover:bg-gray-50">+ Nivel</button>
          </div>

          <div className="flex flex-col gap-2">
            <FieldLabel>Soltar todas las plantas juntas</FieldLabel>
            <BulkImageUploader
              folder="floorplans"
              hint="Se asignan en orden, de arriba hacia abajo, a los niveles que todavía no tienen planta."
              onComplete={results => setLevels(ls => {
                const queue = [...results];
                return ls.map(l => (l.planImage || queue.length === 0 ? l : { ...l, planImage: queue.shift()!.url }));
              })}
            />
          </div>
        </section>

        <aside aria-label="Corte" className="flex-[2_1_320px] min-w-0 md:max-w-[460px] flex flex-col gap-3 p-5 rounded-2xl bg-white border border-gray-200">
          <h2 className="m-0 text-[15px] font-semibold text-gray-900">Corte <span className="font-normal text-gray-500">— así lo navega el visitante</span></h2>
          <div className="flex flex-col gap-1">
            {levels.map((l, i) => (
              <div key={l.key}
                className={`flex items-center justify-between gap-3 min-h-[52px] px-4 rounded-md border ${l.planImage ? 'bg-brand-50 border-brand-200' : 'bg-gray-50 border-dashed border-gray-300'}`}
                style={{ marginInline: i === 0 ? '12%' : 0 }}>
                <span className="text-sm font-semibold text-gray-900 truncate">{l.name || '[Nivel]'}</span>
                <span className="text-xs text-gray-500 truncate">{l.use || 'Sin uso'}</span>
              </div>
            ))}
            <div aria-hidden className="h-2 rounded-sm bg-gray-300 mt-1" />
          </div>
          <p className="text-sm font-semibold text-gray-900">{levels.length} niveles · {withPlan} planta{withPlan === 1 ? '' : 's'} cargada{withPlan === 1 ? '' : 's'}</p>
          <p className="text-xs text-gray-500">Sin precios, estados ni leads: es un proyecto para mostrar.</p>
        </aside>
      </div>
      <ErrorNote>{error}</ErrorNote>
      <StepFooter primary={{ label: 'Seguir con los espacios →', onClick: create, disabled: levels.length === 0 || levels.some(l => !l.name.trim()), busy, busyLabel: 'Creando niveles...' }} />
    </div>
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

  const shapes: PolygonShape[] = spaces.map((s, i) => ({ id: s.id, label: s.code, points: pointsOf(s.id), color: SHAPE_PALETTE[i % SHAPE_PALETTE.length] }));

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
    <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-8 sm:py-10 flex flex-col gap-8">
      <div className="flex gap-6 flex-wrap items-start">
        {/* En celular los niveles son chips con scroll horizontal; en desktop, columna. */}
        <nav aria-label="Niveles" className="flex-[1_1_180px] md:max-w-[240px] min-w-0 flex flex-row md:flex-col gap-1.5 overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0 pb-1 md:pb-0">
          <span className="hidden md:block text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-500 px-1 pb-1">Niveles</span>
          {levels.map(f => {
            const on = f.id === floor.id;
            return (
              <button key={f.id} type="button" aria-pressed={on} onClick={() => { setFloorId(f.id); setActiveId(null); }}
                className={`shrink-0 flex items-center justify-between gap-2 min-h-[44px] px-3 rounded-lg text-left text-sm ${on ? 'bg-gray-900 text-white font-semibold' : 'bg-white border border-gray-200 text-gray-800 hover:border-gray-300'}`}>
                <span className="truncate">{f.label}</span>
                <span className={`text-xs ${on ? 'text-gray-300' : 'text-gray-500'}`}>{f.units.length}</span>
              </button>
            );
          })}
        </nav>

        <div className="flex-[3_1_520px] min-w-0 flex flex-col gap-5">
          <StepIntro eyebrow={`Paso 2 de 3 · ${floor.label}`} title="Los espacios que cuentan el proyecto">
            Nombrá cada espacio, marcalo en la planta y sumale fotos. Es lo que el visitante recorre en vez de unidades.
          </StepIntro>

          <div className="flex gap-2 flex-wrap">
            <label className="flex-1 basis-[200px] min-w-0">
              <span className="sr-only">Nombre del espacio</span>
              <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Ej: Hall de acceso"
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addSpace(); } }} className={inputClass} />
            </label>
            <button type="button" onClick={addSpace} disabled={!newName.trim() || busy}
              className="max-sm:w-full min-h-[44px] px-4 rounded-[10px] border border-gray-300 bg-white text-sm font-semibold text-gray-900 hover:border-gray-400 disabled:opacity-50">
              + Espacio en {floor.label}
            </button>
          </div>
          <ErrorNote>{error}</ErrorNote>

          <div className="flex gap-5 flex-wrap items-start">
            <div className="flex-[1_1_220px] md:max-w-[300px] min-w-0 flex flex-col gap-1.5">
              {spaces.length === 0 && <p className="text-sm text-gray-500">Todavía no hay espacios en este nivel.</p>}
              {spaces.map((s, i) => {
                const on = s.id === activeId;
                const drawn = pointsOf(s.id).length >= 3;
                const n = photosOf(s.id).length;
                return (
                  <button key={s.id} type="button" aria-pressed={on} onClick={() => setActiveId(s.id)}
                    className={`flex items-center gap-3 min-h-[52px] px-3 rounded-xl border text-left ${on ? 'border-[1.5px] border-brand-700 bg-brand-50' : 'border-gray-200 bg-white hover:border-gray-300'}`}>
                    <span aria-hidden className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: SHAPE_PALETTE[i % SHAPE_PALETTE.length] }} />
                    <span className="flex-1 min-w-0 flex flex-col">
                      <span className="text-sm font-semibold text-gray-900 truncate">{s.code}</span>
                      <span className="text-xs text-gray-500">{drawn ? 'Marcado' : 'Sin marcar'} · {n} foto{n === 1 ? '' : 's'}</span>
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="flex-[2_1_360px] min-w-0 flex flex-col gap-3">
              {floor.plan_image ? (
                <>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Segmented label="Forma" value={mode} onChange={setMode} options={[{ value: 'rectangle', label: 'Rectángulo' }, { value: 'point', label: 'Forma libre' }]} />
                    <span className="text-xs text-gray-500">{active ? `Marcando ${active.code}` : 'Elegí un espacio para marcarlo'}</span>
                  </div>
                  <div className="rounded-2xl border border-gray-200 bg-white p-2">
                    <PolygonCanvas imageUrl={floor.plan_image} shapes={shapes} activeId={activeId} mode={mode}
                      onPointsChange={(id, pts) => setPoints(p => ({ ...p, [id]: pts }))} />
                  </div>
                </>
              ) : (
                <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-4 flex flex-col gap-2">
                  <p className="text-sm text-gray-700">Este nivel todavía no tiene planta. Subila para marcar los espacios.</p>
                  <ImageUploader value="" onChange={savePlan} folder="floorplans" label={`Planta de ${floor.label}`} />
                </div>
              )}
              {active && (
                <div className="flex flex-col gap-3 p-4 rounded-xl bg-white border border-gray-200">
                  <MultiImageUploader values={photosOf(active.id)} onChange={urls => setPhotos(p => ({ ...p, [active.id]: urls }))} folder="units" label={`Fotos de ${active.code}`} />
                  <button type="button" onClick={saveSpace} disabled={busy}
                    className="self-start min-h-[44px] px-4 rounded-xl bg-brand-700 text-white text-sm font-semibold hover:bg-brand-800 disabled:opacity-50">
                    {busy ? 'Guardando...' : `Guardar ${active.code}`}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <StepFooter
        back={{ label: 'Niveles', onClick: () => goTo(1) }}
        summary={<><b className="text-gray-900">{totalSpaces} espacios en {levels.length} niveles</b> · {withPhotos} con fotos</>}
        primary={{ label: 'Terminar →', onClick: () => goTo(3) }}
      />
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
      aside={<PreviewCard project={project} meta={`Proyecto único · ${levels.length} niveles · ${spaces} espacios`} />}
    />
  );
}
