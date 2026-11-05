'use client';

import { useMemo, useState } from 'react';
import { TransitionLink as Link } from '@/components/ui/TransitionUtils';
import ImageUploader from '@/components/admin/ImageUploader';
import PolygonCanvas, { type PolygonShape } from '@/components/admin/PolygonCanvas';
import { useToast } from '@/components/ui/ToastProvider';
import { planDuplex, positionLetter, centroid, type DuplexModel, type Pt } from '@/lib/guided-structure';
import type { FlowProps } from './GuidedLoad';
import ListoScreen from './ListoScreen';
import {
  GuidedHeader, SplitLayout, StepIntro, StepFooter, NumberStepper, ChoiceCard, Segmented, FieldLabel, ErrorNote,
  allUnits, allFloors, formatNumber, useGuidedApi, type GuidedTree,
} from './shared';

const STEPS = [{ label: 'Conjunto' }, { label: 'Plano del conjunto' }, { label: 'Listo' }];

export default function DuplexFlow({ project, tree, setTree, reload, step, goTo }: FlowProps) {
  const hasStructure = tree.buildings.length > 0;
  const current = Math.min(STEPS.length, step ?? (hasStructure ? 2 : 1));
  const effective = !hasStructure && current > 1 ? 1 : current;

  return (
    <>
      <GuidedHeader
        project={project}
        kindLabel="Dúplex"
        steps={STEPS}
        current={effective}
        onStep={goTo}
        canGoTo={n => n === 1 || hasStructure}
      />
      {effective === 1 && (hasStructure
        ? <ConjuntoExistente tree={tree} onNext={() => goTo(2)} />
        : <ConjuntoStep onCreated={t => { setTree(t); goTo(2); }} />)}
      {effective === 2 && <PlanoStep tree={tree} reload={reload} onBack={() => goTo(1)} onNext={() => goTo(3)} />}
      {effective === 3 && <DuplexListo project={project} tree={tree} onBackToStart={() => goTo(1)} />}
    </>
  );
}

// ─── Paso 1 ────────────────────────────────────────────────────────

const emptyModel = (name: string): DuplexModel => ({
  name, bedrooms: 2, bathrooms: 1, floorsCount: 2, innerArea: null, lotSize: null, garageSpaces: 0,
});

/** Campo chico del "Modelo de unidad" (diseño: grilla de 3, label gris de 11px, input de 38px). */
function SmallField({ label, value, onChange, integer }: { label: string; value: number | null; onChange: (n: number | null) => void; integer?: boolean }) {
  return (
    <label className="flex flex-col gap-1 min-w-0">
      <span className="text-[11px] text-gray-500">{label}</span>
      <input
        inputMode={integer ? 'numeric' : 'decimal'}
        value={value ?? ''}
        placeholder="—"
        onChange={e => {
          const raw = e.target.value.replace(integer ? /\D/g : /[^\d.,]/g, '').replace(',', '.');
          onChange(raw === '' ? null : Number(raw));
        }}
        className="min-h-[40px] px-2.5 rounded-lg border border-gray-300 bg-white text-sm text-gray-900 min-w-0 outline-none focus:border-brand-700 focus:ring-2 focus:ring-brand-500/30 placeholder:text-gray-400"
      />
    </label>
  );
}

interface HouseHalf { code: string; meta: string; highlight?: boolean }

/** Vista "Así queda": cada dúplex como casita con techo a dos aguas partida en sus mitades. */
function DuplexHouses({ duplexes }: { duplexes: { name: string; halves: HouseHalf[] }[] }) {
  return (
    <div className="flex-1 flex gap-x-6 2xl:gap-x-9 gap-y-8 items-end justify-center flex-wrap px-4 sm:px-6 pt-12 pb-8 rounded-[18px] bg-white border border-gray-200 min-h-[320px] sm:min-h-[480px]">
      {duplexes.map(d => (
        <div key={d.name} className="flex flex-col items-center gap-3">
          <div className="flex gap-[3px] items-end">
            {d.halves.map((h, i) => {
              const last = d.halves.length - 1;
              const clip = d.halves.length === 1
                ? 'polygon(0 100%, 50% 0, 100% 100%)'
                : i === 0 ? 'polygon(0 100%, 100% 0, 100% 100%)'
                : i === last ? 'polygon(0 0, 100% 100%, 0 100%)'
                : 'polygon(0 100%, 0 0, 100% 0, 100% 100%)';
              return (
                <div key={h.code} className="flex flex-col items-center">
                  <span aria-hidden className="w-[92px] 2xl:w-[110px] h-[44px] bg-gray-800" style={{ clipPath: clip }} />
                  <span className={`w-[92px] 2xl:w-[110px] h-[120px] box-border flex flex-col items-center justify-center gap-0.5 ${
                    h.highlight ? 'bg-[#F3E7DA] text-[#6B4510] outline outline-2 outline-gray-900 outline-offset-2' : 'bg-gray-100 border border-gray-300 text-gray-900'
                  }`}>
                    <span className="font-display text-lg font-semibold">{h.code}</span>
                    <span className="text-[10px]">{h.meta}</span>
                  </span>
                </div>
              );
            })}
          </div>
          <div aria-hidden className="w-full h-1.5 rounded-sm bg-gray-800" />
          <span className="text-[13px] font-semibold text-gray-900">{d.name}</span>
        </div>
      ))}
    </div>
  );
}

function ConjuntoStep({ onCreated }: { onCreated: (t: GuidedTree) => void }) {
  const { create } = useGuidedApi();
  const [count, setCount] = useState(3);
  const [per, setPer] = useState(2);
  const [same, setSame] = useState(true);
  const [models, setModels] = useState<DuplexModel[]>([emptyModel('Modelo único')]);
  const [active, setActive] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Con modelos distintos hay uno por posición (A, B…) dentro del dúplex.
  const effectiveModels = useMemo(() => {
    if (same) return [models[0] ?? emptyModel('Modelo único')];
    return Array.from({ length: per }, (_, i) => models[i] ?? emptyModel(i === 0 ? 'Frente' : i === 1 ? 'Fondo' : `Modelo ${positionLetter(i)}`));
  }, [same, per, models]);
  const activeIdx = Math.min(active, effectiveModels.length - 1);
  const model = effectiveModels[activeIdx];
  const plan = useMemo(() => planDuplex(count, per, effectiveModels), [count, per, effectiveModels]);
  const totalUnits = count * per;

  const updateModel = (patch: Partial<DuplexModel>) => {
    setModels(() => {
      const next = [...effectiveModels];
      next[activeIdx] = { ...next[activeIdx], ...patch };
      return next;
    });
  };

  const submit = async () => {
    setBusy(true);
    setError('');
    const res = await create({ kind: 'duplex', count, perDuplex: per, models: effectiveModels });
    setBusy(false);
    if (!res.ok) { setError(res.error); return; }
    onCreated(res.data);
  };

  const duplexes = plan.map(b => ({
    name: b.name,
    halves: b.floors[0].units.map(u => ({
      code: u.code,
      meta: !same && u.modelName ? u.modelName : `${u.bedrooms} dorm.`,
      highlight: !same && (u.position ?? 0) === activeIdx,
    })),
  }));
  const numbering = `${plan[0]?.floors[0]?.units.slice(0, 2).map(u => u.code).join(', ')}${plan.length > 1 ? `, ${plan[1].floors[0].units[0]?.code}…` : ''}`;
  const fieldsCls = 'grid grid-cols-3 gap-2';

  return (
    <SplitLayout
      panelLabel="Conjunto"
      mainLabel="Vista del conjunto"
      panel={
        <>
          <StepIntro eyebrow="Paso 1 de 3" title="¿Cuántos dúplex son?">
            Cada dúplex tiene sus mitades. Si todas las unidades son iguales, las cargás una vez y se copian a todas.
          </StepIntro>

          <div className="grid grid-cols-2 gap-3">
            <NumberStepper label="Dúplex" value={count} onChange={setCount} min={1} max={100} />
            <NumberStepper label="Unidades por dúplex" value={per} onChange={setPer} min={1} max={8} />
          </div>

          <div role="radiogroup" aria-label="Las unidades son" className="flex flex-col gap-2">
            <FieldLabel>Las unidades son</FieldLabel>
            <ChoiceCard on={same} onClick={() => { setSame(true); setActive(0); }} title="Todas iguales (espejadas)" hint={`Un solo modelo para las ${totalUnits} unidades`} className="!min-h-[58px] !py-2.5 !rounded-[10px]" />
            <ChoiceCard on={!same} onClick={() => setSame(false)} title="Hay modelos distintos" hint="Ej: frente y fondo, o con y sin piscina" className="!min-h-[58px] !py-2.5 !rounded-[10px]" />
          </div>

          <div className="rounded-[14px] border border-gray-200 bg-white p-4 flex flex-col gap-3">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-sm font-semibold text-gray-900">Modelo de unidad</span>
              <span className="text-xs text-gray-500">{same ? `se copia a las ${totalUnits}` : `posición ${positionLetter(activeIdx)} · ${count} unidades`}</span>
            </div>
            {!same && (
              <>
                <Segmented
                  label="Modelo"
                  value={String(activeIdx)}
                  options={effectiveModels.map((m, i) => ({ value: String(i), label: `${positionLetter(i)} · ${m.name || 'Sin nombre'}` }))}
                  onChange={v => setActive(Number(v))}
                />
                <label className="flex flex-col gap-1 min-w-0">
                  <span className="text-[11px] text-gray-500">Nombre del modelo</span>
                  <input value={model.name} onChange={e => updateModel({ name: e.target.value })} placeholder="Ej: Frente"
                    className="min-h-[40px] px-2.5 rounded-lg border border-gray-300 bg-white text-sm text-gray-900 outline-none focus:border-brand-700 focus:ring-2 focus:ring-brand-500/30" />
                </label>
              </>
            )}
            <div className={fieldsCls}>
              <SmallField label="Dormitorios" integer value={model.bedrooms} onChange={n => updateModel({ bedrooms: Math.min(20, n ?? 0) })} />
              <SmallField label="Baños" integer value={model.bathrooms} onChange={n => updateModel({ bathrooms: Math.min(20, n ?? 0) })} />
              <SmallField label="Plantas" integer value={model.floorsCount} onChange={n => updateModel({ floorsCount: Math.min(6, Math.max(1, n ?? 1)) })} />
              <SmallField label="Cubierta m²" value={model.innerArea} onChange={n => updateModel({ innerArea: n })} />
              <SmallField label="Terreno m²" value={model.lotSize} onChange={n => updateModel({ lotSize: n })} />
              <SmallField label="Cocheras" integer value={model.garageSpaces} onChange={n => updateModel({ garageSpaces: Math.min(10, n ?? 0) })} />
            </div>
          </div>
          <ErrorNote>{error}</ErrorNote>
        </>
      }
    >
      <h2 className="m-0 text-[15px] font-semibold text-gray-900">Así queda <span className="font-normal text-gray-500">— después podés cambiar una unidad si es distinta</span></h2>
      <DuplexHouses duplexes={duplexes} />
      <StepFooter
        title={<>{count} dúplex · {totalUnits} unidades · {effectiveModels.length} modelo{effectiveModels.length === 1 ? '' : 's'}</>}
        summary={<>Numeración: {numbering}</>}
        primary={{ label: 'Crear y seguir', onClick: submit, busy, busyLabel: 'Creando...' }}
      />
    </SplitLayout>
  );
}

function ConjuntoExistente({ tree, onNext }: { tree: GuidedTree; onNext: () => void }) {
  const units = allUnits(tree);
  const models = new Set(units.map(u => u.model_name ?? '—'));
  const duplexes = tree.buildings.map(b => ({
    name: b.name,
    halves: b.floors.flatMap(f => f.units).map(u => ({ code: u.code, meta: u.model_name && models.size > 1 ? u.model_name : `${u.bedrooms} dorm.` })),
  }));
  return (
    <SplitLayout
      panelLabel="Conjunto"
      mainLabel="Vista del conjunto"
      panel={
        <>
          <StepIntro eyebrow="Paso 1 de 3" title="El conjunto ya está creado.">
            {tree.buildings.length} dúplex · {units.length} unidades · {models.size} modelo{models.size === 1 ? '' : 's'}. Para sumar dúplex o cambiar una unidad, usá la pantalla de estructura.
          </StepIntro>
          <Link href="/admin/edificios" className="self-start min-h-[40px] flex items-center text-[13px] font-semibold text-brand-700 underline underline-offset-2">
            Editar la estructura
          </Link>
        </>
      }
    >
      <h2 className="m-0 text-[15px] font-semibold text-gray-900">Así quedó</h2>
      <DuplexHouses duplexes={duplexes} />
      <StepFooter
        title={<>{tree.buildings.length} dúplex · {units.length} unidades · {models.size} modelo{models.size === 1 ? '' : 's'}</>}
        primary={{ label: 'Seguir', onClick: onNext }}
      />
    </SplitLayout>
  );
}

// ─── Paso 2 ────────────────────────────────────────────────────────

function PlanoStep({ tree, reload, onBack, onNext }: { tree: GuidedTree; reload: () => Promise<void>; onBack: () => void; onNext: () => void }) {
  const { patch } = useGuidedApi();
  const toast = useToast();
  const floors = allFloors(tree);
  const units = allUnits(tree);
  const [source, setSource] = useState<'implantacion' | 'aerea'>('implantacion');
  const [image, setImage] = useState(floors.find(f => f.plan_image)?.plan_image ?? '');
  const [points, setPoints] = useState<Record<string, Pt[]>>(() => Object.fromEntries(units.map(u => [u.id, u.polygon ?? []])));
  const [activeId, setActiveId] = useState<string | null>(units.find(u => !(u.polygon && u.polygon.length >= 3))?.id ?? units[0]?.id ?? null);
  const [mode, setMode] = useState<'rectangle' | 'point'>('rectangle');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const isMarked = (id: string) => (points[id]?.length ?? 0) >= 3;
  const marked = units.filter(u => isMarked(u.id)).length;
  // Todas las formas en el verde del diseño; la activa la resalta el canvas.
  const shapes: PolygonShape[] = units.map(u => ({ id: u.id, label: u.code, points: points[u.id] ?? [], color: '#37463F' }));

  const onComplete = (id: string) => {
    const idx = units.findIndex(u => u.id === id);
    const next = units.slice(idx + 1).find(u => !isMarked(u.id) && u.id !== id);
    if (next) setActiveId(next.id);
  };

  const save = async () => {
    if (!image) { setError('Subí la imagen del conjunto primero.'); return; }
    setBusy(true);
    setError('');
    const res = await patch({
      floors: floors.map(f => ({
        id: f.id,
        planImage: image,
        unitDots: f.units.filter(u => isMarked(u.id)).map(u => {
          const c = centroid(points[u.id]);
          return { unitId: u.code, x: c.x, y: c.y };
        }),
      })),
      units: units.map(u => ({ id: u.id, polygon: isMarked(u.id) ? points[u.id] : [] })),
    });
    setBusy(false);
    if (!res.ok) { setError(res.error); return; }
    toast('Plano del conjunto guardado.');
    await reload();
    onNext();
  };

  const activeUnit = units.find(u => u.id === activeId);

  return (
    <SplitLayout
      panel={
        <>
          <StepIntro eyebrow="Paso 2 de 3" title="Ubicá cada unidad en el conjunto">
            Subí la implantación o una vista aérea y marcá cada mitad. En el sitio, el comprador toca la unidad y ve su ficha.
          </StepIntro>
          <div className="flex flex-col gap-2">
            <FieldLabel>Sobre qué imagen</FieldLabel>
            <div className="grid gap-2 grid-cols-2">
              <ChoiceCard on={source === 'implantacion'} onClick={() => setSource('implantacion')} title="Implantación" hint="Plano visto desde arriba" className="!min-h-[58px] !py-2.5 !px-3 !rounded-[10px]" />
              <ChoiceCard on={source === 'aerea'} onClick={() => setSource('aerea')} title="Vista aérea" hint="Render o foto de dron" className="!min-h-[58px] !py-2.5 !px-3 !rounded-[10px]" />
            </div>
          </div>
          <ImageUploader value={image} onChange={setImage} folder="floorplans" label={source === 'implantacion' ? 'Implantación' : 'Vista aérea'} />
          <ul className="m-0 p-0 list-none flex flex-col gap-1.5" aria-label="Unidades">
            {units.map(u => {
              const on = u.id === activeId;
              const done = isMarked(u.id);
              return (
                <li key={u.id}>
                  <button type="button" onClick={() => setActiveId(u.id)} aria-pressed={on}
                    className={`w-full flex items-center gap-2.5 min-h-[44px] px-3 rounded-[9px] bg-white text-left ${
                      on ? 'border-[1.5px] border-gray-900' : done ? 'border border-gray-200 hover:border-gray-300' : 'border-[1.5px] border-dashed border-[#C9C3B7] hover:border-gray-400'
                    }`}>
                    <span aria-hidden className={`w-2.5 h-2.5 rounded-[3px] shrink-0 ${on ? 'bg-gray-900' : done ? 'bg-brand-700' : 'bg-[#E0DCD3]'}`} />
                    <span className="flex-1 min-w-0 text-[13px] font-semibold text-gray-900 truncate">{u.code}</span>
                    <span className="text-xs text-gray-500">{on ? 'Ahora' : done ? 'Marcada' : 'Pendiente'}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          <button type="button" onClick={onNext} className="self-start min-h-[40px] text-[13px] font-semibold text-brand-700 underline underline-offset-2">
            Saltear por ahora
          </button>
        </>
      }
    >
      <div className="flex-1 flex flex-col gap-4 min-h-[360px] sm:min-h-[600px] rounded-[18px] border border-gray-200 bg-[#E9E6DC] p-3 sm:p-4">
        <div role="toolbar" aria-label="Herramientas" className="self-center flex flex-wrap gap-0.5 p-1 rounded-xl bg-gray-900 shadow-[0_8px_24px_rgba(23,25,26,0.25)]">
          <span className="min-h-[36px] flex items-center px-3 rounded-lg bg-[#3A3D3B] text-white text-xs font-semibold">
            {activeUnit ? `Marcando ${activeUnit.code}` : 'Elegí una unidad'}
          </span>
          {([['rectangle', 'Rectángulo'], ['point', 'Forma libre']] as const).map(([v, l]) => (
            <button key={v} type="button" aria-pressed={mode === v} onClick={() => setMode(v)}
              className={`min-h-[36px] px-3 rounded-lg text-xs ${mode === v ? 'text-white font-semibold' : 'text-[#C9C6BE] hover:text-white'}`}>
              {l}
            </button>
          ))}
        </div>
        {image ? (
          <div className="rounded-xl overflow-hidden bg-white">
            <PolygonCanvas
              imageUrl={image}
              shapes={shapes}
              activeId={activeId}
              mode={mode}
              onPointsChange={(id, pts) => setPoints(prev => ({ ...prev, [id]: pts }))}
              onComplete={onComplete}
            />
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center p-6 text-center text-sm text-gray-600">
            Subí la implantación o la vista aérea para empezar a marcar las unidades.
          </div>
        )}
      </div>
      <ErrorNote>{error}</ErrorNote>
      <StepFooter
        back={{ label: 'Conjunto', onClick: onBack }}
        summary={<>{marked} de {units.length} unidades marcadas</>}
        primary={{ label: 'Terminar', onClick: save, busy, disabled: !image }}
      />
    </SplitLayout>
  );
}

// ─── Paso 3 ────────────────────────────────────────────────────────

function DuplexListo({ project, tree, onBackToStart }: { project: FlowProps['project']; tree: GuidedTree; onBackToStart: () => void }) {
  const units = allUnits(tree);
  const duplexCount = tree.buildings.length;
  const marked = units.filter(u => (u.polygon?.length ?? 0) >= 3).length;
  const models = new Set(units.map(u => u.model_name ?? '—')).size;
  const area = units.find(u => u.inner_area)?.inner_area ?? null;
  const showcase = project.saleMode === 'showcase';
  const sameModel = models === 1;

  if (showcase) {
    return (
      <ListoScreen
        project={project}
        eyebrow="Paso 3 de 3"
        title="El conjunto está armado."
        text={`${duplexCount} dúplex, ${units.length} unidades y ${models === 1 ? 'un modelo' : `${models} modelos`}. Las fichas muestran programa y superficies, sin precio ni estado.`}
        stats={[
          { value: String(duplexCount), label: 'dúplex' },
          { value: String(units.length), label: 'unidades' },
          { value: area ? formatNumber(area) : '—', label: 'm² c/u' },
        ]}
        optionalTitle="Lo que hace lucir el proyecto"
        optional={[
          { label: 'Relato', text: 'Por qué dúplex y no casas aisladas.', href: '/admin/sitio', tag: 'Recomendado' },
          { label: 'Fotos y renders del modelo', text: `Se cargan una vez y se ven en las ${units.length}.`, href: '/admin/edificios', tag: 'Recomendado' },
          { label: 'Equipo', text: 'Aparece en el portfolio de cada persona.', href: '/admin/sitio', tag: 'Recomendado' },
          { label: 'Proceso y antes / después', text: 'Del terreno a la obra terminada.', href: '/admin/proyecto', tag: 'Suma' },
        ]}
        hiddenInShowcase="No se muestran precios, estados, leads ni calculadora."
        onBackToStart={onBackToStart}
      />
    );
  }

  return (
    <ListoScreen
      project={project}
      eyebrow="Paso 3 de 3"
      title="El conjunto está armado."
      text={`${units.length} unidades ${sameModel ? 'con el mismo modelo' : `en ${models} modelos`}${marked > 0 ? ', ubicadas en la implantación' : ''}. Para publicar faltan la portada y los precios.`}
      stats={[
        { value: String(duplexCount), label: 'dúplex' },
        { value: String(units.length), label: 'unidades' },
        { value: `${marked}/${units.length}`, label: 'en el plano' },
      ]}
      required={[{
        key: 'precios',
        title: `Precios y estados de las ${units.length}`,
        text: units.some(u => u.price) ? `${units.filter(u => u.price).length} con precio · tabla editable` : 'Requerido para publicar · tabla editable',
        href: '/admin/inventory',
        done: units.length > 0 && units.every(u => u.price),
      }]}
      optional={[
        { label: 'Ambientes y recorrido 360°', text: `Cargalos en una unidad y copialos a las otras ${Math.max(0, units.length - 1)}.`, href: '/admin/edificios' },
        { label: 'Renders y planos', text: 'Van al modelo y se ven en todas.', href: '/admin/edificios' },
        { label: 'Entorno', text: 'Ubicación y amenidades.', href: '/admin/proyecto/ubicacion' },
        { label: 'Relato', text: 'Texto, atributos y cifras.', href: '/admin/sitio' },
      ]}
      onBackToStart={onBackToStart}
    />
  );
}
