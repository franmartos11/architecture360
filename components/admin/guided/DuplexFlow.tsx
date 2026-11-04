'use client';

import { useMemo, useState } from 'react';
import { TransitionLink as Link } from '@/components/ui/TransitionUtils';
import ImageUploader from '@/components/admin/ImageUploader';
import PolygonCanvas, { type PolygonShape } from '@/components/admin/PolygonCanvas';
import { useToast } from '@/components/ui/ToastProvider';
import { planDuplex, positionLetter, centroid, type DuplexModel, type Pt } from '@/lib/guided-structure';
import type { FlowProps } from './GuidedLoad';
import ListoScreen, { PreviewCard } from './ListoScreen';
import {
  GuidedHeader, StepIntro, StepFooter, NumberStepper, ChoiceCard, Segmented, NumberField, FieldLabel, ErrorNote,
  inputClass, allUnits, allFloors, formatNumber, useGuidedApi, SHAPE_PALETTE, type GuidedTree,
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

  return (
    <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-8 flex gap-8 flex-wrap items-start">
      <section aria-label="Conjunto" className="flex-[1_1_440px] min-w-0 max-w-[560px] flex flex-col gap-6">
        <StepIntro eyebrow="Paso 1 de 3" title="¿Cuántos dúplex son?">
          Cada dúplex tiene sus mitades. Si todas las unidades son iguales, las cargás una vez y se copian a todas.
        </StepIntro>

        <div className="flex gap-x-3 gap-y-4 sm:gap-6 flex-wrap">
          <NumberStepper label="Dúplex" value={count} onChange={setCount} min={1} max={100} />
          <NumberStepper label="Unidades por dúplex" value={per} onChange={setPer} min={1} max={8} />
        </div>

        <div className="flex flex-col gap-2">
          <FieldLabel>Las unidades son</FieldLabel>
          <div className="grid gap-2 sm:grid-cols-2">
            <ChoiceCard on={same} onClick={() => { setSame(true); setActive(0); }} title="Todas iguales (espejadas)" hint={`Un solo modelo para las ${totalUnits} unidades`} />
            <ChoiceCard on={!same} onClick={() => setSame(false)} title="Hay modelos distintos" hint="Ej: frente y fondo, o con y sin piscina" />
          </div>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-4 flex flex-col gap-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <span className="text-sm font-semibold text-gray-900">
              Modelo de unidad <span className="font-normal text-gray-500">
                — {same ? `se copia a las ${totalUnits}` : `posición ${positionLetter(activeIdx)} de cada dúplex · ${count} unidades`}
              </span>
            </span>
            {!same && (
              <Segmented
                label="Modelo"
                value={String(activeIdx)}
                options={effectiveModels.map((m, i) => ({ value: String(i), label: `${positionLetter(i)} · ${m.name || 'Sin nombre'}` }))}
                onChange={v => setActive(Number(v))}
              />
            )}
          </div>
          <label className="flex flex-col gap-1.5">
            <FieldLabel>Nombre del modelo</FieldLabel>
            <input value={model.name} onChange={e => updateModel({ name: e.target.value })} className={inputClass} placeholder="Ej: Frente" />
          </label>
          <div className="flex gap-x-3 gap-y-4 sm:gap-4 flex-wrap">
            <NumberStepper label="Dormitorios" value={model.bedrooms} onChange={n => updateModel({ bedrooms: n })} max={20} />
            <NumberStepper label="Baños" value={model.bathrooms} onChange={n => updateModel({ bathrooms: n })} max={20} />
            <NumberStepper label="Plantas" value={model.floorsCount} onChange={n => updateModel({ floorsCount: n })} min={1} max={6} />
            <NumberStepper label="Cocheras" value={model.garageSpaces} onChange={n => updateModel({ garageSpaces: n })} max={10} />
          </div>
          <div className="grid gap-3 grid-cols-2">
            <NumberField label="Cubierta" suffix="m²" value={model.innerArea} onChange={n => updateModel({ innerArea: n })} />
            <NumberField label="Terreno" suffix="m²" value={model.lotSize} onChange={n => updateModel({ lotSize: n })} />
          </div>
        </div>

        <ErrorNote>{error}</ErrorNote>
        <StepFooter
          summary={<>Numeración: {plan[0]?.floors[0]?.units.slice(0, 2).map(u => u.code).join(', ')}{plan.length > 1 ? `, ${plan[1].floors[0].units[0]?.code}…` : ''}</>}
          primary={{ label: 'Crear y seguir →', onClick: submit, busy, busyLabel: 'Creando...' }}
        />
      </section>

      <main aria-label="Vista del conjunto" className="flex-[1_1_480px] min-w-0 rounded-2xl border border-gray-200 bg-[#efece6] p-5 flex flex-col gap-4">
        <h2 className="m-0 text-[15px] font-semibold text-gray-900">Así queda <span className="font-normal text-gray-500">— después podés cambiar una unidad si es distinta</span></h2>
        <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))' }}>
          {plan.map(b => (
            <div key={b.name} className="flex flex-col gap-2">
              <div className="flex gap-1 rounded-xl bg-white border border-gray-300 p-1.5">
                {b.floors[0].units.map(u => (
                  <div key={u.code} className="flex-1 min-w-0 flex flex-col gap-0.5 rounded-lg bg-brand-50 border border-brand-200 px-2 py-3">
                    <span className="text-[13px] font-semibold text-gray-900">{u.code}</span>
                    <span className="text-[10.5px] text-gray-600 truncate">{u.bedrooms} dorm.{u.innerArea ? ` · ${formatNumber(u.innerArea)} m²` : ''}</span>
                  </div>
                ))}
              </div>
              <span className="text-xs font-medium text-gray-700">{b.name}</span>
            </div>
          ))}
        </div>
        <p className="m-0 text-[13px] text-gray-700 font-medium pt-3 border-t border-gray-300">
          {count} dúplex · {totalUnits} unidades · {effectiveModels.length} modelo{effectiveModels.length === 1 ? '' : 's'}
        </p>
      </main>
    </div>
  );
}

function ConjuntoExistente({ tree, onNext }: { tree: GuidedTree; onNext: () => void }) {
  const units = allUnits(tree);
  const models = new Set(units.map(u => u.model_name ?? '—'));
  return (
    <div className="max-w-[760px] mx-auto px-4 sm:px-6 py-8 flex flex-col gap-6">
      <StepIntro eyebrow="Paso 1 de 3" title="El conjunto ya está creado.">
        {tree.buildings.length} dúplex · {units.length} unidades · {models.size} modelo{models.size === 1 ? '' : 's'}. Para sumar dúplex o cambiar una unidad, usá la pantalla de estructura.
      </StepIntro>
      <div className="flex flex-wrap gap-2">
        {units.map(u => (
          <span key={u.id} className="text-xs font-medium px-2.5 py-1.5 rounded-lg bg-white border border-gray-200 text-gray-800">{u.code}{u.model_name ? ` · ${u.model_name}` : ''}</span>
        ))}
      </div>
      <div className="flex items-center justify-between gap-4 flex-wrap pt-6 border-t border-gray-200">
        <Link href="/admin/edificios" className="min-h-[44px] flex items-center text-sm font-medium text-gray-700 hover:text-gray-900">Editar la estructura →</Link>
        <button type="button" onClick={onNext} className="min-h-[48px] px-5 rounded-xl bg-gray-900 text-white text-sm font-semibold hover:bg-gray-800">Seguir</button>
      </div>
    </div>
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
  const shapes: PolygonShape[] = units.map((u, i) => ({ id: u.id, label: u.code, points: points[u.id] ?? [], color: SHAPE_PALETTE[i % SHAPE_PALETTE.length] }));

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
    <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-8 flex gap-8 flex-wrap items-start">
      <section className="flex-[1_1_320px] min-w-0 max-w-[400px] flex flex-col gap-6">
        <StepIntro eyebrow="Paso 2 de 3" title="Ubicá cada unidad en el conjunto">
          Subí la implantación o una vista aérea y marcá cada mitad. En el sitio, el comprador toca la unidad y ve su ficha.
        </StepIntro>
        <div className="flex flex-col gap-2">
          <FieldLabel>Sobre qué imagen</FieldLabel>
          <div className="grid gap-2 grid-cols-2">
            <ChoiceCard on={source === 'implantacion'} onClick={() => setSource('implantacion')} title="Implantación" hint="Plano visto desde arriba" />
            <ChoiceCard on={source === 'aerea'} onClick={() => setSource('aerea')} title="Vista aérea" hint="Render o foto de dron" />
          </div>
        </div>
        <ImageUploader value={image} onChange={setImage} folder="floorplans" label={source === 'implantacion' ? 'Implantación' : 'Vista aérea'} />
        <ul className="m-0 p-0 list-none flex flex-col gap-1.5" aria-label="Unidades">
          {units.map((u, i) => {
            const on = u.id === activeId;
            return (
              <li key={u.id}>
                <button type="button" onClick={() => setActiveId(u.id)} aria-pressed={on}
                  className={`w-full flex items-center gap-3 min-h-[48px] px-3 rounded-[10px] text-left border transition-colors ${on ? 'border-[1.5px] border-brand-700 bg-brand-50' : 'border-gray-200 bg-white hover:border-gray-300'}`}>
                  <span aria-hidden className="w-2.5 h-2.5 rounded-[3px]" style={{ background: SHAPE_PALETTE[i % SHAPE_PALETTE.length] }} />
                  <span className="flex-1 min-w-0 flex flex-col">
                    <span className="text-sm font-semibold text-gray-900">{u.code}</span>
                    <span className="text-[11px] text-gray-500 truncate">{u.model_name ?? u.type}</span>
                  </span>
                  <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${isMarked(u.id) ? 'bg-brand-100 text-brand-800' : 'bg-gray-100 text-gray-600'}`}>
                    {isMarked(u.id) ? 'Marcada' : 'Sin marcar'}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        <button type="button" onClick={onNext} className="self-start min-h-[44px] text-sm font-medium text-gray-700 underline underline-offset-2 hover:text-gray-900">
          Saltear por ahora
        </button>
      </section>

      <main className="flex-[2_1_520px] min-w-0 flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <span className="text-sm font-semibold text-gray-900">{activeUnit ? `Marcando ${activeUnit.code}` : 'Elegí una unidad'}</span>
          <Segmented label="Modo de dibujo" value={mode} onChange={setMode} options={[{ value: 'rectangle', label: 'Rectángulo' }, { value: 'point', label: 'Forma libre' }]} />
        </div>
        {image ? (
          <div className="rounded-2xl border border-gray-200 bg-white p-2">
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
          <div className="min-h-[360px] rounded-2xl border-[1.5px] border-dashed border-gray-300 bg-white flex items-center justify-center p-6 text-center text-sm text-gray-500">
            Subí la implantación o la vista aérea para empezar a marcar las unidades.
          </div>
        )}
        <ErrorNote>{error}</ErrorNote>
        <StepFooter
          back={{ label: 'Conjunto', onClick: onBack }}
          summary={<>{marked} de {units.length} unidades marcadas</>}
          primary={{ label: 'Terminar →', onClick: save, busy, disabled: !image }}
        />
      </main>
    </div>
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
          { label: 'Relato', text: 'Por qué dúplex y no casas aisladas.', href: '/admin/sitio' },
          { label: 'Fotos y renders del modelo', text: `Se cargan una vez y se ven en las ${units.length}.`, href: '/admin/edificios' },
          { label: 'Equipo', text: 'Aparece en el portfolio de cada persona.', href: '/admin/sitio' },
          { label: 'Proceso y antes / después', text: 'Del terreno a la obra terminada.', href: '/admin/proyecto' },
        ]}
        hiddenInShowcase="Precios, estados, leads ni calculadora."
        aside={<PreviewCard project={project} meta={`Dúplex · ${units.length} unidades${project.location ? ` · ${project.location}` : ''}`} />}
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
