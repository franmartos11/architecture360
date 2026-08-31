'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { TransitionLink as Link } from '@/components/ui/TransitionUtils';
import ImageUploader from '@/components/admin/ImageUploader';
import MultiImageUploader from '@/components/admin/MultiImageUploader';
import TourOrientationControl from '@/components/admin/TourOrientationControl';

// Editor de recorrido 360° — pesado (VirtualTour, panoramas). Solo se
// carga cuando se abre un depto a editar, no en cada mount de esta pantalla.
const TourEditor = dynamic(() => import('@/components/admin/TourEditor'), {
  loading: () => <div className="h-40 rounded-xl bg-gray-100 animate-pulse" />,
});
import type { UnitType, UnitStatus, TourData, Room, RoomKind, UnitLevel } from '@/types';
import type { UnitRow as DbUnitRow } from '@/types/database';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import ErrorState from '@/components/ui/ErrorState';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Button from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { useToast } from '@/components/ui/ToastProvider';
import { useConfirm } from '@/components/ui/ConfirmProvider';
import { parseCsv, downloadCsv } from '@/lib/csv';
import { useProjectTypeConfig } from '@/lib/project-type-context';
import { unitAgreement } from '@/lib/project-types';
import { formatPrice, deriveUnitType, hasRoomProgram, roomCounts, synthesizeRoomProgram, allProgramRooms, bearingToCardinal, roomFeatureOptions, UNIT_FEATURE_GROUPS, UNIT_CONDITION_OPTIONS } from '@/lib/units';

type UnitRow = Pick<DbUnitRow,
  | 'id' | 'code' | 'model_name' | 'type' | 'total_area' | 'inner_area' | 'balcony_area'
  | 'external_area' | 'bedrooms' | 'bathrooms' | 'has_service_room' | 'lot_size' | 'ceiling_height'
  | 'garage_spaces' | 'garage_type' | 'garage_covered' | 'garage_uncovered' | 'condition' | 'features'
  | 'living_rooms' | 'kitchens' | 'other_rooms_count' | 'other_rooms_description'
  | 'hoa_fee' | 'floors_count'
  | 'price' | 'currency' | 'status'
  | 'orientation' | 'interior_image_url' | 'gallery_images' | 'floor_plan_3d_url'
  | 'plan_3d_url' | 'technical_plan_url' | 'created_at'
  | 'room_plan_image' | 'rooms' | 'levels' | 'tour_image_url' | 'tour_data'
>;

// Lo que "Duplicar" arrastra de la unidad de origen pero que no se ve en el
// form (los ambientes y el recorrido 360° del depto) — se manda aparte en el
// payload de creación en vez de mezclarse con los campos visibles.
type DuplicateExtras = {
  roomPlanImage: string | null;
  rooms: Room[] | null;
  tourImageUrl: string | null;
  tourData: TourData | null;
};

type OtherUnitRow = Pick<DbUnitRow, 'id' | 'code'> & {
  building_name: string | null;
  floor_number: number | null;
};

const UNIT_TYPES: UnitType[] = ['monoambiente', '1 dormitorio', '2 dormitorios', '3 dormitorios', 'penthouse'];
// La casa NO elige tipología de una lista — puede tener 4, 5, 6+
// dormitorios. Se deriva del campo "Dormitorios" al guardar
// (deriveUnitType), así el filtro público la agrupa igual.

// Programa de ambientes de una casa — cada uno con su tipo, m² y
// características. Se guarda en units.rooms (el mismo array que después
// recibe el polígono en el paso de delimitación).
const ROOM_KIND_OPTIONS: { value: RoomKind; label: string }[] = [
  { value: 'bedroom', label: 'Dormitorio' },
  { value: 'bathroom', label: 'Baño' },
  { value: 'kitchen', label: 'Cocina' },
  { value: 'living', label: 'Living' },
  { value: 'dining', label: 'Comedor' },
  { value: 'studio', label: 'Escritorio / Estudio' },
  { value: 'laundry', label: 'Lavadero' },
  { value: 'storage', label: 'Depósito' },
  { value: 'other', label: 'Otro' },
];
const newRoomId = () => `r-${Math.random().toString(36).slice(2, 9)}`;

// Mismas monedas que reconoce formatPrice() en lib/units.ts — agregar acá
// una moneda sin agregarla ahí la deja guardable pero sin formato local
// específico al mostrarla (cae al genérico).
const CURRENCIES = ['USD', 'ARS', 'EUR', 'UYU', 'BRL', 'CLP', 'MXN', 'COP', 'PEN'] as const;

const CSV_COLUMNS = [
  'code', 'modelName', 'type', 'totalArea', 'innerArea', 'balconyArea', 'externalArea',
  'bedrooms', 'bathrooms', 'hasServiceRoom', 'price', 'currency', 'status', 'orientation',
  'interiorImageUrl', 'floorPlan3dUrl', 'plan3dUrl', 'technicalPlanUrl',
] as const;

const CSV_TEMPLATE_ROW = [
  'A01-01', 'SUITE GARDEN', '2 dormitorios', '65.5', '55', '10.5', '0',
  '2', '2', 'no', '150000', 'USD', 'available', 'NE', '', '', '', '',
];

const EMPTY_FORM = {
  code: '', modelName: '', type: '2 dormitorios' as UnitType,
  totalArea: '', innerArea: '', balconyArea: '0', externalArea: '0',
  bedrooms: '2', bathrooms: '2', hasServiceRoom: false,
  lotSize: '', ceilingHeight: '', hoaFee: '', floorsCount: '1',
  livingRooms: '1', kitchens: '1', otherRoomsCount: '0', otherRoomsDescription: '',
  garageSpaces: '0', garageType: 'cubierta' as 'cubierta' | 'descubierta',
  garageCovered: '0', garageUncovered: '0',
  condition: '' as '' | 'a_estrenar' | 'en_construccion' | 'en_pozo' | 'usada',
  features: [] as string[],
  price: '', currency: 'USD', status: 'available' as UnitStatus, orientation: '',
  interiorImageUrl: '', galleryImages: [] as string[],
  floorPlan3dUrl: '', plan3dUrl: '', technicalPlanUrl: '',
};

type SourceUnitLike = {
  model_name: string | null; type: UnitType; total_area: number | null; inner_area: number | null;
  balcony_area: number | null; external_area: number | null; bedrooms: number | null; bathrooms: number | null;
  has_service_room: boolean; lot_size: number | null; ceiling_height: number | null;
  garage_spaces: number; garage_type: 'cubierta' | 'descubierta' | null;
  garage_covered: number; garage_uncovered: number;
  condition: 'a_estrenar' | 'en_construccion' | 'en_pozo' | 'usada' | null; features: string[] | null;
  living_rooms: number; kitchens: number; other_rooms_count: number; other_rooms_description: string | null;
  hoa_fee: number | null; floors_count: number;
  price: number | null; currency: string; status: UnitStatus; orientation: string | null;
  interior_image_url: string | null; gallery_images: string[] | null; floor_plan_3d_url: string | null;
  plan_3d_url: string | null; technical_plan_url: string | null;
};

// Todos los campos del form salvo el código (que siempre tiene que ser
// único) — se usa para "Editar", "Duplicar", "Copiar de otro piso" y para
// heredar los valores de la última unidad cargada en un depto nuevo.
function formFieldsFromUnit(u: SourceUnitLike) {
  return {
    modelName: u.model_name ?? '',
    type: u.type,
    totalArea: String(u.total_area ?? ''),
    innerArea: String(u.inner_area ?? ''),
    balconyArea: String(u.balcony_area ?? 0),
    externalArea: String(u.external_area ?? 0),
    bedrooms: String(u.bedrooms ?? 0),
    bathrooms: String(u.bathrooms ?? 1),
    hasServiceRoom: u.has_service_room,
    lotSize: u.lot_size != null ? String(u.lot_size) : '',
    ceilingHeight: u.ceiling_height != null ? String(u.ceiling_height) : '',
    garageSpaces: String(u.garage_spaces ?? 0),
    garageType: u.garage_type ?? 'cubierta',
    garageCovered: String(u.garage_covered ?? 0),
    garageUncovered: String(u.garage_uncovered ?? 0),
    condition: u.condition ?? ('' as const),
    features: u.features ?? [],
    livingRooms: String(u.living_rooms ?? 1),
    kitchens: String(u.kitchens ?? 1),
    otherRoomsCount: String(u.other_rooms_count ?? 0),
    otherRoomsDescription: u.other_rooms_description ?? '',
    hoaFee: u.hoa_fee != null ? String(u.hoa_fee) : '',
    floorsCount: String(u.floors_count ?? 1),
    price: u.price != null ? String(u.price) : '',
    currency: u.currency || 'USD',
    status: u.status,
    orientation: u.orientation ?? '',
    interiorImageUrl: u.interior_image_url ?? '',
    galleryImages: u.gallery_images ?? [],
    floorPlan3dUrl: u.floor_plan_3d_url ?? '',
    plan3dUrl: u.plan_3d_url ?? '',
    technicalPlanUrl: u.technical_plan_url ?? '',
  };
}

// Editor de unidades de un piso (tabla + alta/edición) — se usa tanto en su
// pantalla standalone (pisos/[floorId]/page.tsx) como embebido dentro del
// wizard de carga guiada, para no repetir el formulario de 18 campos en
// dos lugares distintos.
//
// Tipos sin hasUnitStep (hoy: "casa") renderizan un modo distinto: acá el
// building YA ES la unidad (una casa no tiene sub-unidades adentro), así que en
// vez de tabla + alta múltiple se muestra directo el form de la única
// unidad del piso interno — en modo edición si ya existe, o de alta si
// todavía no. Sin tabla, sin CSV, sin "Duplicar/Borrar" (no hay lista).
export default function FloorUnitsEditor({ buildingId, floorId, onUnitsChange }: { buildingId?: string; floorId: string; onUnitsChange?: (units: UnitRow[]) => void }) {
  const [units, setUnits] = useState<UnitRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [allProjectUnits, setAllProjectUnits] = useState<OtherUnitRow[]>([]);
  const [copySourceId, setCopySourceId] = useState('');
  const [copying, setCopying] = useState(false);
  const [duplicateExtras, setDuplicateExtras] = useState<DuplicateExtras | null>(null);
  // Programa de ambientes (solo casa) — se guarda aparte del `form` de
  // campos planos. `rooms` es la planta baja (units.rooms); `levels` son
  // las plantas de más (units.levels), una por cada floorsCount - 1.
  // Ambos son los mismos arrays que después delimita "Ambientes y Tour".
  const [rooms, setRooms] = useState<Room[]>([]);
  const [levels, setLevels] = useState<UnitLevel[]>([]);
  const [activePlanta, setActivePlanta] = useState(0); // 0 = planta baja
  // Recorrido 360° del depto que se está editando — se muestra inline en el
  // form (TourEditor autoguarda su propio campo tour_data, aparte del
  // "Guardar cambios" del resto).
  const [editUnitTourData, setEditUnitTourData] = useState<TourData | null>(null);
  const toast = useToast();
  const confirmDialog = useConfirm();
  const inheritedDefaultsApplied = useRef(false);
  const singleRecordAutoEdited = useRef(false);
  const typeConfig = useProjectTypeConfig();
  const { hasUnitStep, unitLabel, buildingLabel, unitIsLand } = typeConfig;
  const uAgree = unitAgreement(typeConfig);
  const unitLabelLower = unitLabel.toLowerCase();
  const buildingLabelLower = buildingLabel.toLowerCase();
  const columnCount = (typeConfig.unitIsLand ? 3 : 4) + (typeConfig.showStatus ? 1 : 0) + (typeConfig.showPrice ? 1 : 0);
  // En "casa" el código de la unidad ES el nombre de la casa (se fija al
  // crearla, ver POST /api/admin/buildings) — no se vuelve a pedir. El
  // campo solo reaparece como fallback si por algún motivo la casa quedó
  // sin su unidad (proyecto viejo, creación a medias).
  const showCodeField = hasUnitStep || units.length === 0;

  // Unidades de CUALQUIER otro piso/edificio del proyecto — para poder
  // traer el mismo modelo a este piso sin retipear los 18 campos, cuando
  // el depto ya existe en otra torre o en un piso con layout distinto.
  // Solo aplica a tipos con varias unidades por piso — una "casa" es una
  // sola, no hay de dónde copiar. Se trae UNA vez (no cada vez que cambia
  // `units`), y el filtro contra las de este piso se hace al renderizar.
  useEffect(() => {
    if (!hasUnitStep) return;
    fetch('/api/admin/units')
      .then(res => res.json())
      .then((data: OtherUnitRow[]) => setAllProjectUnits(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, [hasUnitStep]);
  const otherUnits = useMemo(
    () => allProjectUnits.filter(u => !units.some(un => un.id === u.id)),
    [allProjectUnits, units],
  );

  const load = () => {
    setLoading(true);
    setLoadError(false);
    fetch(`/api/admin/units?floorId=${floorId}`)
      .then(res => res.json())
      .then((unitsData) => {
        const list: UnitRow[] = Array.isArray(unitsData) ? unitsData : [];
        setUnits(list);
        onUnitsChange?.(list);
        // La primera vez que se abre este piso, si ya tiene unidades
        // cargadas, el form de "Nueva unidad" arranca con los valores de
        // la última cargada (todo menos el código) — la mayoría de los
        // campos se repiten depto tras depto en el mismo piso.
        if (!inheritedDefaultsApplied.current && list.length > 0) {
          inheritedDefaultsApplied.current = true;
          const last = [...list].sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''))[0];
          setForm({ code: '', ...formFieldsFromUnit(last) });
        }
        setLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setLoadError(true);
        setLoading(false);
      });
  };

  useEffect(load, [floorId]);

  const startEdit = (u: UnitRow) => {
    setEditingId(u.id);
    setForm({ code: u.code, ...formFieldsFromUnit(u) });
    setRooms(u.rooms ?? []);
    setLevels(u.levels ?? []);
    setEditUnitTourData(u.tour_data ?? null);
    setActivePlanta(0);
    setDuplicateExtras(null);
  };

  // Sin paso de unidades propio (una casa ES la unidad): en cuanto se sabe
  // que ya existe, se entra a editarla derecho — no tiene sentido mostrarle
  // al usuario un form de "alta" vacío al lado de la única fila posible.
  useEffect(() => {
    if (hasUnitStep || singleRecordAutoEdited.current || units.length === 0) return;
    singleRecordAutoEdited.current = true;
    startEdit(units[0]);
  }, [hasUnitStep, units]);

  const cancelEdit = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setRooms([]);
    setLevels([]);
    setEditUnitTourData(null);
    setActivePlanta(0);
    setError('');
    setDuplicateExtras(null);
  };

  // Plantas efectivas del programa: planta baja (rooms) + una por cada
  // planta de más que declare "Cantidad de plantas". Si una todavía no
  // existe en `levels`, se ofrece un placeholder vacío.
  const floorsCount = Math.max(1, Number(form.floorsCount) || 1);
  const plantas: { label: string; rooms: Room[] }[] = [
    { label: 'Planta baja', rooms },
    ...Array.from({ length: floorsCount - 1 }, (_, i) => ({
      label: levels[i]?.label ?? `Piso ${i + 1}`,
      rooms: levels[i]?.rooms ?? [],
    })),
  ];
  const plantaIdx = Math.min(activePlanta, plantas.length - 1);
  const activeRooms = plantas[plantaIdx].rooms;

  // Arma el array `levels` completo (una sola columna JSONB) preservando
  // todo lo de cada planta extra, salvo lo que `over(k)` pise para la k
  // que corresponda. Se usa para escribir ambientes, plano 2D y render 3D
  // de una planta sin perder los de las demás.
  const buildLevels = (over: (k: number) => Partial<UnitLevel>): UnitLevel[] =>
    Array.from({ length: floorsCount - 1 }, (_, k) => ({
      id: levels[k]?.id ?? `piso-${k + 1}`,
      label: levels[k]?.label ?? `Piso ${k + 1}`,
      planImage: levels[k]?.planImage ?? null,
      plan3dImage: levels[k]?.plan3dImage ?? null,
      rooms: levels[k]?.rooms ?? [],
      ...over(k),
    }));

  // Escribe la lista de ambientes de la planta activa — planta baja pisa
  // `rooms`; una planta extra arma el array `levels`.
  const setActiveRooms = (next: Room[]) => {
    if (plantaIdx === 0) { setRooms(next); return; }
    const i = plantaIdx - 1;
    setLevels(buildLevels(k => (k === i ? { rooms: next } : {})));
  };

  // Render / planta 3D de la planta activa — planta baja vive en
  // form.floorPlan3dUrl (dato existente, sin migrar); las de más en
  // levels[k].plan3dImage.
  const activePlan3d = plantaIdx === 0 ? form.floorPlan3dUrl : (levels[plantaIdx - 1]?.plan3dImage ?? '');
  const setActivePlan3d = (url: string) => {
    if (plantaIdx === 0) { setForm(f => ({ ...f, floorPlan3dUrl: url })); return; }
    const i = plantaIdx - 1;
    setLevels(buildLevels(k => (k === i ? { plan3dImage: url || null } : {})));
  };


  // Se agrega arriba de todo — el ambiente nuevo queda a la vista sin
  // tener que scrollear la lista.
  const addRoom = () => setActiveRooms([{ id: newRoomId(), name: '', kind: 'bedroom' }, ...activeRooms]);
  const updateRoom = (id: string, patch: Partial<Room>) =>
    setActiveRooms(activeRooms.map(r => {
      if (r.id !== id) return r;
      const next = { ...r, ...patch };
      // Al cambiar el tipo, se descartan las características que ya no
      // aplican (ej. "En suite" al pasar de dormitorio a cocina).
      if (patch.kind && next.features?.length) {
        const valid = new Set(roomFeatureOptions(patch.kind));
        const kept = next.features.filter(f => valid.has(f));
        next.features = kept.length ? kept : undefined;
      }
      return next;
    }));
  const removeRoom = (id: string) => setActiveRooms(activeRooms.filter(r => r.id !== id));
  const toggleRoomFeature = (id: string, feature: string) =>
    setActiveRooms(activeRooms.map(r => {
      if (r.id !== id) return r;
      const has = r.features?.includes(feature);
      const features = has ? r.features!.filter(f => f !== feature) : [...(r.features ?? []), feature];
      return { ...r, features: features.length ? features : undefined };
    }));

  // Precarga el formulario de "Nueva unidad" con los datos de una unidad
  // existente (todo menos el código, que tiene que ser único) — para no
  // retipear los 18 campos cuando el mismo modelo se repite en el piso.
  // Los deptos idénticos también comparten ambientes y recorrido 360°, así
  // que eso viaja aparte en duplicateExtras y se suma recién al crear —
  // NO el polígono, que es la posición de este depto en el plano del piso
  // y por eso es única de cada unidad.
  const duplicateUnit = (u: UnitRow) => {
    setEditingId(null);
    setForm({ code: '', ...formFieldsFromUnit(u) });
    setDuplicateExtras({
      roomPlanImage: u.room_plan_image,
      rooms: u.rooms,
      tourImageUrl: u.tour_image_url,
      tourData: u.tour_data,
    });
    setError('');
    document.getElementById('code')?.focus();
  };

  // Trae los datos de una unidad de OTRO piso/edificio y precarga el
  // formulario — igual que "Duplicar" pero cruzando pisos. No copia
  // polígono/ambientes/tour porque esos dependen del plano de este piso
  // en particular, no del modelo del depto.
  const handleCopyFromUnit = async () => {
    if (!copySourceId) return;
    setCopying(true);
    const u = await fetch(`/api/admin/units/${copySourceId}`).then(res => res.json());
    setCopying(false);
    setEditingId(null);
    setForm({ code: '', ...formFieldsFromUnit(u) });
    setError('');
    setCopySourceId('');
    document.getElementById('code')?.focus();
  };

  // Cuando la casa tiene un programa de ambientes cargado (rooms con
  // kind, en cualquier planta), ese programa es la fuente de verdad de
  // los conteos — los inputs de dormitorios/baños/livings pasan a
  // solo-lectura.
  const allRooms = allProgramRooms(rooms, levels);
  const programActive = !hasUnitStep && hasRoomProgram(allRooms);
  const derivedCounts = roomCounts(allRooms);
  const effectiveBedrooms = programActive ? derivedCounts.bedrooms : Number(form.bedrooms || 0);

  // Lote: no tiene tipología de vivienda — se guarda un valor fijo.
  // Departamento: la elige el usuario del dropdown. Casa: se deriva de los
  // dormitorios (no hay lista fija — puede tener 4, 5, 6+).
  const resolvedType = unitIsLand ? 'lote' : hasUnitStep ? form.type : deriveUnitType(effectiveBedrooms);

  // Cardinal hacia donde mira la casa, derivado de los grados de la brújula.
  const orientationCardinal = form.orientation !== '' && Number.isFinite(Number(form.orientation))
    ? bearingToCardinal(Number(form.orientation))
    : '';

  // polygon y tourNodeId de cada ambiente los edita la pantalla de "Plano y
  // delimitación" (UnitRoomsEditor), no este form. Antes de guardar se
  // fusionan los valores frescos del server por id para no pisarlos con la
  // copia que se cargó al abrir el editor.
  const mergeDelimitation = (local: Room[], server: Room[] | null | undefined): Room[] => {
    const byId = new Map((server ?? []).map(r => [r.id, r] as const));
    return local.map(r => {
      const s = byId.get(r.id);
      return s ? { ...r, polygon: s.polygon, tourNodeId: s.tourNodeId } : r;
    });
  };

  const buildPayload = (roomsArg: Room[], levelsArg: UnitLevel[]) => ({
    code: form.code,
    modelName: form.modelName || null,
    type: resolvedType,
    totalArea: form.totalArea === '' ? null : Number(form.totalArea),
    innerArea: form.innerArea === '' ? null : Number(form.innerArea),
    balconyArea: Number(form.balconyArea || 0),
    externalArea: Number(form.externalArea || 0),
    bedrooms: programActive ? derivedCounts.bedrooms : Number(form.bedrooms || 0),
    bathrooms: programActive ? derivedCounts.bathrooms : Number(form.bathrooms || 1),
    hasServiceRoom: form.hasServiceRoom,
    lotSize: form.lotSize === '' ? null : Number(form.lotSize),
    ceilingHeight: form.ceilingHeight === '' ? null : Number(form.ceilingHeight),
    // Cochera: cubiertas + descubiertas. garage_spaces/garage_type se
    // mantienen sincronizados (suma y tipo derivado) para lectores viejos.
    garageCovered: Number(form.garageCovered || 0),
    garageUncovered: Number(form.garageUncovered || 0),
    garageSpaces: Number(form.garageCovered || 0) + Number(form.garageUncovered || 0),
    garageType: (() => {
      const cov = Number(form.garageCovered || 0), unc = Number(form.garageUncovered || 0);
      if (cov > 0 && unc === 0) return 'cubierta';
      if (unc > 0 && cov === 0) return 'descubierta';
      return null;
    })(),
    condition: unitIsLand ? null : (form.condition || null),
    features: unitIsLand ? [] : form.features,
    livingRooms: programActive ? derivedCounts.living : Number(form.livingRooms || 0),
    kitchens: programActive ? derivedCounts.kitchen : Number(form.kitchens || 0),
    otherRoomsCount: programActive ? derivedCounts.other : Number(form.otherRoomsCount || 0),
    otherRoomsDescription: form.otherRoomsDescription || null,
    hoaFee: form.hoaFee === '' ? null : Number(form.hoaFee),
    floorsCount: Number(form.floorsCount || 1),
    price: form.price === '' ? null : Number(form.price),
    currency: form.currency || 'USD',
    status: form.status,
    orientation: unitIsLand ? null : (form.orientation || null),
    interiorImageUrl: form.interiorImageUrl || null,
    galleryImages: form.galleryImages.filter(Boolean),
    floorPlan3dUrl: form.floorPlan3dUrl || null,
    plan3dUrl: form.plan3dUrl || null,
    technicalPlanUrl: form.technicalPlanUrl || null,
    // Programa de ambientes: solo en casa. Para departamentos, los `rooms`
    // se editan aparte (delimitación sobre el plano) y no hay que pisarlos.
    // Para casa se manda el programa: `rooms` (planta baja) y, si tiene
    // 2+ plantas, `levels` (las de más, normalizadas a floorsCount - 1).
    ...(hasUnitStep ? {} : {
      rooms: roomsArg,
      ...(floorsCount > 1 ? { levels: levelsArg } : {}),
    }),
    // Solo al crear a partir de "Duplicar" — en una edición normal
    // (editingId set) nunca hay que pisar los ambientes/tour reales de la
    // unidad con lo que haya quedado cacheado de un duplicado anterior.
    ...(!editingId && duplicateExtras ? {
      roomPlanImage: duplicateExtras.roomPlanImage,
      rooms: duplicateExtras.rooms,
      tourImageUrl: duplicateExtras.tourImageUrl,
      tourData: duplicateExtras.tourData,
    } : {}),
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!form.code || !resolvedType) {
      setError(unitIsLand ? `Falta el código ${uAgree.del} ${unitLabelLower}.` : hasUnitStep ? 'Faltan código y/o tipología.' : 'Falta el nombre.');
      return;
    }
    setSaving(true);

    // Casa: traer los polígonos/tour frescos y fusionarlos, para no pisar lo
    // que se haya delimitado en la pantalla de "Plano y delimitación".
    let roomsToSave = rooms;
    let levelsToSave = buildLevels(() => ({}));
    if (!hasUnitStep && editingId) {
      try {
        const server = await fetch(`/api/admin/units/${editingId}`).then(r => (r.ok ? r.json() : null));
        if (server) {
          roomsToSave = mergeDelimitation(rooms, server.rooms);
          levelsToSave = levelsToSave.map((l, i) => ({ ...l, rooms: mergeDelimitation(l.rooms, server.levels?.[i]?.rooms) }));
        }
      } catch {
        // Sin conexión al server: se guarda con lo que hay en memoria.
      }
    }

    const payload = buildPayload(roomsToSave, levelsToSave);
    const res = editingId
      ? await fetch(`/api/admin/units/${editingId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      : await fetch('/api/admin/units', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...payload, floorId }),
        });

    setSaving(false);
    if (res.ok) {
      toast(editingId ? 'Cambios guardados.' : `${unitLabel} creada.`);
      if (editingId) {
        // Para "casa" (!hasUnitStep) el form editado ES la única unidad —
        // vaciarlo tras guardar dejaba al usuario frente a una pantalla en
        // blanco que parecía "crear otra casa". Al no tener paso de
        // unidades propio, no hay a dónde volver: se queda mostrando lo
        // que se acaba de guardar.
        if (hasUnitStep) cancelEdit();
      } else if (hasUnitStep) {
        // Deja cargados los mismos valores para el próximo depto — solo
        // hace falta cambiar el código — en vez de volver al form vacío.
        setForm(prev => ({ ...prev, code: '' }));
        setError('');
        document.getElementById('code')?.focus();
      }
      load();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? `Error al guardar ${uAgree.el} ${unitLabelLower}.`);
    }
  };

  const handleDelete = async (id: string) => {
    const ok = await confirmDialog({ message: `¿Borrar ${uAgree.esta} ${unitLabelLower}?`, confirmLabel: `Borrar ${unitLabelLower}`, danger: true });
    if (!ok) return;
    const res = await fetch(`/api/admin/units/${id}`, { method: 'DELETE' });
    if (res.ok) {
      toast(`${unitLabel} ${uAgree.borrado}.`);
      if (editingId === id) cancelEdit();
      load();
    } else {
      toast(`Error al borrar ${uAgree.el} ${unitLabelLower}.`, 'error');
    }
  };

  const handleDownloadTemplate = () => {
    downloadCsv('plantilla-unidades.csv', [[...CSV_COLUMNS], CSV_TEMPLATE_ROW]);
  };

  const handleExportCsv = () => {
    const rows = units.map(u => [
      u.code, u.model_name ?? '', u.type, String(u.total_area ?? ''), String(u.inner_area ?? ''),
      String(u.balcony_area ?? 0), String(u.external_area ?? 0), String(u.bedrooms ?? 0), String(u.bathrooms ?? 0),
      u.has_service_room ? 'si' : 'no', u.price != null ? String(u.price) : '', u.currency || 'USD', u.status, u.orientation ?? '',
      u.interior_image_url ?? '', u.floor_plan_3d_url ?? '', u.plan_3d_url ?? '', u.technical_plan_url ?? '',
    ]);
    downloadCsv('unidades.csv', [[...CSV_COLUMNS], ...rows]);
  };

  const handleImportCsv = async (file: File) => {
    const text = await file.text();
    const rows = parseCsv(text);
    if (rows.length === 0) { toast('El CSV está vacío.', 'error'); return; }

    const header = rows[0].map(h => h.trim());
    const dataRows = rows.slice(1);
    const colIndex = (name: string) => header.indexOf(name);

    let created = 0;
    let skipped = 0;
    for (const row of dataRows) {
      const get = (name: string) => { const i = colIndex(name); return i >= 0 ? (row[i] ?? '').trim() : ''; };
      const code = get('code');
      const type = get('type');
      if (!code || !type) { skipped++; continue; }

      const payload = {
        floorId,
        code,
        modelName: get('modelName') || null,
        type,
        totalArea: get('totalArea') === '' ? null : Number(get('totalArea')),
        innerArea: get('innerArea') === '' ? null : Number(get('innerArea')),
        balconyArea: Number(get('balconyArea') || 0),
        externalArea: Number(get('externalArea') || 0),
        bedrooms: Number(get('bedrooms') || 0),
        bathrooms: Number(get('bathrooms') || 1),
        hasServiceRoom: ['si', 'sí', 'true', '1', 'yes'].includes(get('hasServiceRoom').toLowerCase()),
        price: get('price') === '' ? null : Number(get('price')),
        currency: get('currency') || 'USD',
        status: (get('status') || 'available') as UnitStatus,
        orientation: get('orientation') || null,
        interiorImageUrl: get('interiorImageUrl') || null,
        floorPlan3dUrl: get('floorPlan3dUrl') || null,
        plan3dUrl: get('plan3dUrl') || null,
        technicalPlanUrl: get('technicalPlanUrl') || null,
      };

      const res = await fetch('/api/admin/units', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) created++; else skipped++;
    }

    toast(`${created} ${unitLabelLower}${created === 1 ? '' : 's'} importada${created === 1 ? '' : 's'}${skipped > 0 ? `, ${skipped} con error/omitida${skipped === 1 ? '' : 's'}` : ''}.`, skipped > 0 && created === 0 ? 'error' : undefined);
    load();
  };

  if (loading) return <LoadingSpinner text={hasUnitStep ? `Cargando ${unitLabelLower}s...` : `Cargando datos ${uAgree.del} ${unitLabelLower}...`} tone="light" />;
  if (loadError) return <ErrorState message={hasUnitStep ? `No se pudieron cargar ${uAgree.el === 'la' ? 'las' : 'los'} ${unitLabelLower}s.` : `No se pudieron cargar los datos ${uAgree.del} ${unitLabelLower}.`} onRetry={load} />;

  return (
    <div className="space-y-6">
      {hasUnitStep && (
        <Card>
          <div className="px-6 py-3 border-b border-gray-100 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-gray-900">{unitLabel}s</h3>
            <div className="flex items-center gap-3">
              <button type="button" onClick={handleDownloadTemplate} className="text-xs font-medium text-gray-500 hover:text-gray-700">Plantilla CSV</button>
              <button type="button" onClick={handleExportCsv} disabled={units.length === 0} className="text-xs font-medium text-gray-500 hover:text-gray-700 disabled:opacity-40">Exportar CSV</button>
              <label className="text-xs font-medium text-brand-600 hover:text-brand-700 cursor-pointer">
                Importar CSV
                <input
                  type="file" accept=".csv" className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleImportCsv(f); e.target.value = ''; }}
                />
              </label>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50/50 border-b border-gray-100">
                  <th className="px-6 py-3 text-sm font-semibold text-gray-900">Código</th>
                  {!unitIsLand && <th className="px-6 py-3 text-sm font-semibold text-gray-900">Modelo / Tipo</th>}
                  <th className="px-6 py-3 text-sm font-semibold text-gray-900">{unitIsLand ? 'Superficie (m²)' : 'm²'}</th>
                  {typeConfig.showStatus && <th className="px-6 py-3 text-sm font-semibold text-gray-900">Estado</th>}
                  {typeConfig.showPrice && <th className="px-6 py-3 text-sm font-semibold text-gray-900">Precio</th>}
                  <th className="px-6 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {units.map(u => (
                  <tr key={u.id} className={`hover:bg-gray-50/50 transition-colors ${editingId === u.id ? 'bg-brand-50/50' : ''}`}>
                    <td className="px-6 py-3 font-medium text-gray-900">{u.code}</td>
                    {!unitIsLand && <td className="px-6 py-3 text-sm text-gray-600">{u.model_name} <span className="text-gray-400">· {u.type}</span></td>}
                    <td className="px-6 py-3 text-sm text-gray-600">{u.total_area ?? '—'}</td>
                    {typeConfig.showStatus && (
                      <td className="px-6 py-3 text-sm">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium
                          ${u.status === 'available' ? 'bg-green-50 text-green-700' : ''}
                          ${u.status === 'reserved' ? 'bg-yellow-50 text-yellow-700' : ''}
                          ${u.status === 'sold' ? 'bg-red-50 text-red-700' : ''}`}>
                          {u.status}
                        </span>
                      </td>
                    )}
                    {typeConfig.showPrice && (
                      <td className="px-6 py-3 text-sm text-gray-600">{u.price ? formatPrice(u.price, u.currency) : '—'}</td>
                    )}
                    <td className="px-6 py-3 text-right space-x-3 whitespace-nowrap">
                      {buildingId && !unitIsLand && (
                        <>
                          <Link href={`/admin/edificios/${buildingId}/pisos/${floorId}/unidades/${u.id}`} className="text-sm font-medium text-brand-600 hover:text-brand-700">Ambientes</Link>
                          <button
                            type="button"
                            onClick={() => {
                              startEdit(u);
                              setTimeout(() => document.getElementById('depto-tour-section')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 100);
                            }}
                            className="text-sm font-medium text-brand-600 hover:text-brand-700"
                            title={u.tour_data?.nodes.length ? `${u.tour_data.nodes.length} panorámica${u.tour_data.nodes.length === 1 ? '' : 's'} cargada${u.tour_data.nodes.length === 1 ? '' : 's'}` : 'Todavía sin recorrido 360°'}
                          >
                            Recorrido 360°{u.tour_data?.nodes.length ? ` (${u.tour_data.nodes.length})` : ''}
                          </button>
                        </>
                      )}
                      <button onClick={() => startEdit(u)} className="text-sm font-medium text-gray-600 hover:text-gray-900">Editar</button>
                      <button onClick={() => duplicateUnit(u)} className="text-sm font-medium text-gray-600 hover:text-gray-900">Duplicar</button>
                      <button onClick={() => handleDelete(u.id)} className="text-sm text-red-500 hover:text-red-700">Borrar</button>
                    </td>
                  </tr>
                ))}
                {units.length === 0 && (
                  <tr><td colSpan={columnCount} className="px-6 py-10 text-center text-gray-400">Todavía no hay {unitLabelLower}s en {uAgree.esta} {buildingLabelLower}.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {otherUnits.length > 0 && (
        <Card>
          <div className="p-4 flex flex-col sm:flex-row sm:items-center gap-3">
            <p className="text-sm text-gray-600 flex-1">
              {hasUnitStep
                ? '¿Este depto ya existe en otro piso o edificio? Copiá sus datos en vez de retipearlos.'
                : `¿Ya cargaste ${uAgree.un} ${unitLabelLower} con los mismos datos (ej: la misma planta tipo)? Copiá sus datos en vez de retipearlos.`}
            </p>
            <div className="flex gap-2 w-full sm:w-auto">
              <select
                value={copySourceId}
                onChange={e => setCopySourceId(e.target.value)}
                className="flex-1 sm:w-64 text-sm border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-brand-500 outline-none"
              >
                <option value="">{`Elegir ${unitLabelLower} de referencia...`}</option>
                {otherUnits.map(u => (
                  <option key={u.id} value={u.id}>
                    {u.code}{u.building_name ? ` · ${u.building_name}` : ''}{hasUnitStep && u.floor_number != null ? ` · Piso ${u.floor_number}` : ''}
                  </option>
                ))}
              </select>
              <Button type="button" onClick={handleCopyFromUnit} disabled={!copySourceId || copying} className="whitespace-nowrap">
                {copying ? 'Copiando...' : 'Copiar datos'}
              </Button>
            </div>
          </div>
        </Card>
      )}

      <Card>
        <CardHeader>
          <h3 className="text-lg font-semibold text-gray-900">
            {hasUnitStep
              ? (editingId ? `Editando ${form.code}` : `${uAgree.Nuevo} ${unitLabelLower}`)
              : (editingId ? `Datos de ${form.code || buildingLabelLower}` : `Datos de ${uAgree.esta} ${buildingLabelLower}`)}
          </h3>
        </CardHeader>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {showCodeField && (
              <Input
                label={unitIsLand ? 'Código del lote' : hasUnitStep ? 'Código' : 'Nombre de la casa'}
                id="code" value={form.code} onChange={e => setForm({ ...form, code: e.target.value })}
                placeholder={unitIsLand ? 'Lote 12' : hasUnitStep ? 'A01-01' : buildingLabel} required
              />
            )}
            {/* Un lote es terreno: sin modelo ni tipología (no hay vivienda). */}
            {!unitIsLand && (
              <Input label="Modelo" id="modelName" value={form.modelName} onChange={e => setForm({ ...form, modelName: e.target.value })} placeholder="SUITE GARDEN" />
            )}
            {hasUnitStep && !unitIsLand && (
              <Select label="Tipología" id="type" value={form.type} onChange={e => setForm({ ...form, type: e.target.value as UnitType })}>
                {UNIT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </Select>
            )}
            {typeConfig.showStatus && (
              <Select label="Estado" id="status" value={form.status} onChange={e => setForm({ ...form, status: e.target.value as UnitStatus })}>
                <option value="available">Disponible</option>
                <option value="reserved">Reservado</option>
                <option value="sold">Vendido</option>
              </Select>
            )}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Input
              label={unitIsLand ? 'Superficie del lote (m²)' : 'Área total (m²)'}
              id="totalArea" type="number" step="0.01" value={form.totalArea}
              onChange={e => setForm({ ...form, totalArea: e.target.value })}
            />
            {/* Áreas internas/balcón/externa: solo aplican a una vivienda. */}
            {!unitIsLand && (
              <>
                <Input label="Área interna (m²)" id="innerArea" type="number" step="0.01" value={form.innerArea} onChange={e => setForm({ ...form, innerArea: e.target.value })} />
                {hasUnitStep && (
                  <Input label="Balcón (m²)" id="balconyArea" type="number" step="0.01" value={form.balconyArea} onChange={e => setForm({ ...form, balconyArea: e.target.value })} />
                )}
                <Input label="Área externa (m²)" id="externalArea" type="number" step="0.01" value={form.externalArea} onChange={e => setForm({ ...form, externalArea: e.target.value })} />
              </>
            )}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {/* Dormitorios/baños: no aplican a un lote. */}
            {!unitIsLand && (programActive ? (
              <>
                <ReadOnlyField label="Dormitorios" value={`${derivedCounts.bedrooms}`} hint="de los ambientes" />
                <ReadOnlyField label="Baños" value={`${derivedCounts.bathrooms}`} hint="de los ambientes" />
              </>
            ) : (
              <>
                <Input label="Dormitorios" id="bedrooms" type="number" min={0} value={form.bedrooms} onChange={e => setForm({ ...form, bedrooms: e.target.value })} />
                <Input label="Baños" id="bathrooms" type="number" min={0} step="0.5" value={form.bathrooms} onChange={e => setForm({ ...form, bathrooms: e.target.value })} />
              </>
            ))}
            {typeConfig.showPrice && (
              <div className="flex gap-2">
                <div className="flex-1 min-w-0">
                  <Input label="Precio" id="price" type="number" value={form.price} onChange={e => setForm({ ...form, price: e.target.value })} placeholder="Consultar precio" />
                </div>
                <div className="w-24 shrink-0">
                  <Select label="Moneda" id="currency" value={form.currency} onChange={e => setForm({ ...form, currency: e.target.value })}>
                    {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </Select>
                </div>
              </div>
            )}
            {/* Casa: la orientación se carga con la brújula de abajo. Lote:
                es terreno, no lleva orientación. */}
            {hasUnitStep && !unitIsLand && (
              <Input label="Orientación" id="orientation" value={form.orientation} onChange={e => setForm({ ...form, orientation: e.target.value })} placeholder="NE" />
            )}
          </div>

          {!hasUnitStep && (
            <div className="pt-1">
              <label className="block text-sm font-medium text-brand-900 mb-2">Orientación</label>
              <TourOrientationControl
                hint={`Arrastrá la aguja hacia dónde mira el frente de ${uAgree.esta} ${unitLabelLower}${orientationCardinal ? ` — mira al ${orientationCardinal}` : ''}. También calibra por dónde sale y se pone el sol en el recorrido 360°.`}
                value={orientationCardinal !== '' ? Number(form.orientation) : undefined}
                onChange={(deg: number | undefined) => setForm({ ...form, orientation: deg == null ? '' : String(deg) })}
              />
            </div>
          )}

          {!hasUnitStep && (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Input label="Superficie de terreno (m²)" id="lotSize" type="number" step="0.01" value={form.lotSize} onChange={e => setForm({ ...form, lotSize: e.target.value })} />
                <Input label="Altura de techo (m)" id="ceilingHeight" type="number" step="0.01" value={form.ceilingHeight} onChange={e => setForm({ ...form, ceilingHeight: e.target.value })} placeholder="2.60" />
                <Input label="Cantidad de plantas" id="floorsCount" type="number" min={1} value={form.floorsCount} onChange={e => setForm({ ...form, floorsCount: e.target.value })} />
                {typeConfig.showPrice && (
                  <Input label="Expensas / mes" id="hoaFee" type="number" step="0.01" value={form.hoaFee} onChange={e => setForm({ ...form, hoaFee: e.target.value })} placeholder="Sin expensas" />
                )}
              </div>

              {/* Livings / cocinas / otros: solo mientras NO haya programa de
                  ambientes cargado — con programa, esos conteos salen de él. */}
              {!programActive && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <Input label="Livings" id="livingRooms" type="number" min={0} value={form.livingRooms} onChange={e => setForm({ ...form, livingRooms: e.target.value })} />
                  <Input label="Cocinas" id="kitchens" type="number" min={0} value={form.kitchens} onChange={e => setForm({ ...form, kitchens: e.target.value })} />
                  <Input label="Otros ambientes" id="otherRoomsCount" type="number" min={0} value={form.otherRoomsCount} onChange={e => setForm({ ...form, otherRoomsCount: e.target.value })} placeholder="0" />
                  <Input label="Detalle otros ambientes" id="otherRoomsDescription" value={form.otherRoomsDescription} onChange={e => setForm({ ...form, otherRoomsDescription: e.target.value })} placeholder="Lavadero, depósito" />
                </div>
              )}

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Input label="Cocheras cubiertas" id="garageCovered" type="number" min={0} value={form.garageCovered} onChange={e => setForm({ ...form, garageCovered: e.target.value })} />
                <Input label="Cocheras descubiertas" id="garageUncovered" type="number" min={0} value={form.garageUncovered} onChange={e => setForm({ ...form, garageUncovered: e.target.value })} />
                <Select label="Estado / antigüedad" id="condition" value={form.condition} onChange={e => setForm({ ...form, condition: e.target.value as typeof form.condition })}>
                  <option value="">Sin especificar</option>
                  {UNIT_CONDITION_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </Select>
              </div>

              {/* Comodidades — lista libre de tags (pileta, quincho, losa
                  radiante, amoblada, apto crédito…). Se guarda en units.features. */}
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700">Comodidades</label>
                <div className="space-y-2">
                  {UNIT_FEATURE_GROUPS.map(group => (
                    <div key={group.label} className="flex flex-wrap items-center gap-1.5">
                      <span className="text-xs font-medium text-gray-400 w-24 shrink-0">{group.label}</span>
                      {group.options
                        .filter(opt => opt !== 'Apto crédito' || typeConfig.showPrice)
                        .map(opt => {
                          const on = form.features.includes(opt);
                          return (
                            <button
                              type="button"
                              key={opt}
                              onClick={() => setForm({
                                ...form,
                                features: on ? form.features.filter(f => f !== opt) : [...form.features, opt],
                              })}
                              className={`text-xs font-medium px-2.5 py-1 rounded-full border transition-colors ${
                                on ? 'bg-brand-50 border-brand-300 text-brand-700' : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'
                              }`}
                            >
                              {on ? '✓ ' : ''}{opt}
                            </button>
                          );
                        })}
                    </div>
                  ))}
                </div>
              </div>

              {/* Programa de ambientes — cada uno con su tipo, m², foto y
                  detalle. Se guarda en units.rooms / units.levels; el paso
                  "Ambientes y Tour" le agrega después el polígono. */}
              <div className="pt-4 border-t border-gray-100 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-semibold text-gray-900">Ambientes</h4>
                    <p className="text-xs text-gray-400">
                      Detalle de cada ambiente de la casa (dormitorios, baños, cocina…). Opcional pero recomendado.
                      {floorsCount > 1 && ' Cargalos por planta con las solapas de abajo.'}
                    </p>
                  </div>
                  <button type="button" onClick={addRoom} className="text-sm font-medium text-brand-600 hover:text-brand-700 shrink-0">
                    + Agregar {plantaIdx === 0 ? 'ambiente' : `a ${plantas[plantaIdx].label.toLowerCase()}`}
                  </button>
                </div>

                {/* Solapas de planta — solo si la casa declara 2+ plantas. */}
                {floorsCount > 1 && (
                  <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1 w-fit">
                    {plantas.map((p, i) => {
                      const n = p.rooms.filter(r => r.kind).length;
                      return (
                        <button
                          key={i}
                          type="button"
                          onClick={() => setActivePlanta(i)}
                          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${plantaIdx === i ? 'bg-white text-gray-900 shadow' : 'text-gray-500 hover:text-gray-700'}`}
                        >
                          {p.label}{n > 0 && <span className="text-gray-400 ml-1">({n})</span>}
                        </button>
                      );
                    })}
                  </div>
                )}

                {activeRooms.length === 0 ? (
                  <div className="py-2 space-y-2">
                    <p className="text-sm text-gray-400">Todavía no cargaste ambientes{floorsCount > 1 ? ` en ${plantas[plantaIdx].label.toLowerCase()}` : ''}.</p>
                    {plantaIdx === 0 && (() => {
                      const legacy = synthesizeRoomProgram({
                        bedrooms: Number(form.bedrooms || 0), bathrooms: Number(form.bathrooms || 0),
                        livingRooms: Number(form.livingRooms || 0), kitchens: Number(form.kitchens || 0),
                        otherRoomsCount: Number(form.otherRoomsCount || 0), otherRoomsDescription: form.otherRoomsDescription,
                      });
                      return legacy.length > 0 ? (
                        <button
                          type="button"
                          onClick={() => setRooms(legacy)}
                          className="text-xs font-medium text-brand-600 hover:text-brand-700"
                        >
                          Generar {legacy.length} ambiente{legacy.length === 1 ? '' : 's'} desde los datos actuales (podés ajustarlos después)
                        </button>
                      ) : null;
                    })()}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {activeRooms.map(room => {
                      const featureOpts = roomFeatureOptions(room.kind);
                      return (
                      <div key={room.id} className="rounded-xl border border-gray-200 p-3 space-y-3">
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                          <Input
                            label="Nombre" value={room.name}
                            onChange={e => updateRoom(room.id, { name: e.target.value })}
                            placeholder="Dormitorio principal"
                          />
                          <Select label="Tipo" value={room.kind ?? 'other'} onChange={e => updateRoom(room.id, { kind: e.target.value as RoomKind })}>
                            {ROOM_KIND_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                          </Select>
                          <Input
                            label="m²" type="number" step="0.01" value={room.area ?? ''}
                            onChange={e => updateRoom(room.id, { area: e.target.value === '' ? undefined : Number(e.target.value) })}
                          />
                        </div>
                        {featureOpts.length > 0 && (
                          <div className="flex flex-wrap gap-2">
                            {featureOpts.map(feature => {
                              const on = room.features?.includes(feature);
                              return (
                                <button
                                  type="button"
                                  key={feature}
                                  onClick={() => toggleRoomFeature(room.id, feature)}
                                  className={`text-xs font-medium px-2.5 py-1 rounded-full border transition-colors ${
                                    on ? 'bg-brand-50 border-brand-300 text-brand-700' : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'
                                  }`}
                                >
                                  {on ? '✓ ' : ''}{feature}
                                </button>
                              );
                            })}
                          </div>
                        )}
                        <ImageUploader
                          label="Foto del ambiente"
                          value={room.imageUrl ?? ''}
                          onChange={url => updateRoom(room.id, { imageUrl: url || undefined })}
                          folder="units"
                        />
                        <MultiImageUploader
                          label="Más fotos de este ambiente"
                          values={room.images ?? []}
                          onChange={urls => updateRoom(room.id, { images: urls.length ? urls : undefined })}
                          folder="units"
                        />
                        <div className="flex items-end gap-3">
                          <div className="flex-1">
                            <Input
                              label="Nota" value={room.notes ?? ''}
                              onChange={e => updateRoom(room.id, { notes: e.target.value || undefined })}
                              placeholder="Detalle libre (ventanal al jardín, piso de madera…)"
                            />
                          </div>
                          <button type="button" onClick={() => removeRoom(room.id)} className="text-sm text-red-500 hover:text-red-700 pb-2 shrink-0">
                            Quitar
                          </button>
                        </div>
                      </div>
                      );
                    })}
                  </div>
                )}

                {/* La delimitación de cada ambiente sobre el plano 2D (y el
                    plano en sí) se hacen en una pantalla aparte, más grande —
                    ver /pisos/[floorId]/plano. */}
                {buildingId && (
                  <Link
                    href={`/admin/edificios/${buildingId}/pisos/${floorId}/plano`}
                    className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 bg-gray-50/60 px-4 py-3 hover:border-gray-300 hover:bg-gray-50 transition-colors"
                  >
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-gray-900">Plano y delimitación de los ambientes</span>
                      <span className="block text-xs text-gray-400">Subí el plano 2D de cada planta y marcá el contorno de cada ambiente. Se abre en otra pantalla — guardá primero los cambios de acá.</span>
                    </span>
                    <span className="text-sm font-medium text-brand-600 shrink-0">Abrir →</span>
                  </Link>
                )}
              </div>
            </>
          )}

          {/* Cuarto de servicio: no aplica a un lote. */}
          {!unitIsLand && (
            <div className="flex flex-wrap items-center gap-5">
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" checked={form.hasServiceRoom} onChange={e => setForm({ ...form, hasServiceRoom: e.target.checked })} className="rounded border-gray-300 text-brand-600 focus:ring-brand-500" />
                Tiene cuarto de servicio
              </label>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <ImageUploader
              label={unitIsLand ? 'Foto del lote' : 'Foto interior'}
              value={form.interiorImageUrl}
              onChange={url => setForm({ ...form, interiorImageUrl: url })}
              folder="units"
            />
            {/* Planos 3D/técnicos: solo para una vivienda. Un lote no tiene. */}
            {!unitIsLand && (!hasUnitStep ? (
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700">Planta 3D</label>
                {plantas.length > 1 && (
                  <div className="flex flex-wrap items-center gap-1 bg-gray-100 rounded-xl p-1 w-fit">
                    {plantas.map((p, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => setActivePlanta(i)}
                        className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${plantaIdx === i ? 'bg-white text-gray-900 shadow' : 'text-gray-500 hover:text-gray-700'}`}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                )}
                <ImageUploader value={activePlan3d} onChange={setActivePlan3d} folder="floorplans" />
                {plantas.length > 1 && (
                  <p className="text-xs text-gray-400">Estás editando la planta 3D de {plantas[plantaIdx].label.toLowerCase()}.</p>
                )}
              </div>
            ) : (
              <ImageUploader label="Render / planta 3D" value={form.floorPlan3dUrl} onChange={url => setForm({ ...form, floorPlan3dUrl: url })} folder="floorplans" />
            ))}
            {!unitIsLand && (
              <>
                <ImageUploader label="Plano 3D técnico" value={form.plan3dUrl} onChange={url => setForm({ ...form, plan3dUrl: url })} folder="floorplans" />
                <ImageUploader label="Plano 2D técnico" value={form.technicalPlanUrl} onChange={url => setForm({ ...form, technicalPlanUrl: url })} folder="floorplans" />
              </>
            )}
          </div>

          <MultiImageUploader
            label={unitIsLand ? 'Más fotos del lote' : 'Galería'}
            values={form.galleryImages}
            onChange={urls => setForm({ ...form, galleryImages: urls })}
            folder="units"
          />

          {/* Recorrido 360° del depto — inline, acá mismo. Autoguarda su
              propio campo (tour_data), independiente del "Guardar cambios". */}
          {hasUnitStep && !unitIsLand && editingId && (
            <div id="depto-tour-section" className="pt-4 border-t border-gray-100 space-y-2 scroll-mt-4">
              <div>
                <h4 className="text-sm font-semibold text-gray-900">Creá tu recorrido — {form.code}</h4>
                <p className="text-xs text-gray-400">
                  Una panorámica 360° (imagen equirectangular) por ambiente. Se guarda solo. Al duplicar un depto igual, el recorrido viaja con él.
                </p>
              </div>
              <TourEditor
                key={editingId}
                initialTourData={editUnitTourData}
                onPersist={async (next) => {
                  const res = await fetch(`/api/admin/units/${editingId}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ tourData: next }),
                  });
                  if (res.ok) setEditUnitTourData(next);
                  return res.ok;
                }}
              />
            </div>
          )}

          <p className="text-xs text-gray-500">
            {unitIsLand
              ? `La silueta de ${uAgree.esta} ${unitLabelLower} sobre el plano de subdivisión se marca en el paso siguiente.`
              : hasUnitStep
              ? 'El polígono del depto en el plano y los ambientes se cargan en los pasos siguientes.'
              : 'Los ambientes (incluida una pileta u otro espacio propio, si tiene) y el tour 360° se cargan en el paso siguiente.'}
          </p>

          {error && <p className="text-sm text-red-500">{error}</p>}

          <div className="pt-4 border-t border-gray-100 flex items-center gap-3">
            <Button type="submit" disabled={saving}>
              {saving ? 'Guardando...' : editingId ? 'Guardar cambios' : hasUnitStep ? `+ Crear ${unitLabelLower}` : 'Guardar'}
            </Button>
            {editingId && hasUnitStep && (
              <Button type="button" variant="ghost" onClick={cancelEdit} className="bg-transparent hover:bg-gray-100">
                Cancelar
              </Button>
            )}
          </div>
        </form>
      </Card>
    </div>
  );
}

function ReadOnlyField({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="w-full">
      <label className="block text-sm font-medium text-brand-900 mb-1">{label}</label>
      <div className="w-full px-4 py-2 border border-gray-100 rounded-lg bg-gray-50 text-sm text-gray-700">
        {value}
        {hint && <span className="text-gray-400"> · {hint}</span>}
      </div>
    </div>
  );
}
