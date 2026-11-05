'use client';

import { useMemo, useState } from 'react';
import { TransitionLink as Link } from '@/components/ui/TransitionUtils';
import ImageUploader from '@/components/admin/ImageUploader';
import MultiImageUploader from '@/components/admin/MultiImageUploader';
import { useToast } from '@/components/ui/ToastProvider';
import { UNIT_FEATURE_GROUPS, ROOM_KIND_LABEL } from '@/lib/units';
import type { RoomKind, TourData, TourNode, UnitStatus } from '@/types';
import type { FlowProps } from './GuidedLoad';
import ListoScreen, { PreviewCard } from './ListoScreen';
import {
  GuidedHeader, FormWithPreview, FormSection, StepIntro, StepFooter, NumberStepper, Segmented, NumberField, FieldLabel, ErrorNote, ArrowIcon,
  inputClass, allUnits, formatNumber, formatMoney, useGuidedApi, type GUnit, type GRoom, type GuidedProject,
} from './shared';

const STEPS = [{ label: 'La casa' }, { label: 'Ambientes' }, { label: 'Listo' }];

export default function CasaFlow({ project, tree, reload, step, goTo }: FlowProps) {
  const unit = allUnits(tree)[0] ?? null;
  const current = Math.min(STEPS.length, step ?? 1);

  return (
    <>
      <GuidedHeader project={project} kindLabel="Casa" steps={STEPS} current={unit ? current : 1} onStep={goTo} canGoTo={() => !!unit} />
      {!unit ? (
        <div className="max-w-[640px] mx-auto px-4 sm:px-6 py-12 flex flex-col gap-4">
          <StepIntro eyebrow="Casa" title="Todavía no encontramos la casa de este proyecto.">
            Normalmente se crea sola al dar de alta el proyecto. Abrí el asistente anterior para crearla y volvé acá.
          </StepIntro>
          <Link href="/admin/wizard" className="self-start min-h-[48px] px-5 rounded-xl bg-gray-900 text-white text-sm font-semibold hover:bg-gray-800 flex items-center">
            Crear la casa →
          </Link>
        </div>
      ) : (
        <>
          {current === 1 && <DatosStep key={unit.id} project={project} unit={unit} reload={reload} onNext={() => goTo(2)} />}
          {current === 2 && <AmbientesStep key={unit.id} unit={unit} reload={reload} onBack={() => goTo(1)} onNext={() => goTo(3)} />}
          {current === 3 && <CasaListo project={project} unit={unit} onBackToStart={() => goTo(1)} />}
        </>
      )}
    </>
  );
}

// ─── Paso 1 ────────────────────────────────────────────────────────

type Etapa = 'anteproyecto' | 'obra' | 'construida' | 'concurso';
const ETAPA_OPTIONS: { value: Etapa; label: string }[] = [
  { value: 'anteproyecto', label: 'Anteproyecto' },
  { value: 'obra', label: 'En obra' },
  { value: 'construida', label: 'Construida' },
  { value: 'concurso', label: 'Concurso' },
];
const ETAPA_LABEL = Object.fromEntries(ETAPA_OPTIONS.map(o => [o.value, o.label])) as Record<Etapa, string>;
const STATUS_OPTIONS: { value: UnitStatus; label: string }[] = [
  { value: 'available', label: 'Disp.' },
  { value: 'reserved', label: 'Res.' },
  { value: 'sold', label: 'Vend.' },
];
const STATUS_LABEL: Record<UnitStatus, string> = { available: 'Disponible', reserved: 'Reservada', sold: 'Vendida' };

function DatosStep({ project, unit, reload, onNext }: { project: GuidedProject; unit: GUnit; reload: () => Promise<void>; onNext: () => void }) {
  const { patch, patchProject } = useGuidedApi();
  const toast = useToast();
  const showcase = project.saleMode === 'showcase';
  const [f, setF] = useState({
    bedrooms: unit.bedrooms,
    bathrooms: Math.round(unit.bathrooms),
    floorsCount: unit.floors_count,
    livingRooms: unit.living_rooms,
    garageSpaces: unit.garage_spaces,
    lotSize: unit.lot_size,
    innerArea: unit.inner_area,
    balconyArea: unit.balcony_area || null as number | null,
    price: unit.price,
    hoaFee: unit.hoa_fee,
    status: unit.status,
    features: unit.features ?? [],
  });
  const [etapa, setEtapa] = useState<Etapa>(unit.condition === 'en_construccion' ? 'obra' : unit.condition === 'a_estrenar' ? 'construida' : 'anteproyecto');
  const [year, setYear] = useState(project.academicYear ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF(prev => ({ ...prev, [k]: v }));
  const total = (f.innerArea ?? 0) + (f.balconyArea ?? 0);

  const toggleFeature = (opt: string) => set('features', f.features.includes(opt) ? f.features.filter(x => x !== opt) : [...f.features, opt]);

  const save = async () => {
    setBusy(true);
    setError('');
    const fields: Record<string, unknown> = {
      id: unit.id,
      bedrooms: f.bedrooms,
      bathrooms: f.bathrooms,
      floorsCount: Math.max(1, f.floorsCount),
      livingRooms: f.livingRooms,
      garageSpaces: f.garageSpaces,
      lotSize: f.lotSize,
      innerArea: f.innerArea,
      balconyArea: f.balconyArea ?? 0,
      totalArea: total > 0 ? total : null,
      features: f.features,
    };
    if (showcase) {
      fields.condition = etapa === 'obra' ? 'en_construccion' : etapa === 'construida' ? 'a_estrenar' : null;
    } else {
      fields.price = f.price;
      fields.hoaFee = f.hoaFee;
      fields.status = f.status;
    }
    const res = await patch({ units: [fields] });
    if (res.ok && showcase && year.trim() !== (project.academicYear ?? '')) {
      const pr = await patchProject({ academicYear: year.trim() });
      if (!pr.ok) { setBusy(false); setError(pr.error); return; }
    }
    setBusy(false);
    if (!res.ok) { setError(res.error); return; }
    toast('Datos de la casa guardados.');
    await reload();
    onNext();
  };

  const program: { key: 'bedrooms' | 'bathrooms' | 'floorsCount' | 'livingRooms' | 'garageSpaces'; label: string; min: number }[] = [
    { key: 'bedrooms', label: 'Dormitorios', min: 0 },
    { key: 'bathrooms', label: 'Baños', min: 0 },
    { key: 'floorsCount', label: 'Plantas', min: 1 },
    { key: 'livingRooms', label: 'Livings', min: 0 },
    { key: 'garageSpaces', label: 'Cocheras', min: 0 },
  ];

  const allFeatures = UNIT_FEATURE_GROUPS.flatMap(g => g.options);
  const stats = showcase
    ? [
        { v: String(f.bedrooms), l: 'dorm.' },
        { v: f.innerArea ? formatNumber(f.innerArea) : '—', l: 'm² cubiertos' },
        { v: f.lotSize ? formatNumber(f.lotSize) : '—', l: 'm² terreno' },
      ]
    : [
        { v: String(f.bedrooms), l: 'dorm.' },
        { v: String(f.bathrooms), l: 'baños' },
        { v: f.innerArea ? formatNumber(f.innerArea) : '—', l: 'm² cub.' },
        { v: f.lotSize ? formatNumber(f.lotSize) : '—', l: 'm² terreno' },
      ];
  const etapaYear = [ETAPA_LABEL[etapa], year.trim()].filter(Boolean).join(' · ');

  const preview = (
    <>
      <span className="text-[13px] font-semibold text-gray-900">{showcase ? 'Así se ve en el portfolio' : 'Así se ve la ficha'}</span>
      <div className="rounded-[14px] overflow-hidden bg-white shadow-[0_1px_2px_rgba(23,25,26,0.06),0_12px_32px_-12px_rgba(23,25,26,0.18)]">
        {project.masterplanImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={project.masterplanImage} alt="" className="w-full aspect-[4/3] object-cover" />
        ) : (
          <div className="aspect-[4/3] flex items-end p-4 box-border"
            style={{ background: showcase ? 'repeating-linear-gradient(135deg, #8E9B86 0 14px, #9AA693 14px 28px)' : 'repeating-linear-gradient(135deg, #A89C8A 0 14px, #B3A895 14px 28px)' }}>
            <span className="text-[11px] text-white bg-[rgba(23,25,26,0.6)] px-2 py-1 rounded-md">[ Foto de la casa ]</span>
          </div>
        )}
        <div className="p-[18px] flex flex-col gap-3">
          <div className="flex justify-between items-baseline gap-3">
            <span className="font-display text-[22px] leading-tight font-semibold text-gray-900 min-w-0">{project.name}</span>
            {showcase
              ? (etapaYear && <span className="shrink-0 text-[11px] font-semibold px-2 py-[3px] rounded-full bg-[#EAE7E0] text-gray-700">{etapaYear}</span>)
              : <span className="shrink-0 text-[11px] font-semibold px-2 py-[3px] rounded-full bg-brand-100 text-brand-800">{STATUS_LABEL[f.status]}</span>}
          </div>
          {!showcase && <span className="font-display text-lg font-semibold text-gray-900">{f.price ? formatMoney(f.price) : 'USD [precio]'}</span>}
          <div className="grid gap-px bg-[#F0EDE7] rounded-[10px] overflow-hidden" style={{ gridTemplateColumns: `repeat(${stats.length}, minmax(0, 1fr))` }}>
            {stats.map(c => (
              <div key={c.l} className="bg-gray-50 px-2 py-2.5 min-w-0">
                <div className="font-display text-base font-semibold text-gray-900">{c.v}</div>
                <div className="text-[10px] text-gray-500 truncate">{c.l}</div>
              </div>
            ))}
          </div>
          {f.features.length > 0 && <span className="text-xs text-gray-600">{f.features.join(' · ')}</span>}
        </div>
      </div>
      {showcase && <span className="text-xs text-gray-600">Sin precio, estado ni botón de consulta.</span>}
    </>
  );

  return (
    <FormWithPreview preview={preview} previewLabel="Vista en vivo">
      <StepIntro eyebrow={showcase ? 'Paso 1 de 3 · Solo para mostrar' : 'Paso 1 de 3'} title="Contanos cómo es la casa">
        {showcase
          ? 'Sin precio ni estado de venta. En su lugar, la ficha de obra que se ve en tu portfolio.'
          : 'Una casa es una sola unidad: no hay pisos ni delimitación. Completá lo que sepas; lo demás se suma después.'}
      </StepIntro>

      {showcase && (
        <FormSection title="Ficha de obra" first>
          <div className="flex flex-col gap-1.5">
            <FieldLabel>Etapa</FieldLabel>
            <Segmented label="Etapa" value={etapa} onChange={setEtapa} options={ETAPA_OPTIONS} />
          </div>
          <div className="grid gap-2.5 grid-cols-1 sm:grid-cols-3">
            <label className="flex flex-col gap-1.5">
              <FieldLabel>Año</FieldLabel>
              <input value={year} onChange={e => setYear(e.target.value.slice(0, 20))} inputMode="numeric" placeholder="Ej: 2025" className={inputClass} />
            </label>
          </div>
        </FormSection>
      )}

      <FormSection title="Programa" first={!showcase}>
        <div className="grid gap-2.5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))' }}>
          {program.map(p => (
            <NumberStepper key={p.key} variant="card" label={p.label} value={f[p.key]} min={p.min} max={30} onChange={n => set(p.key, n)} />
          ))}
        </div>
      </FormSection>

      <FormSection title="Superficies">
        <div className="grid gap-2.5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
          <NumberField label="Terreno" suffix="m²" value={f.lotSize} onChange={n => set('lotSize', n)} />
          <NumberField label="Cubierta" suffix="m²" value={f.innerArea} onChange={n => set('innerArea', n)} />
          <NumberField label="Semicubierta" suffix="m²" value={f.balconyArea} onChange={n => set('balconyArea', n)} />
        </div>
        {total > 0 && <p className="m-0 text-xs text-gray-500">Superficie total construida: {formatNumber(total)} m²</p>}
      </FormSection>

      {!showcase && (
        <FormSection title="Comercial" aside="Solo si es para vender">
          <div className="grid gap-2.5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
            <NumberField label="Precio" prefix="USD" value={f.price} onChange={n => set('price', n)} />
            <NumberField label="Expensas / mes" value={f.hoaFee} onChange={n => set('hoaFee', n)} />
            <div className="flex flex-col gap-1.5 min-w-0">
              <FieldLabel>Estado</FieldLabel>
              <Segmented label="Estado" value={f.status} onChange={v => set('status', v)} options={STATUS_OPTIONS} />
            </div>
          </div>
        </FormSection>
      )}

      {!showcase && (
        <FormSection title="Comodidades">
          <div className="flex flex-wrap gap-2">
            {allFeatures.map(opt => {
              const on = f.features.includes(opt);
              return (
                <button key={opt} type="button" aria-pressed={on} onClick={() => toggleFeature(opt)}
                  className={`min-h-[40px] px-3.5 rounded-full text-[13px] transition-colors ${on ? 'border-[1.5px] border-brand-700 bg-brand-50 font-semibold text-gray-900' : 'border border-gray-300 bg-white text-gray-700 hover:border-gray-400'}`}>
                  {opt}
                </button>
              );
            })}
          </div>
        </FormSection>
      )}

      <ErrorNote>{error}</ErrorNote>
      <div className="flex justify-end pt-6 border-t border-gray-200">
        <button type="button" onClick={save} disabled={busy}
          className="w-full sm:w-auto min-h-[48px] px-5 rounded-xl bg-gray-900 text-white text-sm font-semibold inline-flex items-center justify-center gap-2.5 hover:bg-black disabled:bg-gray-200 disabled:text-gray-400">
          {busy ? 'Guardando...' : <>Seguir con los ambientes <ArrowIcon /></>}
        </button>
      </div>
    </FormWithPreview>
  );
}

// ─── Paso 2 ────────────────────────────────────────────────────────

let roomSeq = 0;
const newRoomId = () => `room-${Date.now().toString(36)}-${(roomSeq++).toString(36)}`;

function roomsFromCounts(unit: GUnit): GRoom[] {
  const rooms: GRoom[] = [];
  const add = (kind: RoomKind, name: string) => rooms.push({ id: newRoomId(), name, kind, images: [] });
  for (let i = 1; i <= Math.max(1, unit.living_rooms); i++) add('living', unit.living_rooms > 1 ? `Living ${i}` : 'Living');
  add('kitchen', 'Cocina');
  for (let i = 1; i <= unit.bedrooms; i++) add('bedroom', unit.bedrooms > 1 ? `Dormitorio ${i}` : 'Dormitorio');
  for (let i = 1; i <= Math.round(unit.bathrooms); i++) add('bathroom', Math.round(unit.bathrooms) > 1 ? `Baño ${i}` : 'Baño');
  add('other', 'Exterior');
  return rooms;
}

const KIND_OPTIONS = (Object.keys(ROOM_KIND_LABEL) as RoomKind[]).map(k => ({ value: k, label: ROOM_KIND_LABEL[k] }));

function AmbientesStep({ unit, reload, onBack, onNext }: { unit: GUnit; reload: () => Promise<void>; onBack: () => void; onNext: () => void }) {
  const { patch } = useGuidedApi();
  const toast = useToast();
  const existingNodes = useMemo(() => unit.tour_data?.nodes ?? [], [unit.tour_data]);
  const [rooms, setRooms] = useState<GRoom[]>(() => (unit.rooms && unit.rooms.length > 0 ? unit.rooms.map(r => ({ ...r, images: r.images ?? [] })) : roomsFromCounts(unit)));
  const [panos, setPanos] = useState<Record<string, string>>(() => Object.fromEntries(
    (unit.rooms ?? []).filter(r => r.tourNodeId).map(r => [r.id, existingNodes.find(n => n.id === r.tourNodeId)?.imageUrl ?? '']),
  ));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // El ambiente que se está editando: en desktop abre su editor debajo de
  // la grilla; en celular es el acordeón abierto (uno por vez).
  const [openId, setOpenId] = useState<string | null>(null);

  const update = (id: string, patchRoom: Partial<GRoom>) => setRooms(prev => prev.map(r => (r.id === id ? { ...r, ...patchRoom } : r)));
  const remove = (id: string) => setRooms(prev => prev.filter(r => r.id !== id));

  const withPhotos = rooms.filter(r => (r.images?.length ?? 0) > 0).length;
  const panoCount = rooms.filter(r => panos[r.id]).length;

  const save = async () => {
    setBusy(true);
    setError('');
    const linkedNodeIds = new Set((unit.rooms ?? []).filter(r => r.tourNodeId).map(r => r.tourNodeId as string));
    // Nodos del tour que no vienen de un ambiente (cargados en el editor de tour) se conservan.
    const foreignNodes = existingNodes.filter(n => !linkedNodeIds.has(n.id));
    const nextRooms: GRoom[] = [];
    const roomNodes: TourNode[] = [];
    for (const r of rooms) {
      const url = panos[r.id];
      if (url) {
        const nodeId = r.tourNodeId ?? `node-${r.id}`;
        const prev = existingNodes.find(n => n.id === nodeId);
        roomNodes.push({ ...(prev ?? {}), id: nodeId, name: r.name, imageUrl: url });
        nextRooms.push({ ...r, tourNodeId: nodeId });
      } else {
        nextRooms.push({ ...r, tourNodeId: undefined });
      }
    }
    const nodes = [...roomNodes, ...foreignNodes];
    const tourData: TourData | null = nodes.length
      ? { initialNodeId: nodes.some(n => n.id === unit.tour_data?.initialNodeId) ? unit.tour_data!.initialNodeId : nodes[0].id, nodes }
      : null;
    const gallery = [...new Set([...(unit.gallery_images ?? []), ...rooms.flatMap(r => r.images ?? [])].filter(Boolean))];
    const res = await patch({ units: [{ id: unit.id, rooms: nextRooms, tourData, galleryImages: gallery }] });
    setBusy(false);
    if (!res.ok) { setError(res.error); return; }
    toast('Ambientes guardados.');
    await reload();
    onNext();
  };

  const TINTS = [['#CFCAC0', '#DAD5CB'], ['#C9D3CD', '#D6DED9'], ['#D7CFC2', '#E0D9CD'], ['#C9CFD6', '#D5DAE0']];
  const counts = `${unit.bedrooms} dormitorio${unit.bedrooms === 1 ? '' : 's'}, ${Math.round(unit.bathrooms)} baño${Math.round(unit.bathrooms) === 1 ? '' : 's'}, living…`;
  const selected = rooms.find(r => r.id === openId) ?? null;
  const addRoom = () => { const id = newRoomId(); setRooms(prev => [...prev, { id, name: 'Ambiente', kind: 'other', images: [] }]); setOpenId(id); };

  // Editor de un ambiente: nombre, tipo, m², fotos y panorámica. En desktop
  // aparece debajo de la grilla al tocar una tarjeta; en celular, adentro
  // del acordeón.
  const editor = (r: GRoom) => (
    <div className="flex flex-col gap-3">
      <div className="flex items-end gap-2 max-sm:flex-wrap">
        <label className="flex-1 max-sm:basis-full min-w-0 flex flex-col gap-1.5">
          <FieldLabel>Nombre</FieldLabel>
          <input value={r.name} onChange={e => update(r.id, { name: e.target.value })} className={inputClass} />
        </label>
        <label className="flex flex-col gap-1.5 w-[140px] max-sm:flex-1">
          <FieldLabel>Tipo</FieldLabel>
          <select value={r.kind ?? 'other'} onChange={e => update(r.id, { kind: e.target.value as RoomKind })} className={inputClass}>
            {KIND_OPTIONS.map(k => <option key={k.value} value={k.value}>{k.label}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1.5 w-[110px] max-sm:flex-1">
          <FieldLabel>Superficie</FieldLabel>
          <span className="flex items-center min-h-[44px] rounded-[9px] border border-gray-300 bg-white pr-3 focus-within:border-brand-700">
            <input inputMode="decimal" value={r.area ?? ''} placeholder="—"
              onChange={e => { const v = e.target.value.replace(/[^\d.,]/g, '').replace(',', '.'); update(r.id, { area: v === '' ? undefined : Number(v) }); }}
              className="flex-1 min-w-0 px-3 text-sm bg-transparent outline-none" />
            <span className="text-xs text-gray-500">m²</span>
          </span>
        </label>
        <button type="button" onClick={() => { remove(r.id); setOpenId(null); }} aria-label={`Quitar ${r.name}`}
          className="w-11 h-11 shrink-0 rounded-[10px] border border-gray-200 bg-white text-gray-500 hover:text-red-600 hover:border-red-200">✕</button>
      </div>
      <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(280px, 100%), 1fr))' }}>
        <MultiImageUploader values={r.images ?? []} onChange={urls => update(r.id, { images: urls })} folder="units" label="Fotos" />
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-gray-700">Panorámica 360° <span className="font-normal text-gray-500">— opcional</span></span>
          <ImageUploader value={panos[r.id] ?? ''} onChange={url => setPanos(prev => ({ ...prev, [r.id]: url }))} folder="tours" />
        </div>
      </div>
    </div>
  );

  return (
    <main className="flex-1 px-4 py-8 sm:px-10 sm:pt-10 sm:pb-12">
      <div className="max-w-[1160px] mx-auto flex flex-col gap-6">
        <StepIntro eyebrow="Paso 2 de 3" title="Recorré la casa por ambientes">
          Armamos la lista con lo que cargaste: {counts} Soltá las fotos de cada ambiente; si tenés panorámicas, se arma el recorrido 360°.
        </StepIntro>

        {/* Desktop: grilla de tarjetas como en el diseño; tocar una abre su editor abajo. */}
        <div className="max-sm:hidden grid gap-3.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
          {rooms.map((r, i) => {
            const photos = r.images?.length ?? 0;
            const empty = photos === 0;
            const on = openId === r.id;
            const tint = TINTS[i % TINTS.length];
            return (
              <button key={r.id} type="button" onClick={() => setOpenId(on ? null : r.id)} aria-expanded={on}
                className={`flex flex-col rounded-[14px] overflow-hidden bg-white text-left ${
                  on ? 'outline outline-2 outline-gray-900 outline-offset-2 border border-gray-200' : empty ? 'border-[1.5px] border-dashed border-[#C9C3B7]' : 'border border-gray-200'
                }`}>
                <span className="relative aspect-[4/3] flex items-center justify-center"
                  style={empty ? { background: '#F7F5F1' } : r.images?.[0] ? undefined : { background: `repeating-linear-gradient(135deg, ${tint[0]} 0 12px, ${tint[1]} 12px 24px)` }}>
                  {!empty && r.images?.[0] && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={r.images[0]} alt="" className="absolute inset-0 w-full h-full object-cover" />
                  )}
                  {empty && <span className="text-xs text-gray-600">+ Fotos</span>}
                  {panos[r.id] && <span className="absolute left-2 top-2 text-[10px] font-bold px-[7px] py-[3px] rounded-[5px] bg-gray-900 text-white">360°</span>}
                  {!empty && <span className="absolute right-2 bottom-2 text-[11px] font-semibold px-[7px] py-[3px] rounded-[5px] bg-white/90 text-gray-900">{photos} foto{photos === 1 ? '' : 's'}</span>}
                </span>
                <span className="px-3.5 py-3 flex justify-between items-baseline gap-2">
                  <span className="text-sm font-semibold text-gray-900 truncate">{r.name || 'Ambiente'}</span>
                  <span className="text-xs text-gray-500 shrink-0">{r.area ? `${formatNumber(r.area)} m²` : ''}</span>
                </span>
              </button>
            );
          })}
          <button type="button" onClick={addRoom}
            className="min-h-[200px] rounded-[14px] border-[1.5px] border-dashed border-[#C9C3B7] bg-transparent text-[13px] text-gray-600 hover:bg-white">
            + Otro ambiente
          </button>
        </div>
        {selected && (
          <section aria-label={`Editar ${selected.name}`} className="max-sm:hidden p-5 rounded-[14px] bg-white border border-gray-200 flex flex-col gap-3">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="m-0 text-[15px] font-semibold text-gray-900">{selected.name || 'Ambiente'}</h2>
              <button type="button" onClick={() => setOpenId(null)} className="min-h-[36px] text-[13px] font-medium text-gray-600 hover:text-gray-900">Cerrar</button>
            </div>
            {editor(selected)}
          </section>
        )}

        {/* Celular: un ambiente abierto por vez. */}
        <div className="sm:hidden flex flex-col gap-2">
          {rooms.map(r => {
            const open = openId === r.id;
            const photos = r.images?.length ?? 0;
            return (
              <div key={r.id} className={`rounded-[14px] bg-white flex flex-col ${photos ? 'border border-gray-200' : 'border-[1.5px] border-dashed border-[#C9C3B7]'}`}>
                <button type="button" onClick={() => setOpenId(open ? null : r.id)} aria-expanded={open}
                  className="flex items-center gap-3 min-h-[56px] px-4 text-left">
                  <span className="flex-1 min-w-0 flex flex-col">
                    <span className="text-sm font-semibold text-gray-900 truncate">{r.name || 'Ambiente'}</span>
                    <span className="text-xs text-gray-500">
                      {KIND_OPTIONS.find(k => k.value === (r.kind ?? 'other'))?.label ?? 'Ambiente'} · {photos ? `${photos} foto${photos === 1 ? '' : 's'}` : 'Sin fotos'}
                    </span>
                  </span>
                  {panos[r.id] && <span className="text-[10px] font-bold px-[7px] py-[3px] rounded-[5px] bg-gray-900 text-white">360°</span>}
                  <span aria-hidden className="text-gray-500">{open ? '−' : '+'}</span>
                </button>
                {open && <div className="px-4 pb-4">{editor(r)}</div>}
              </div>
            );
          })}
          <button type="button" onClick={addRoom}
            className="min-h-[56px] rounded-[14px] border-[1.5px] border-dashed border-[#C9C3B7] text-[13px] text-gray-600">
            + Otro ambiente
          </button>
        </div>

        <ErrorNote>{error}</ErrorNote>
        <StepFooter
          back={{ label: 'La casa', onClick: onBack }}
          summary={<>{withPhotos} de {rooms.length} ambientes con fotos · {panoCount} panorámica{panoCount === 1 ? '' : 's'}{panoCount > 0 ? ` → recorrido de ${panoCount} escena${panoCount === 1 ? '' : 's'}` : ''}</>}
          primary={{ label: 'Terminar', onClick: save, busy }}
        />
      </div>
    </main>
  );
}

// ─── Paso 3 ────────────────────────────────────────────────────────

function CasaListo({ project, unit, onBackToStart }: { project: GuidedProject; unit: GUnit; onBackToStart: () => void }) {
  const showcase = project.saleMode === 'showcase';
  const roomsCount = unit.rooms?.length ?? 0;
  const scenes = unit.tour_data?.nodes.length ?? 0;
  const metaParts = [
    `${unit.bedrooms} dorm.`,
    `${Math.round(unit.bathrooms)} baño${Math.round(unit.bathrooms) === 1 ? '' : 's'}`,
    unit.inner_area ? `${formatNumber(unit.inner_area)} m² cub.` : null,
    unit.lot_size ? `${formatNumber(unit.lot_size)} m² de terreno` : null,
  ].filter(Boolean).join(' · ');

  if (showcase) {
    const etapa = unit.condition === 'en_construccion' ? 'En obra' : unit.condition === 'a_estrenar' ? 'Construida' : null;
    const lead = [etapa ? `${etapa}${project.academicYear ? ` en ${project.academicYear}` : ''}` : null, `${unit.bedrooms} dormitorios`, roomsCount ? `${roomsCount} ambientes con fotos` : null].filter(Boolean).join(', ');
    return (
      <ListoScreen
        project={project}
        eyebrow="Paso 3 de 3"
        title="La obra ya tiene ficha."
        text={`${lead}. Falta la portada y el texto que la cuenta.`}
        optionalTitle="Para que luzca en tu portfolio"
        optional={[
          { label: 'Relato', text: 'Idea, sitio y materiales', href: '/admin/sitio', tag: 'Recomendado' },
          { label: 'Equipo y créditos', text: 'Estudio, colaboradores, fotografía', href: '/admin/sitio', tag: 'Recomendado' },
          { label: 'Proceso y antes / después', text: 'Bocetos, maqueta, obra', href: '/admin/proyecto', tag: 'Suma' },
          { label: 'Planos y modelo BIM', text: 'Planta, corte, IFC', href: '/admin/proyecto/bim', tag: 'Suma' },
        ]}
        hiddenInShowcase="No se muestran precio, estado, consulta ni calculadora."
        aside={<PreviewCard project={project} badge="Nuevo" meta={[etapa, project.academicYear].filter(Boolean).join(' · ') || metaParts} />}
        onBackToStart={onBackToStart}
      />
    );
  }

  return (
    <ListoScreen
      project={project}
      eyebrow="Paso 3 de 3"
      title="La casa ya tiene ficha."
      text={`Datos${unit.price ? ', precio' : ''}${roomsCount ? `, ${roomsCount} ambientes` : ''}${scenes ? ` y un recorrido de ${scenes} escena${scenes === 1 ? '' : 's'}` : ''}. Solo falta la foto de portada para publicar.`}
      optionalTitle="Suma, pero no bloquea"
      optionalLayout="rows"
      optional={[
        { label: 'Vista frontal', text: 'Una foto de la fachada con puntos de interés', href: '/admin/proyecto' },
        { label: 'Entorno', text: 'Ubicación y lugares cercanos', href: '/admin/proyecto/ubicacion' },
        { label: 'Planos y modelo BIM', text: 'Planta 3D, plano técnico, IFC', href: '/admin/proyecto/bim' },
        { label: 'Relato y equipo', text: 'Quién la diseñó y por qué', href: '/admin/sitio' },
      ]}
      aside={
        <PreviewCard
          project={project}
          meta={metaParts}
          footer={<span className="font-display text-lg font-semibold text-gray-900 pt-1">{unit.price ? formatMoney(unit.price, unit.currency) : '[Precio]'}</span>}
        />
      }
      onBackToStart={onBackToStart}
    />
  );
}
