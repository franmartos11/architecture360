'use client';

import { useState, useCallback, useEffect, useMemo, useRef, startTransition } from 'react';
import Image from 'next/image';
import { m as motion } from 'framer-motion';
import { useTransitionRouter } from '@/components/ui/TransitionUtils';
import { useProjectBasePath } from '@/lib/project-base-path-context';
import Breadcrumbs from '@/components/ui/Breadcrumbs';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
import type { Building, Unit, Floor, Amenity, PointOfInterest } from '@/types';
import type { ProjectTypeConfig } from '@/lib/project-types';
import { getUnitsByBuildingAndFloor, getStatusColor, getStatusLabel, formatPrice } from '@/lib/units';
import { FLOOR_KIND_LABEL, FLOOR_KIND_ICON } from '@/lib/floorKinds';
import LeadCaptureModal from '@/components/ui/LeadCaptureModal';
import { shimmerDataUrl } from '@/lib/imagePlaceholder';
import { useContactModal } from '@/hooks/useContactModal';
import { useShareLink } from '@/hooks/useShareLink';
import { useUnitFavorites } from '@/hooks/useUnitFavorites';

interface BuildingTab {
  id: string;
  name: string;
}

interface FloorPlanViewerProps {
  building: Building;
  units: Unit[];
  projectSlug: string;
  projectName: string;
  amenities?: Amenity[];
  pointsOfInterest?: PointOfInterest[];
  initialFloor?: number;
  typeConfig: ProjectTypeConfig;
  /** Todos los edificios del proyecto (incluye el actual) — para el
   *  selector de torre. Con uno solo, no se muestra ningún tab. */
  buildings?: BuildingTab[];
}

export default function FloorPlanViewer({
  building,
  units: allUnits,
  projectSlug,
  projectName,
  amenities = [],
  pointsOfInterest = [],
  initialFloor = 1,
  typeConfig,
  buildings = [],
}: FloorPlanViewerProps) {
  const { showPrice, showStatus, showLeads, unitIsLand, hasFloorStep } = typeConfig;
  const router = useTransitionRouter();
  const basePath = useProjectBasePath();
  const [activeFloor, setActiveFloor] = useState(initialFloor);
  // Capas del plano que el visitante puede prender/apagar. Para un loteo las
  // siluetas arrancan visibles (así se ven los límites de cada lote); en un
  // edificio no, para no cambiar el plano de siempre.
  const [layers, setLayers] = useState({ siluetas: unitIsLand, etiquetas: true, fotos: false });
  const [selectedUnit, setSelectedUnit] = useState<Unit | null>(null);
  const [hoveredUnit, setHoveredUnit] = useState<string | null>(null);
  const [onlyAvailable, setOnlyAvailable] = useState(false);
  const { favorites, toggleFavorite } = useUnitFavorites(projectSlug);
  const asideRef = useRef<HTMLElement>(null);

  // Tamaño real (en px) al que dibujamos el plano — se calcula a mano en
  // vez de dejar que el ancho llene el contenedor y la altura "siga"
  // (w-full h-auto): un plano cuadrado/vertical en una pantalla ancha
  // terminaba más alto que el área visible y se recortaba, dando la
  // sensación de "zoom" al entrar. Acá medimos el área disponible real
  // (planAreaRef) y la relación de aspecto real de la imagen (medida al
  // cargarla, no asumida) y elegimos el mayor rectángulo que entre
  // completo en ambos ejes — así el plano siempre se ve entero, y como el
  // contenedor termina con la MISMA forma que la imagen (sin franjas
  // vacías), los overlays en % (zonas de hover, pines) quedan alineados.
  const planAreaRef = useRef<HTMLDivElement>(null);
  const planImageRef = useRef<string | undefined>(undefined);
  const [planRatio, setPlanRatio] = useState<number | null>(null);
  const [planFitSize, setPlanFitSize] = useState<{ w: number; h: number } | null>(null);

  useEffect(() => {
    const el = planAreaRef.current;
    if (!el || planRatio == null) return;
    const compute = () => {
      const cs = getComputedStyle(el);
      const padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
      const padY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
      const availW = Math.min(el.clientWidth - padX, 1400);
      const availH = el.clientHeight - padY;
      if (availW <= 0 || availH <= 0) return;
      let w = availW;
      let h = w / planRatio;
      if (h > availH) {
        h = availH;
        w = h * planRatio;
      }
      setPlanFitSize({ w, h });
    };
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    return () => ro.disconnect();
  }, [planRatio]);

  const contactModal = useContactModal();
  const shareLink = useShareLink();

  const handleShare = async () => {
    if (!selectedUnit) return;
    const url = `${window.location.origin}${basePath}/edificio/${building.id}/unidad/${selectedUnit.id}`;
    const modelSuffix = !unitIsLand && selectedUnit.modelName ? ` (${selectedUnit.modelName})` : '';
    await shareLink(url, `Unidad ${selectedUnit.name} - ${projectSlug}`, `Mirá esta unidad: ${selectedUnit.name}${modelSuffix}`);
  };

  const floor: Floor | undefined = building.floors.find(f => f.number === activeFloor);
  const isSpecialFloor = !!floor?.floorKind && floor.floorKind !== 'units';

  // Se remide en cada cambio de piso — cada planta puede tener un plano
  // con proporciones distintas. Ajuste de estado durante el render (no en
  // un efecto) siguiendo el patrón recomendado para "resetear estado
  // cuando cambia una prop" — ver react-hooks/set-state-in-effect.
  if (planImageRef.current !== floor?.planImage) {
    planImageRef.current = floor?.planImage;
    if (planRatio !== null) setPlanRatio(null);
    if (planFitSize !== null) setPlanFitSize(null);
  }

  const unitsOnFloor = useMemo(
    () => getUnitsByBuildingAndFloor(allUnits, building.id, activeFloor),
    [allUnits, building.id, activeFloor]
  );

  // Unidades que tienen la forma real delimitada (polígono) sobre el plano,
  // para marcar la sección en gris al pasar el mouse.
  const polygonUnits = useMemo(
    () => unitsOnFloor.filter(u => u.polygon && u.polygon.length > 0),
    [unitsOnFloor]
  );

  // Unidades de todo el edificio (todas las plantas) — para "disponibles"
  // totales y "siguiente disponible".
  const buildingUnits = useMemo(() => allUnits.filter(u => u.buildingId === building.id), [allUnits, building.id]);
  const availableInBuilding = useMemo(() => buildingUnits.filter(u => u.status === 'available'), [buildingUnits]);

  const passesFilter = useCallback(
    (u: Unit) => !onlyAvailable || u.status === 'available',
    [onlyAvailable]
  );

  const nextAvailableUnit = useMemo(() => {
    if (!showStatus) return null;
    const candidates = availableInBuilding.filter(u => u.id !== selectedUnit?.id);
    if (candidates.length === 0) return null;
    const referenceFloor = selectedUnit?.floor ?? activeFloor;
    return [...candidates].sort((a, b) => Math.abs(a.floor - referenceFloor) - Math.abs(b.floor - referenceFloor))[0];
  }, [showStatus, availableInBuilding, selectedUnit, activeFloor]);

  useEffect(() => {
    if (unitsOnFloor.length > 0) {
      if (!selectedUnit || selectedUnit.floor !== activeFloor) {
        startTransition(() => setSelectedUnit(unitsOnFloor[0]));
      }
    }
  }, [activeFloor, unitsOnFloor, selectedUnit]);

  const handleSelectUnit = useCallback((unit: Unit) => {
    setSelectedUnit(unit);
    // En pantallas angostas la ficha de la unidad vive debajo del plano, no
    // al costado — sin este scroll, tocar un pin no da ninguna señal de que
    // pasó algo (la info cambió fuera de la vista).
    if (typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches) {
      requestAnimationFrame(() => asideRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    }
  }, []);

  const handleGoNextAvailable = useCallback(() => {
    if (!nextAvailableUnit) return;
    setActiveFloor(nextAvailableUnit.floor);
    handleSelectUnit(nextAvailableUnit);
  }, [nextAvailableUnit, handleSelectUnit]);

  const handleEnterUnit = useCallback(() => {
    if (!selectedUnit) return;
    router.push(`${basePath}/edificio/${building.id}/unidad/${selectedUnit.id}`);
  }, [selectedUnit, basePath, building.id, router]);

  // Entra a la unidad directo en el tab de Amenities/Ubicación — misma
  // experiencia inmersiva que ya tiene el visor de la unidad, en vez de
  // un popup aparte acá.
  const handleEnterUnitTab = useCallback((tab: 'amenities' | 'ubicacion') => {
    if (!selectedUnit) return;
    router.push(`${basePath}/edificio/${building.id}/unidad/${selectedUnit.id}?tab=${tab}`);
  }, [selectedUnit, basePath, building.id, router]);

  const handleSwitchBuilding = useCallback((id: string) => {
    if (id !== building.id) router.push(`${basePath}/edificio/${id}`);
  }, [building.id, basePath, router]);

  const floorNumbers = building.floors
    .map(f => f.number)
    .sort((a, b) => b - a); // descending (top = highest)

  const priceCaption = selectedUnit?.status === 'available' ? 'PRECIO' : 'PRECIO DE LISTA';
  const pricePerM2 = selectedUnit?.price && selectedUnit.totalArea > 0
    ? formatPrice(Math.round(selectedUnit.price / selectedUnit.totalArea), selectedUnit.currency)
    : null;

  return (
    <div className="flex flex-col md:flex-row overflow-visible md:h-screen md:overflow-hidden bg-white">

      {/* ── Franja superior (solo pantallas angostas) — acá viven los
          controles que en desktop flotan sobre el plano: torre, filtro,
          contacto y el selector de piso. ─────────────────────────── */}
      <div className="order-1 md:hidden w-full border-b border-gray-100 bg-white px-3 py-2.5">
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <Breadcrumbs crumbs={[{ label: projectName, href: basePath || '/' }, { label: building.name }]} />
          </div>
          {buildings.length > 1 && (
            <div className="flex gap-0.5 p-0.5 bg-gray-100 rounded-full shrink-0">
              {buildings.map(b => (
                <button
                  key={b.id}
                  onClick={() => handleSwitchBuilding(b.id)}
                  className={`h-6 px-2.5 rounded-full text-[11px] font-semibold transition-colors ${
                    b.id === building.id ? 'bg-gray-900 text-white' : 'text-gray-500'
                  }`}
                >
                  {b.name}
                </button>
              ))}
            </div>
          )}
          {showLeads && (
            <button
              onClick={() => contactModal.open()}
              className="shrink-0 h-8 px-3.5 rounded-full bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold transition-colors"
            >
              Contactar
            </button>
          )}
        </div>

        {showStatus && (
          <button
            onClick={() => setOnlyAvailable(v => !v)}
            className={`mt-2 h-7 px-3 inline-flex items-center gap-1.5 rounded-full border text-[11.5px] font-semibold transition-colors ${
              onlyAvailable ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'border-gray-200 text-gray-600'
            }`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${onlyAvailable ? 'bg-emerald-500' : 'bg-gray-300'}`} />
            Solo disponibles
          </button>
        )}

        {floorNumbers.length > 1 && (
          <>
            <div className="flex items-center justify-between mt-3">
              <span className="text-[9.5px] font-semibold tracking-[0.14em] text-gray-500">ELEGÍ EL PISO</span>
              {showStatus && (
                <span className="text-[10.5px] font-medium text-emerald-600">{availableInBuilding.length} disponibles</span>
              )}
            </div>
            <div className="flex gap-1.5 mt-2 overflow-x-auto pb-0.5">
              {floorNumbers.map(num => {
                const kind = building.floors.find(f => f.number === num)?.floorKind;
                const special = kind && kind !== 'units';
                const fu = getUnitsByBuildingAndFloor(allUnits, building.id, num);
                const fa = fu.filter(u => u.status === 'available');
                const active = activeFloor === num;
                return (
                  <button
                    key={num}
                    onClick={() => { setActiveFloor(num); setSelectedUnit(null); }}
                    className={`shrink-0 min-w-[54px] px-2.5 py-1.5 rounded-[11px] text-center border transition-colors ${
                      active ? 'bg-gray-900 border-gray-900' : 'border-gray-200'
                    }`}
                  >
                    <div className={`text-sm font-semibold ${active ? 'text-white' : 'text-gray-800'}`}>
                      {special ? FLOOR_KIND_ICON[kind!] : num === 0 ? 'PB' : num}
                    </div>
                    <div className={`text-[9px] font-medium mt-0.5 whitespace-nowrap ${active ? 'text-white/75' : showStatus && fa.length > 0 ? 'text-emerald-600' : 'text-gray-400'}`}>
                      {special ? FLOOR_KIND_LABEL[kind!] : showStatus ? (fa.length ? `${fa.length} libres` : 'Agotado') : ''}
                    </div>
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* ── Panel de la unidad ───────────────────────────────────── */}
      <aside
        ref={asideRef}
        className="order-3 md:order-1 w-full md:w-[336px] md:flex-none flex flex-col bg-white border-t md:border-t-0 md:border-r border-gray-100 md:overflow-y-auto md:max-h-screen"
      >
        {selectedUnit ? (
          <div className="flex flex-col">
            {/* Foto de portada */}
            <div className="relative h-[200px] bg-gray-100 flex-shrink-0">
              {selectedUnit.interiorImageUrl && (
                <Image
                  src={selectedUnit.interiorImageUrl}
                  alt="Interior"
                  fill
                  sizes="(max-width: 768px) 100vw, 336px"
                  priority
                  placeholder="blur"
                  blurDataURL={shimmerDataUrl(336, 200)}
                  className="object-cover"
                />
              )}
              {showStatus && (
                <div className="absolute top-3 left-3 flex items-center gap-1.5 px-2.5 py-1 bg-white/95 rounded-full">
                  <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: getStatusColor(selectedUnit.status) }} />
                  <span className="text-[9.5px] font-bold tracking-[0.12em]" style={{ color: getStatusColor(selectedUnit.status) }}>
                    {getStatusLabel(selectedUnit.status).toUpperCase()}
                  </span>
                </div>
              )}
              <div className="absolute top-3 right-3 flex gap-1.5">
                <button
                  onClick={() => toggleFavorite(selectedUnit.id)}
                  aria-label={favorites.includes(selectedUnit.id) ? 'Quitar de favoritos' : 'Agregar a favoritos'}
                  className="w-8 h-8 rounded-full bg-white/95 flex items-center justify-center"
                  style={{ color: favorites.includes(selectedUnit.id) ? '#c0483c' : '#5c6660' }}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill={favorites.includes(selectedUnit.id) ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={1.8} strokeLinecap="round">
                    <path d="M12 20s-7-4.6-7-9.4A4.1 4.1 0 0 1 12 7a4.1 4.1 0 0 1 7 3.6C19 15.4 12 20 12 20z" />
                  </svg>
                </button>
                <button
                  onClick={handleShare}
                  aria-label="Compartir esta unidad"
                  className="w-8 h-8 rounded-full bg-white/95 flex items-center justify-center text-gray-600"
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M7.217 10.907a2.25 2.25 0 100 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186l9.566-5.314m-9.566 7.5l9.566 5.314m0 0a2.25 2.25 0 103.935 2.186 2.25 2.25 0 00-3.935-2.186zm0-12.814a2.25 2.25 0 103.933-2.185 2.25 2.25 0 00-3.933 2.185z" />
                  </svg>
                </button>
              </div>
              {(selectedUnit.galleryImages?.length ?? 0) > 0 && (
                <div className="absolute bottom-0 inset-x-0 px-3.5 pb-2 pt-6" style={{ background: 'linear-gradient(180deg,rgba(27,30,28,0),rgba(27,30,28,.72))' }}>
                  <p className="text-[10px] font-medium tracking-[0.14em] text-white/80">
                    {selectedUnit.galleryImages!.length} foto{selectedUnit.galleryImages!.length === 1 ? '' : 's'}
                    {selectedUnit.tourImageUrl ? ' · recorrido 360° disponible' : ''}
                  </p>
                </div>
              )}
            </div>

            <div className="p-[18px] flex flex-col">
              <div className="flex items-baseline justify-between gap-2.5">
                <h2 className="text-[25px] leading-none font-semibold text-gray-900">{selectedUnit.name}</h2>
                <span className="text-[11px] font-medium text-gray-400 whitespace-nowrap">
                  {hasFloorStep ? (selectedUnit.floor === 0 ? 'Planta baja' : `Piso ${selectedUnit.floor}`) : ''}
                </span>
              </div>
              {!unitIsLand && selectedUnit.modelName && (
                <p className="text-xs tracking-[0.11em] text-gray-400 mt-1.5">{selectedUnit.modelName}</p>
              )}

              {showPrice && (
                <div className="flex items-end justify-between gap-3 mt-4">
                  <div className="min-w-0">
                    {selectedUnit.price ? (
                      <>
                        <p className="text-[9.5px] font-medium tracking-[0.14em] text-gray-400">{priceCaption}</p>
                        <p className="text-[27px] leading-none font-light text-gray-900 mt-1.5">{formatPrice(selectedUnit.price, selectedUnit.currency)}</p>
                      </>
                    ) : showLeads ? (
                      <button
                        onClick={() => contactModal.open()}
                        className="py-2 px-3 rounded-lg border border-gray-200 text-sm text-gray-700 font-medium hover:bg-gray-50 transition-colors"
                      >
                        Consultar precio
                      </button>
                    ) : null}
                  </div>
                  {pricePerM2 && <span className="text-[11px] text-gray-400 pb-0.5 shrink-0">{pricePerM2}/m²</span>}
                </div>
              )}

              {selectedUnit.status !== 'sold' && (
                <button
                  onClick={handleEnterUnit}
                  className="mt-4 h-12 flex items-center justify-center gap-2 bg-emerald-700 hover:bg-emerald-800 rounded-[11px] text-white font-semibold text-[13.5px] transition-colors"
                >
                  Ingresar a la unidad
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><path d="M9 6l6 6-6 6" /></svg>
                </button>
              )}

              <h4 className="text-[10px] font-semibold tracking-[0.16em] text-gray-500 mt-[22px]">
                {unitIsLand ? 'DATOS DEL LOTE' : 'INSTALACIONES'}
              </h4>
              <div className="flex flex-col gap-[11px] mt-3">
                <SpecRow icon="area-total" label={`Área total ${selectedUnit.totalArea} m²`} />
                {!unitIsLand && (
                  <>
                    <SpecRow icon="area-inner" label={`Área interna ${selectedUnit.innerArea} m²`} />
                    {selectedUnit.balconyArea > 0 && (
                      <SpecRow icon="balcony" label={`Área balcones ${selectedUnit.balconyArea} m²`} />
                    )}
                    {selectedUnit.externalArea > 0 && (
                      <SpecRow icon="external" label={`Área externa ${selectedUnit.externalArea} m²`} />
                    )}
                    <SpecRow icon="bed" label={`${selectedUnit.bedrooms} Dormitorio${selectedUnit.bedrooms !== 1 ? 's' : ''}`} />
                    <SpecRow icon="bath" label={`${selectedUnit.bathrooms} Baños`} />
                    <SpecRow
                      icon="extra"
                      label={selectedUnit.hasServiceRoom ? 'Cuarto de Servicio' : `${selectedUnit.garageSpaces ?? 0} cochera${(selectedUnit.garageSpaces ?? 0) !== 1 ? 's' : ''}`}
                    />
                    {selectedUnit.orientation && (
                      <SpecRow icon="orientation" label={`Orientación ${selectedUnit.orientation}`} />
                    )}
                  </>
                )}
              </div>

              {(amenities.length > 0 || pointsOfInterest.length > 0) && (
                <div className="grid grid-cols-2 gap-2 mt-5">
                  {amenities.length > 0 && (
                    <button
                      onClick={() => handleEnterUnitTab('amenities')}
                      className="flex items-center justify-center gap-1.5 h-[38px] rounded-[10px] border border-gray-200 text-[11.5px] font-medium text-gray-700 hover:border-emerald-700 hover:text-emerald-700 transition-colors"
                    >
                      Amenities
                    </button>
                  )}
                  {pointsOfInterest.length > 0 && (
                    <button
                      onClick={() => handleEnterUnitTab('ubicacion')}
                      className="flex items-center justify-center gap-1.5 h-[38px] rounded-[10px] border border-gray-200 text-[11.5px] font-medium text-gray-700 hover:border-emerald-700 hover:text-emerald-700 transition-colors"
                    >
                      Ubicación
                    </button>
                  )}
                </div>
              )}

              {nextAvailableUnit && (
                <button
                  onClick={handleGoNextAvailable}
                  className="mt-5 p-[13px] bg-emerald-50 border border-emerald-100 rounded-[11px] flex items-center gap-2.5 text-left hover:bg-emerald-100/70 transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-[9.5px] font-semibold tracking-[0.13em] text-emerald-700">SIGUIENTE DISPONIBLE</p>
                    <p className="text-[12.5px] font-medium text-gray-900 mt-1">
                      {nextAvailableUnit.name} · Piso {nextAvailableUnit.floor} · {nextAvailableUnit.totalArea} m²
                      {showPrice && nextAvailableUnit.price ? ` · ${formatPrice(nextAvailableUnit.price, nextAvailableUnit.currency)}` : ''}
                    </p>
                  </div>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#047857" strokeWidth={2} strokeLinecap="round" className="shrink-0"><path d="M9 6l6 6-6 6" /></svg>
                </button>
              )}

              {showLeads && (
                <div className="mt-5 pt-4 border-t border-gray-100">
                  <p className="text-xs text-gray-400 mb-3">Solicitar información</p>
                  <div className="flex items-center gap-2.5">
                    <ContactBtn title="Email" onClick={() => contactModal.open('email')}>
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                      </svg>
                    </ContactBtn>
                    <ContactBtn title="Teléfono" onClick={() => contactModal.open('phone')}>
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
                      </svg>
                    </ContactBtn>
                    <ContactBtn title="WhatsApp" onClick={() => contactModal.open('whatsapp')}>
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347" />
                        <path d="M12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413A11.815 11.815 0 0012.05 0zm-.004 21.785h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884z" />
                      </svg>
                    </ContactBtn>
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : isSpecialFloor && floor ? (
          <div className="flex flex-col">
            <div className="relative h-[200px] bg-gray-900 overflow-hidden">
              {floor.planImage && (
                <Image
                  src={floor.planImage}
                  alt=""
                  fill
                  sizes="(max-width: 768px) 100vw, 336px"
                  priority
                  placeholder="blur"
                  blurDataURL={shimmerDataUrl(336, 200)}
                  className="object-cover opacity-30 blur-[2px]"
                />
              )}
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-4 text-center">
                <p className="text-[26px] leading-[1.15] font-light text-white">{building.name}</p>
                <span className="px-3.5 py-1.5 bg-white/95 rounded-full text-[11.5px] font-semibold text-gray-900">
                  {activeFloor === 0 ? 'Planta baja' : `Piso ${activeFloor}`}
                </span>
              </div>
            </div>
            <div className="p-[18px]">
              <h3 className="text-base font-semibold text-gray-900">{FLOOR_KIND_LABEL[floor.floorKind!]}</h3>
              <p className="text-[12.5px] leading-[1.65] text-gray-500 mt-2">
                {floor.floorKindDescription || `Este piso no tiene unidades a la venta — es de uso ${FLOOR_KIND_LABEL[floor.floorKind!].toLowerCase()}.`}
              </p>
              {nextAvailableUnit && (
                <button
                  onClick={handleGoNextAvailable}
                  className="mt-4 h-11 w-full flex items-center justify-center gap-2 bg-emerald-700 hover:bg-emerald-800 rounded-[11px] text-white font-semibold text-[12.5px] transition-colors"
                >
                  Ver unidades disponibles
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><path d="M9 6l6 6-6 6" /></svg>
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="p-[18px]">
            <h3 className="text-base font-semibold text-gray-900 mb-2">Resumen de planta</h3>
            <p className="text-sm text-gray-500 leading-relaxed">
              Seleccioná una unidad en el plano interactivo para ver fotografías interiores y sus especificaciones completas.
            </p>
          </div>
        )}
      </aside>

      {/* ── Área principal del plano ─────────────────────────────── */}
      <div className="order-2 md:flex-1 relative min-h-[60vh] md:min-h-0 md:min-w-0 overflow-hidden">

        {/* Overlay superior — solo desktop, en mobile los mismos controles
            viven en la franja de arriba. */}
        <div className="hidden md:flex absolute top-3.5 left-3.5 right-3.5 z-20 items-start justify-between gap-3 pointer-events-none">
          <div className="flex flex-col items-start gap-2 pointer-events-auto min-w-0">
            <Breadcrumbs crumbs={[{ label: projectName, href: basePath || '/' }, { label: building.name }]} />
            {showStatus && (
              <button
                onClick={() => setOnlyAvailable(v => !v)}
                className="h-[26px] px-3 flex items-center gap-1.5 rounded-full bg-white/95 shadow-sm text-[11px] font-semibold transition-colors"
                style={{ color: onlyAvailable ? '#15803d' : '#5c6660' }}
              >
                <span className="w-[7px] h-[7px] rounded-full" style={{ background: onlyAvailable ? '#22c55e' : 'rgba(27,30,28,.22)' }} />
                Solo disponibles
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 pointer-events-auto shrink-0">
            {buildings.length > 1 && (
              <div className="flex gap-1 p-1 bg-white/95 rounded-full shadow-sm">
                {buildings.map(b => (
                  <button
                    key={b.id}
                    onClick={() => handleSwitchBuilding(b.id)}
                    className={`h-7 px-3.5 rounded-full text-[11.5px] font-semibold transition-colors ${
                      b.id === building.id ? 'bg-gray-900 text-white' : 'text-gray-500'
                    }`}
                  >
                    {b.name}
                  </button>
                ))}
              </div>
            )}
            {showLeads && (
              <button
                onClick={() => contactModal.open()}
                className="h-9 px-4 flex items-center bg-emerald-700 hover:bg-emerald-800 rounded-full text-white text-xs font-semibold transition-colors whitespace-nowrap"
              >
                Contactar
              </button>
            )}
          </div>
        </div>

        {/* Panel de capas — prender/apagar lo que se dibuja sobre el plano. */}
        {floor && floor.planImage && (polygonUnits.length > 0 || floor.unitDots.length > 0) && (
          <div className="absolute bottom-3.5 left-3.5 z-20 bg-white/95 rounded-xl shadow-lg border border-gray-200/60 p-2">
            <p className="text-[9.5px] font-semibold tracking-[0.12em] text-gray-300 px-1.5 pt-0.5 pb-1.5">CAPAS</p>
            <div className="flex flex-col gap-0.5">
              {([
                ['siluetas', unitIsLand ? 'Límites de los lotes' : 'Siluetas', polygonUnits.length > 0],
                ['etiquetas', 'Etiquetas', floor.unitDots.length > 0],
                ['fotos', 'Fotos', polygonUnits.some(u => u.interiorImageUrl)],
              ] as const).filter(([, , available]) => available).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setLayers(l => ({ ...l, [key]: !l[key] }))}
                  className="flex items-center gap-2 px-1.5 py-1 rounded-lg hover:bg-gray-50 transition-colors text-left"
                  role="switch"
                  aria-checked={layers[key]}
                >
                  <span
                    className="w-3.5 h-3.5 rounded-[4px] border-[1.5px] flex items-center justify-center shrink-0 transition-colors"
                    style={{ background: layers[key] ? '#047857' : '#fff', borderColor: layers[key] ? '#047857' : 'rgba(27,30,28,.22)' }}
                  >
                    {layers[key] && (
                      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={3.6} strokeLinecap="round"><path d="M5 12.5l4.5 4.5L19 7" /></svg>
                    )}
                  </span>
                  <span className="text-[11px] font-medium text-gray-700 whitespace-nowrap">{label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Plano + pines de unidad */}
        <div ref={planAreaRef} className="absolute inset-0 flex items-center justify-center p-2 sm:p-8 sm:pt-16 cursor-grab active:cursor-grabbing">
          {floor && floor.planImage ? (
            <TransformWrapper
              key={`${floor.planImage}-${planFitSize ? 'fit' : 'pending'}`}
              initialScale={1}
              minScale={0.5}
              maxScale={4}
              centerOnInit
              wheel={{ step: 0.1 }}
              doubleClick={{ disabled: false, step: 0.5 }}
              pinch={{ step: 5 }}
            >
              {(utils) => (
                <>
                  <TransformComponent
                    wrapperClass="!w-full !h-full !flex items-center justify-center"
                    contentClass="relative"
                    contentStyle={planFitSize ? { width: planFitSize.w, height: planFitSize.h } : { width: '100%', maxWidth: 1400 }}
                  >
                    <Image
                      src={floor.planImage}
                      alt={floor.label}
                      fill
                      sizes="(max-width: 768px) 100vw, 1400px"
                      priority
                      unoptimized={floor.planImage.endsWith('.svg')}
                      className="object-contain select-none pointer-events-none"
                      draggable={false}
                      onLoad={e => {
                        const img = e.currentTarget;
                        if (img.naturalWidth && img.naturalHeight) setPlanRatio(img.naturalWidth / img.naturalHeight);
                      }}
                    />

                    {polygonUnits.length > 0 && (
                      <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 100" preserveAspectRatio="none">
                        {polygonUnits.map(unit => (
                          <polygon
                            key={unit.id}
                            points={unit.polygon!.map(p => `${p.x},${p.y}`).join(' ')}
                            vectorEffect="non-scaling-stroke"
                            className={`unit-hover-zone pointer-events-auto${layers.siluetas ? ' unit-hover-zone--outlined' : ''}`}
                            opacity={passesFilter(unit) ? 1 : 0.3}
                            onMouseEnter={() => setHoveredUnit(unit.id)}
                            onMouseLeave={() => setHoveredUnit(null)}
                            onFocus={() => setHoveredUnit(unit.id)}
                            onBlur={() => setHoveredUnit(null)}
                            onClick={() => handleSelectUnit(unit)}
                            role="button"
                            tabIndex={0}
                            aria-label={`Seleccionar ${unit.name}`}
                            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleSelectUnit(unit); } }}
                          />
                        ))}
                      </svg>
                    )}

                    {hoveredUnit && (() => {
                      const hu = polygonUnits.find(u => u.id === hoveredUnit);
                      const poly = hu?.polygon;
                      if (!hu || !poly || poly.length === 0) return null;
                      const cx = poly.reduce((s, p) => s + p.x, 0) / poly.length;
                      const cy = poly.reduce((s, p) => s + p.y, 0) / poly.length;
                      return (
                        <div className="absolute z-10 pointer-events-none" style={{ left: `${cx}%`, top: `${cy}%`, transform: 'translate(-50%, -50%)' }}>
                          <div className="bg-white shadow-lg rounded-lg px-3 py-1.5 text-center whitespace-nowrap border border-gray-100">
                            <p className="text-xs font-semibold text-gray-900">{hu.name}</p>
                            <p className="text-[10px] text-gray-500">{!unitIsLand && hu.modelName ? `${hu.modelName} · ` : ''}{hu.totalArea}m²</p>
                          </div>
                        </div>
                      );
                    })()}

                    {layers.fotos && polygonUnits.map(unit => {
                      if (!unit.interiorImageUrl) return null;
                      const poly = unit.polygon!;
                      const cx = poly.reduce((s, p) => s + p.x, 0) / poly.length;
                      const cy = poly.reduce((s, p) => s + p.y, 0) / poly.length;
                      return (
                        <button
                          key={`foto-${unit.id}`}
                          onClick={() => handleSelectUnit(unit)}
                          aria-label={`Ver ${unit.name}`}
                          className="absolute pointer-events-auto -translate-x-1/2 -translate-y-1/2 rounded-lg overflow-hidden ring-2 ring-white shadow-lg hover:ring-emerald-400 transition-all"
                          style={{ left: `${cx}%`, top: `${cy}%`, width: 52, height: 52, opacity: passesFilter(unit) ? 1 : 0.3 }}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={unit.interiorImageUrl} alt="" className="w-full h-full object-cover" />
                        </button>
                      );
                    })}

                    {layers.etiquetas && (
                      <motion.div
                        initial="hidden"
                        animate="visible"
                        variants={{ hidden: { opacity: 0 }, visible: { opacity: 1, transition: { staggerChildren: 0.05 } } }}
                        className="absolute inset-0 pointer-events-none"
                      >
                        {floor.unitDots.map(dot => {
                          const unit = unitsOnFloor.find(u => u.id === dot.unitId);
                          if (!unit) {
                            return (
                              <div
                                key={dot.unitId}
                                className="absolute pointer-events-auto"
                                style={{ left: `${dot.x}%`, top: `${dot.y}%`, transform: 'translate(-50%, -50%)' }}
                                title={`Unidad "${dot.unitId}" sin cargar en el admin`}
                              >
                                <div className="w-6 h-6 rounded-full bg-gray-200 border-2 border-dashed border-gray-400 flex items-center justify-center text-gray-500 text-[11px] font-bold shadow-sm">?</div>
                              </div>
                            );
                          }
                          return (
                            <UnitDotMarker
                              key={dot.unitId} dot={dot} unit={unit}
                              isSelected={selectedUnit?.id === dot.unitId}
                              onSelect={handleSelectUnit}
                              showStatus={showStatus}
                              dimmed={!passesFilter(unit)}
                            />
                          );
                        })}
                      </motion.div>
                    )}
                  </TransformComponent>

                  {/* Compás + zoom — flotan sobre el plano, fuera del contenido transformado. */}
                  <div className="absolute bottom-3.5 right-3.5 z-20 flex flex-col items-center gap-2">
                    <CompassBadge />
                    <div className="flex flex-col bg-white/95 rounded-[10px] overflow-hidden shadow-lg">
                      <button onClick={() => utils.zoomIn()} aria-label="Acercar" className="w-8 h-8 flex items-center justify-center text-gray-900 hover:bg-gray-50 transition-colors">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
                      </button>
                      <div className="h-px bg-gray-200" />
                      <button onClick={() => utils.zoomOut()} aria-label="Alejar" className="w-8 h-8 flex items-center justify-center text-gray-900 hover:bg-gray-50 transition-colors">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><path d="M5 12h14" /></svg>
                      </button>
                    </div>
                  </div>
                </>
              )}
            </TransformWrapper>
          ) : (
            <div className="text-gray-400 text-sm">Plano no disponible</div>
          )}
        </div>

        {/* Barra inferior — unidades del piso activo */}
        {!isSpecialFloor && unitsOnFloor.length > 0 && (
          <div className="absolute bottom-0 inset-x-0 z-10 border-t border-gray-100 bg-white/97 backdrop-blur-sm px-3.5 pt-2.5 pb-3">
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="text-[12.5px] font-semibold text-gray-900">{activeFloor === 0 ? 'Planta baja' : `Piso ${activeFloor}`}</span>
              {showStatus && (
                <span className="text-[11.5px] text-gray-400">
                  {unitsOnFloor.filter(u => u.status === 'available').length} de {unitsOnFloor.length} disponibles
                </span>
              )}
            </div>
            <div className="flex gap-2 overflow-x-auto mt-2 pb-0.5">
              {unitsOnFloor.map(u => {
                const cur = selectedUnit?.id === u.id;
                return (
                  <button
                    key={u.id}
                    onClick={() => handleSelectUnit(u)}
                    style={{ opacity: passesFilter(u) ? 1 : 0.42 }}
                    className={`shrink-0 flex items-center gap-2.5 px-3 py-2 rounded-[11px] border transition-colors ${cur ? 'bg-emerald-50 border-emerald-700' : 'bg-white border-gray-200'}`}
                  >
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: getStatusColor(u.status) }} />
                    <div className="text-left">
                      <div className="flex items-baseline gap-2">
                        <span className="text-[12.5px] font-semibold text-gray-900 whitespace-nowrap">{u.name}</span>
                        {!unitIsLand && <span className="text-[10.5px] text-gray-400 whitespace-nowrap">{u.bedrooms} dorm · {u.totalArea} m²</span>}
                      </div>
                      {showPrice && (
                        <div className="text-[11.5px] font-semibold text-emerald-700 mt-0.5 whitespace-nowrap">
                          {u.price ? formatPrice(u.price, u.currency) : 'Consultar precio'}
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* ── Selector de piso vertical (solo desktop) ─────────────── */}
      {floorNumbers.length > 1 && (
        <div className="hidden md:flex order-3 w-14 flex-shrink-0 flex-col items-center gap-1.5 py-3.5 bg-white border-l border-gray-100 overflow-y-auto">
          <p className="text-[8.5px] font-semibold tracking-[0.12em] text-gray-300 pb-1">PISO</p>
          {floorNumbers.map(num => {
            const kind = building.floors.find(f => f.number === num)?.floorKind;
            const special = kind && kind !== 'units';
            const fu = getUnitsByBuildingAndFloor(allUnits, building.id, num);
            const active = activeFloor === num;
            return (
              <button
                key={num}
                onClick={() => { setActiveFloor(num); setSelectedUnit(null); }}
                title={special ? FLOOR_KIND_LABEL[kind!] : num === 0 ? 'Planta baja' : `Piso ${num}`}
                className="w-14 py-1 rounded-xl flex flex-col items-center gap-1 transition-colors hover:bg-gray-50"
                style={{ background: active ? '#1b1e1c' : 'transparent' }}
              >
                <span className={`text-sm ${active ? 'font-semibold text-white' : 'font-medium text-gray-700'}`}>
                  {special ? FLOOR_KIND_ICON[kind!] : num === 0 ? 'PB' : num}
                </span>
                {!special && showStatus && (
                  <span className="flex gap-0.5">
                    {fu.slice(0, 4).map(u => (
                      <span
                        key={u.id}
                        className="w-[7px] h-[7px] rounded-[2px]"
                        style={{ background: getStatusColor(u.status), opacity: selectedUnit?.id === u.id ? 1 : 0.85 }}
                      />
                    ))}
                  </span>
                )}
              </button>
            );
          })}
          {showStatus && (
            <div className="mt-1 pt-2 border-t border-gray-100 w-full flex flex-col items-center gap-0.5">
              <span className="text-sm font-semibold text-emerald-600">{availableInBuilding.length}</span>
              <span className="text-[8px] font-medium tracking-[0.08em] text-gray-400 text-center">LIBRES</span>
            </div>
          )}
        </div>
      )}

      {showLeads && (
        <LeadCaptureModal
          isOpen={contactModal.isOpen}
          onClose={contactModal.close}
          unit={selectedUnit}
          projectSlug={projectSlug}
          defaultMethod={contactModal.method}
        />
      )}
    </div>
  );
}

// ── Compás decorativo — no rota según ningún dato real (el norte del
// plano no tiene un ángulo cargado en ningún lado), solo referencia visual. ──
function CompassBadge() {
  return (
    <div className="w-10 h-10 rounded-full bg-white/95 shadow-lg flex items-center justify-center">
      <svg width="24" height="24" viewBox="0 0 40 40">
        <circle cx="20" cy="20" r="16" fill="none" stroke="rgba(27,30,28,.14)" strokeWidth={1} />
        <path d="M20 7l4 9-4-2.6L16 16z" fill="#047857" />
        <text x="20" y="33" textAnchor="middle" fontFamily="Montserrat" fontSize="8" fontWeight="600" fill="#83978c">N</text>
      </svg>
    </div>
  );
}

// ── Unit dot marker ─────────────────────────────────────────────
// Color por defecto del pin: por estado de venta si el tipo de proyecto
// lo usa; si no (portfolio/showcase), un verde neutro de marca en vez de
// un semáforo de disponibilidad que no tiene sentido para ese proyecto.
const NEUTRAL_DOT_COLOR = '#4c5f54';

function UnitDotMarker({
  dot, unit, isSelected, onSelect, showStatus, dimmed,
}: {
  dot: { x: number; y: number; color?: string; style?: 'pill' | 'dot' };
  unit: Unit;
  isSelected: boolean;
  onSelect: (unit: Unit) => void;
  showStatus: boolean;
  dimmed: boolean;
}) {
  const color = dot.color || (showStatus ? getStatusColor(unit.status) : NEUTRAL_DOT_COLOR);
  return (
    <motion.button
      variants={{
        hidden: { opacity: 0, scale: 0 },
        visible: { opacity: dimmed ? 0.35 : 1, scale: 1, transition: { type: 'spring', stiffness: 300, damping: 20 } }
      }}
      className="absolute group pointer-events-auto"
      style={{ left: `${dot.x}%`, top: `${dot.y}%`, transform: 'translate(-50%, -50%)' }}
      onClick={() => onSelect(unit)}
      aria-label={`Seleccionar ${unit.name}`}
    >
      {dot.style === 'dot' ? (
        <div
          className={`w-4 h-4 rounded-full shadow-lg transition-all duration-200 border-2 border-white ${isSelected ? 'scale-125' : 'hover:scale-110'}`}
          style={{ backgroundColor: color }}
        />
      ) : (
        <div
          className={`flex items-center gap-1 rounded-full px-2 py-1 text-white text-[11px] font-bold shadow-lg transition-all duration-200 border-2 border-white ${isSelected ? 'scale-125' : 'hover:scale-110'}`}
          style={{ backgroundColor: color }}
        >
          {unit.name}
        </div>
      )}
    </motion.button>
  );
}

// ── Spec row ────────────────────────────────────────────────────
function SpecRow({ icon, label }: { icon: string; label: string }) {
  const icons: Record<string, React.ReactNode> = {
    'area-total': <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" /></svg>,
    'area-inner': <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" /></svg>,
    balcony: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 21v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21m0 0h4.5V3.545M12.75 21h7.5V10.75M2.25 21h1.5m18 0h-18M2.25 9l4.5-1.636M18.75 3l-1.5.545m0 6.205l3 1m1.5.5l-1.5-.5M6.75 7.364V3h-3v18m3-13.636l10.5-3.819" /></svg>,
    external: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6z" /></svg>,
    bed: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M21 7.5l-9-5.25L3 7.5m18 0l-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9" /></svg>,
    bath: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
    extra: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M4 20h16M6 20V8h5v12M13 20V4h5v16" /></svg>,
    orientation: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 21s7-5.7 7-11a7 7 0 1 0-14 0c0 5.3 7 11 7 11z" /><circle cx="12" cy="10" r="2.4" /></svg>,
  };

  return (
    <div className="flex items-center gap-2.5">
      <span className="text-gray-400 flex-shrink-0">{icons[icon] || null}</span>
      <span className="text-sm text-gray-600">{label}</span>
    </div>
  );
}

function ContactBtn({ title, children, onClick }: { title: string; children: React.ReactNode; onClick?: () => void }) {
  return (
    <button
      title={title}
      aria-label={title}
      onClick={onClick}
      className="w-10 h-10 rounded-full border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-50 hover:text-gray-700 transition-colors"
    >
      {children}
    </button>
  );
}
