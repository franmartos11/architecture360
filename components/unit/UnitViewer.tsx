'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTransitionRouter } from '@/components/ui/TransitionUtils';
import { useProjectBasePath } from '@/lib/project-base-path-context';
import Breadcrumbs from '@/components/ui/Breadcrumbs';
import Image from 'next/image';
import MortgageCalculatorModal from '@/components/ui/MortgageCalculatorModal';
import { m as motion, AnimatePresence } from 'framer-motion';
import type { Unit, UnitViewTab, Room, Amenity, PointOfInterest } from '@/types';
import type { ProjectTypeConfig } from '@/lib/project-types';
import { getStatusColor, getStatusLabel, formatPrice, hasRoomProgram, allProgramRooms, ROOM_KIND_LABEL } from '@/lib/units';
import { getSunAzimuths } from '@/lib/sun-position';
import LeadCaptureModal from '@/components/ui/LeadCaptureModal';
import { shimmerDataUrl } from '@/lib/imagePlaceholder';
import { useContactModal } from '@/hooks/useContactModal';
import { useShareLink } from '@/hooks/useShareLink';
import EyeIcon from '@/components/ui/icons/EyeIcon';
import ImageLightbox from './ImageLightbox';
import CompareView from './CompareView';
import Planta3DTab from './tabs/Planta3DTab';
import Tour360Tab from './tabs/Tour360Tab';
import PlanoTab from './tabs/PlanoTab';
import GaleriaTab from './tabs/GaleriaTab';
import AmenitiesTab from './tabs/AmenitiesTab';
import UbicacionTab from './tabs/UbicacionTab';

interface UnitViewerProps {
  unit: Unit;
  allUnits: Unit[];
  projectSlug: string;
  projectName: string;
  buildingId: string;
  floorNumber: number;
  amenities?: Amenity[];
  pointsOfInterest?: PointOfInterest[];
  projectLocation?: string;
  projectLatitude?: number;
  projectLongitude?: number;
  /** Tab con el que arranca el visor — ej. al entrar desde el botón "Amenities"/"Ubicación" del plano de piso */
  initialTab?: UnitViewTab;
  typeConfig: ProjectTypeConfig;
}

const TABS: { id: UnitViewTab; label: string; icon: React.ReactNode }[] = [
  {
    id: 'planta3d',
    label: 'Planta 3D',
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M6.429 9.75L2.25 12l4.179 2.25m0-4.5l5.571 3 5.571-3m-11.142 0L2.25 7.5 12 2.25l9.75 5.25-4.179 2.25m0 0L21.75 12l-4.179 2.25m0 0l4.179 2.25L12 21.75 2.25 16.5l4.179-2.25m11.142-8.25L12 13.5" />
      </svg>
    ),
  },
  {
    id: 'tour360',
    label: '360°',
    icon: <EyeIcon />,
  },
  {
    id: 'plano',
    label: 'Planos',
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 6.75V15m6-6v8.25m.503 3.498l4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 00-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0z" />
      </svg>
    ),
  },
  {
    id: 'galeria' as const,
    label: 'Galería',
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
      </svg>
    ),
  },
];

export default function UnitViewer({
  unit,
  allUnits,
  projectSlug,
  projectName,
  buildingId,
  floorNumber,
  amenities = [],
  pointsOfInterest = [],
  projectLocation = '',
  projectLatitude,
  projectLongitude,
  initialTab,
  typeConfig,
}: UnitViewerProps) {
  // No hay display de precio en este visor (solo el CTA "Consultar
  // precio", gateado por showLeads) — showPrice no aplica acá.
  const { showStatus, showLeads, showCalculator, hasUnitStep, buildingLabel, unitLabel } = typeConfig;
  const router = useTransitionRouter();
  const basePath = useProjectBasePath();
  const searchParams = useSearchParams();
  const initialCompareUnitId = searchParams.get('compare');
  const [activeTab, setActiveTab] = useState<UnitViewTab>(initialCompareUnitId ? 'tour360' : (initialTab ?? 'planta3d'));
  const [isCalculatorOpen, setIsCalculatorOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [comparing, setComparing] = useState(!!initialCompareUnitId);
  const hasTour = !!(unit.tourImageUrl || unit.tourData);
  const sunAzimuths = projectLatitude != null ? getSunAzimuths(projectLatitude) : null;
  const [galleryIndex, setGalleryIndex] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const hasRooms = (!!unit.rooms && unit.rooms.length > 0) || !!unit.levels?.some(l => l.rooms.length > 0);
  // Programa de ambientes con detalle (tipo, m², características, foto) —
  // cuando está cargado, reemplaza a la lista plana "N Dormitorios / N
  // Baños". Agrupado por planta (planta baja + niveles extra).
  const showRoomProgram = hasRoomProgram(allProgramRooms(unit.rooms, unit.levels));
  const roomFloors = [
    { label: 'Planta baja', rooms: (unit.rooms ?? []).filter(r => r.kind) },
    ...(unit.levels ?? []).map(l => ({ label: l.label, rooms: (l.rooms ?? []).filter(r => r.kind) })),
  ].filter(g => g.rooms.length > 0);
  const [planView, setPlanView] = useState<'3d' | '2d' | 'ambientes'>(hasRooms ? 'ambientes' : '3d');
  const [focusNodeId, setFocusNodeId] = useState<string | undefined>(undefined);
  // Amenity detail state (inline tab)
  const [activeAmenity, setActiveAmenity] = useState<Amenity | null>(null);
  const [amenityImageIndex, setAmenityImageIndex] = useState(0);
  const [amenityViewMode, setAmenityViewMode] = useState<'fotos' | '360'>('fotos');
  const [amenitiesListOpen, setAmenitiesListOpen] = useState(true);
  const [amenityLightboxOpen, setAmenityLightboxOpen] = useState(false);

  const contactModal = useContactModal();
  const shareLink = useShareLink();

  // Amenities relevant to this building
  const relevantAmenities = useMemo(
    () => amenities.filter(a => !a.buildingId || a.buildingId === buildingId),
    [amenities, buildingId]
  );

  useEffect(() => {
    if (activeTab !== 'tour360') setComparing(false);
  }, [activeTab]);

  useEffect(() => {
    if (activeTab === 'amenities' && !activeAmenity && relevantAmenities.length > 0) {
      setActiveAmenity(relevantAmenities[0]);
      setAmenityImageIndex(0);
      setAmenityViewMode('fotos');
    }
  }, [activeTab, activeAmenity, relevantAmenities]);

  // Keyboard navigation for gallery and lightbox

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (activeTab !== 'galeria') return;
      
      if (e.key === 'ArrowRight') {
        if (lightboxOpen) {
          setLightboxIndex((i) => Math.min(i + 1, (unit.galleryImages?.length || 1) - 1));
        } else {
          setGalleryIndex((i) => Math.min(i + 1, (unit.galleryImages?.length || 1) - 1));
        }
      } else if (e.key === 'ArrowLeft') {
        if (lightboxOpen) {
          setLightboxIndex((i) => Math.max(i - 1, 0));
        } else {
          setGalleryIndex((i) => Math.max(i - 1, 0));
        }
      } else if (e.key === 'Escape') {
        if (lightboxOpen) setLightboxOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeTab, lightboxOpen, unit.galleryImages?.length]);

  // Keyboard navigation for el lightbox de amenities
  useEffect(() => {
    if (!amenityLightboxOpen || !activeAmenity) return;
    const total = activeAmenity.images.length;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') setAmenityImageIndex(i => (i + 1) % total);
      else if (e.key === 'ArrowLeft') setAmenityImageIndex(i => (i - 1 + total) % total);
      else if (e.key === 'Escape') setAmenityLightboxOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [amenityLightboxOpen, activeAmenity]);

  const handleShare = async () => {
    await shareLink(window.location.href, `Unidad ${unit.name} - ${projectSlug}`, `Mirá esta unidad: ${unit.name} (${unit.modelName})`);
  };

  const handleSelectRoom = useCallback((room: Room) => {
    if (!room.tourNodeId) return;
    setFocusNodeId(room.tourNodeId);
    setActiveTab('tour360');
  }, []);

  const statusColor = getStatusColor(unit.status);
  const statusLabel = getStatusLabel(unit.status);

  // Preload images
  const currentImg = lightboxOpen ? lightboxIndex : galleryIndex;
  const nextImgUrl = unit.galleryImages?.[currentImg + 1];
  const prevImgUrl = unit.galleryImages?.[currentImg - 1];

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden relative">
      {/* Preload hints for adjacent images to make transitions instant */}
      {nextImgUrl && <link rel="preload" as="image" href={nextImgUrl} />}
      {prevImgUrl && <link rel="preload" as="image" href={prevImgUrl} />}
      {/* ── Left Sidebar ──────────────────────────────────── */}
      <aside
        className={`hidden md:flex fixed inset-y-0 left-0 z-40 md:relative flex-shrink-0 bg-white border-gray-100 flex-col overflow-y-auto transition-all duration-300 shadow-2xl md:shadow-sm ${sidebarCollapsed ? '-translate-x-full md:w-0 md:overflow-hidden md:border-none md:opacity-0' : 'translate-x-0 w-full sm:w-80 md:w-72 border-r md:opacity-100'}`}
      >
        {/* Interior photo */}
        <div className="relative h-44 sm:h-56 md:h-44 bg-gray-100 flex-shrink-0">
          {/* Close button for mobile */}
          <button
            onClick={() => setSidebarCollapsed(true)}
            aria-label="Cerrar panel"
            className="md:hidden absolute top-4 left-4 w-10 h-10 rounded-full bg-white/80 backdrop-blur flex items-center justify-center shadow z-10"
          >
            <svg className="w-5 h-5 text-gray-800" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          {unit.interiorImageUrl && (
            <Image 
              src={unit.interiorImageUrl} 
              alt="Interior" 
              fill
              sizes="(max-width: 768px) 100vw, 300px"
              priority
              placeholder="blur"
              blurDataURL={shimmerDataUrl(300, 176)}
              className="object-cover"
            />
          )}
          <button
            onClick={handleShare}
            aria-label="Compartir esta unidad"
            className="absolute bottom-2 right-2 w-8 h-8 rounded-full bg-white/80 backdrop-blur flex items-center justify-center shadow hover:bg-white transition-colors"
          >
            <svg className="w-4 h-4 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M7.217 10.907a2.25 2.25 0 100 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186l9.566-5.314m-9.566 7.5l9.566 5.314m0 0a2.25 2.25 0 103.935 2.186 2.25 2.25 0 00-3.935-2.186zm0-12.814a2.25 2.25 0 103.933-2.185 2.25 2.25 0 00-3.933 2.185z" />
            </svg>
          </button>
        </div>

        <div className="p-5 flex-1">
          {/* Unit header */}
          <div className="flex items-center justify-between mb-0.5">
            <h2 className="text-lg font-bold text-gray-900">{unit.name}</h2>
            {showStatus && (
              <span className="text-xs font-semibold flex items-center gap-1" style={{ color: statusColor }}>
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: statusColor }} />
                {statusLabel.toUpperCase()}
              </span>
            )}
          </div>
          <p className="text-sm text-gray-400 uppercase tracking-wide mb-4">{unit.modelName}</p>

          {/* Price & Calculator */}
          {(showLeads || showCalculator) && (
            <div className="flex gap-2 mb-4">
              {showLeads && (
                <button
                  onClick={() => contactModal.open()}
                  className="flex-1 py-2 rounded-lg border border-gray-200 text-sm text-gray-700 font-medium hover:bg-gray-50 transition-colors"
                >
                  Consultar precio
                </button>
              )}
              {showCalculator && (
                <button
                  onClick={() => setIsCalculatorOpen(true)}
                  className="px-4 py-2 rounded-lg bg-gray-900 text-white hover:bg-gray-800 transition-colors flex items-center justify-center shadow-sm"
                  title="Calculadora de Financiación"
                  aria-label="Calculadora de Financiación"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 15.75V18m-7.5-6.75h.008v.008H8.25v-.008zm0 2.25h.008v.008H8.25v-.008zm0 2.25h.008v.008H8.25v-.008zm2.25-4.5h.008v.008H10.5v-.008zm0 2.25h.008v.008H10.5v-.008zm0 2.25h.008v.008H10.5v-.008zm2.25-4.5h.008v.008H12.75v-.008zm0 2.25h.008v.008H12.75v-.008zm0 2.25h.008v.008H12.75v-.008zm2.25-4.5h.008v.008H15v-.008zm0 2.25h.008v.008H15v-.008zm0 2.25h.008v.008H15v-.008zm-7.5-7.5h.008v.008H7.5V10.5zm2.25 0h.008v.008H9.75V10.5zm2.25 0h.008v.008H12V10.5zm2.25 0h.008v.008H14.25V10.5z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 7.5h9v3h-9v-3z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </button>
              )}
            </div>
          )}

          {/* View tabs (Galería / Planta 3D / Planos) */}
          <div className="flex items-center gap-1 overflow-x-auto border border-gray-100 rounded-xl p-1 mb-5 bg-gray-50" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
            {TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-none md:flex-1 w-[72px] md:w-auto flex flex-col items-center gap-1 py-2 rounded-lg text-xs font-medium transition-all duration-150 ${
                  activeTab === tab.id
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-400 hover:text-gray-600'
                }`}
              >
                {tab.icon}
                <span className="truncate w-full text-center px-1">{tab.label}</span>
              </button>
            ))}
          </div>

          {/* Specs */}
          <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">Instalaciones</h4>
          <motion.div
            initial="hidden"
            animate="visible"
            variants={{
              hidden: { opacity: 0 },
              visible: { opacity: 1, transition: { staggerChildren: 0.1 } }
            }}
            className="space-y-2.5 text-sm text-gray-600"
          >
            <SpecRow label={`Área total ${unit.totalArea} m²`} />
            <SpecRow label={`Área interna ${unit.innerArea} m²`} />
            {unit.balconyArea > 0 && <SpecRow label={`Área balcones ${unit.balconyArea} m²`} />}
            {unit.externalArea > 0 && <SpecRow label={`Área externa ${unit.externalArea} m²`} />}
            {!!unit.lotSize && <SpecRow label={`Terreno ${unit.lotSize} m²`} />}
            {!!unit.ceilingHeight && <SpecRow label={`Altura de techo ${unit.ceilingHeight} m`} />}
            {!showRoomProgram && <SpecRow label={`${unit.bedrooms} Dormitorio${unit.bedrooms !== 1 ? 's' : ''}`} />}
            {!showRoomProgram && <SpecRow label={`${unit.bathrooms} Baños`} />}
            {!showRoomProgram && !hasUnitStep && !!unit.livingRooms && <SpecRow label={`${unit.livingRooms} Living${unit.livingRooms !== 1 ? 's' : ''}`} />}
            {!showRoomProgram && !hasUnitStep && !!unit.kitchens && <SpecRow label={`${unit.kitchens} Cocina${unit.kitchens !== 1 ? 's' : ''}`} />}
            {!showRoomProgram && !hasUnitStep && !!unit.otherRoomsCount && (
              <SpecRow label={`${unit.otherRoomsCount} ambiente${unit.otherRoomsCount !== 1 ? 's' : ''} más${unit.otherRoomsDescription ? ` (${unit.otherRoomsDescription})` : ''}`} />
            )}
            {!!unit.floorsCount && unit.floorsCount > 1 && <SpecRow label={`${unit.floorsCount} Plantas`} />}
            {!!unit.orientation && <SpecRow label={`Orientación ${unit.orientation}`} />}
            {unit.hasServiceRoom && <SpecRow label="Cuarto de Servicio" />}
            {!!unit.garageSpaces && (
              <SpecRow label={`${unit.garageSpaces} Cochera${unit.garageSpaces !== 1 ? 's' : ''}${unit.garageType ? ` (${unit.garageType})` : ''}`} />
            )}
            {!!unit.hoaFee && <SpecRow label={`Expensas ${formatPrice(unit.hoaFee, unit.currency)}/mes`} />}
          </motion.div>

          {/* Programa de ambientes — detalle de cada uno, agrupado por planta */}
          {showRoomProgram && (
            <>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mt-6 mb-3">Ambientes</h4>
              <div className="space-y-4">
                {roomFloors.map((group, gi) => (
                  <div key={gi}>
                    {roomFloors.length > 1 && (
                      <p className="text-xs font-semibold text-gray-500 mb-2">{group.label}</p>
                    )}
                    <ul className="space-y-3 text-sm">
                      {group.rooms.map(room => (
                        <li key={room.id} className="flex gap-3">
                          {room.imageUrl && (
                            <div className="relative w-20 h-20 shrink-0 rounded-lg overflow-hidden bg-gray-100">
                              <Image
                                src={room.imageUrl}
                                alt={room.name || ROOM_KIND_LABEL[room.kind!]}
                                fill
                                sizes="80px"
                                placeholder="blur"
                                blurDataURL={shimmerDataUrl(80, 80)}
                                className="object-cover"
                              />
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-baseline gap-x-2">
                              <span className="font-medium text-gray-900">{room.name || ROOM_KIND_LABEL[room.kind!]}</span>
                              <span className="text-gray-400">· {ROOM_KIND_LABEL[room.kind!]}</span>
                              {!!room.area && <span className="text-gray-500">· {room.area} m²</span>}
                            </div>
                            {(room.features?.length || room.notes) && (
                              <p className="text-xs text-gray-400 mt-0.5">
                                {[...(room.features ?? []), room.notes].filter(Boolean).join(' · ')}
                              </p>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Accesos rápidos a tabs de Amenities / Ubicación */}
          {(amenities.length > 0 || pointsOfInterest.length > 0) && (
            <div className="grid grid-cols-2 gap-2 mt-5">
              {amenities.length > 0 && (
                <button
                  onClick={() => setActiveTab('amenities')}
                  className="flex items-center justify-center gap-1.5 py-2 rounded-lg border border-gray-200 text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 4.5l7.5 7.5-7.5 7.5m-6-15l7.5 7.5-7.5 7.5" />
                  </svg>
                  Amenities
                </button>
              )}
              {pointsOfInterest.length > 0 && (
                <button
                  onClick={() => setActiveTab('ubicacion')}
                  className="flex items-center justify-center gap-1.5 py-2 rounded-lg border border-gray-200 text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
                  </svg>
                  Ubicación
                </button>
              )}
            </div>
          )}

          {/* Contact */}
          {showLeads && (
            <div className="mt-5 pt-4 border-t border-gray-100">
              <p className="text-xs text-gray-400 mb-3">Solicitar información</p>
              <div className="flex items-center gap-3">
                {[
                  { type: 'email' as const, icon: <svg key="email" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" /></svg> },
                  { type: 'phone' as const, icon: <svg key="phone" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" /></svg> },
                  { type: 'whatsapp' as const, icon: <svg key="wa" className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" /></svg> },
                ].map((item, i) => (
                  <button
                    key={i}
                    onClick={() => contactModal.open(item.type)}
                    aria-label={
                      item.type === 'email' ? 'Solicitar información por email'
                      : item.type === 'phone' ? 'Solicitar información por teléfono'
                      : 'Solicitar información por WhatsApp'
                    }
                    className="w-9 h-9 rounded-full border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-50 hover:text-gray-700 transition-colors"
                  >
                    {item.icon}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </aside>

      {/* ── Mobile: fixed top bar ──────────────────────────── */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-30 bg-white/95 backdrop-blur-md border-b border-gray-100 flex items-center gap-3 px-4 py-3 shadow-sm">
        <button
          onClick={() => router.push(`${basePath}/edificio/${buildingId}`)}
          aria-label="Volver al plano"
          className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0"
        >
          <svg className="w-5 h-5 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-[15px] font-bold text-gray-900 truncate">{unit.name}</h1>
            {showStatus && (
              <span className="text-[11px] font-semibold flex-shrink-0" style={{ color: statusColor }}>{statusLabel.toUpperCase()}</span>
            )}
          </div>
          <p className="text-xs text-gray-400 truncate">{unit.modelName} · {unit.totalArea}m² · P{floorNumber}</p>
        </div>
        {!comparing && (
          <button onClick={() => setComparing(true)} aria-label="Comparar con otra unidad" className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
            <svg className="w-4 h-4 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <rect x="3" y="4" width="7.5" height="16" rx="1" />
              <rect x="13.5" y="4" width="7.5" height="16" rx="1" />
            </svg>
          </button>
        )}
        <button onClick={handleShare} aria-label="Compartir" className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
          <svg className="w-4 h-4 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M7.217 10.907a2.25 2.25 0 100 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186l9.566-5.314m-9.566 7.5l9.566 5.314m0 0a2.25 2.25 0 103.935 2.186 2.25 2.25 0 00-3.935-2.186zm0-12.814a2.25 2.25 0 103.933-2.185 2.25 2.25 0 00-3.933 2.185z" />
          </svg>
        </button>
      </div>

      {/* ── Main viewer ───────────────────────────────────── */}
      <div className="flex-1 relative overflow-hidden">

        {/* Top bar — desktop only */}
        <div className="hidden md:flex absolute top-0 left-0 right-0 z-20 flex-wrap items-center justify-between gap-2 px-4 pt-4 pointer-events-none">
          <div className="flex items-center gap-2 pointer-events-auto min-w-0">
            <Breadcrumbs
              projectName={projectName}
              buildingLabel={!hasUnitStep ? buildingLabel : undefined}
              unitLabel={!hasUnitStep ? unitLabel : undefined}
            />
          </div>

          {/* Floor badge + Cambiar planta */}
          <div className="flex items-center gap-2 pointer-events-auto">
            {!isFullscreen && !comparing && (
              <button
                onClick={() => setComparing(true)}
                className="flex items-center gap-2 px-4 py-1.5 rounded-lg bg-white shadow text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors whitespace-nowrap"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <rect x="3" y="4" width="7.5" height="16" rx="1" />
                  <rect x="13.5" y="4" width="7.5" height="16" rx="1" />
                </svg>
                Comparador
              </button>
            )}
            {hasUnitStep && (
              <>
                <span className="text-sm font-medium text-gray-700 bg-white shadow rounded-lg px-3 py-1.5 whitespace-nowrap">
                  Planta {floorNumber}
                </span>
                <button
                  onClick={() => router.push(`${basePath}/edificio/${buildingId}`)}
                  className="px-4 py-1.5 rounded-lg bg-white shadow text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors whitespace-nowrap"
                >
                  Cambiar planta
                </button>
              </>
            )}
          </div>
        </div>        {/* Right tab selector (hidden below md — redundant with the sidebar's own
             tab row while the sidebar renders as a full overlay drawer; from md up
             the sidebar sits in-flow and this floating strip has room of its own) */}
        <div className="hidden md:flex absolute right-4 top-20 z-20 flex-col gap-2">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              title={tab.label}
              aria-label={tab.label}
              aria-current={activeTab === tab.id ? 'true' : undefined}
              className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-150 shadow ${
                activeTab === tab.id
                  ? 'bg-gray-900 text-white shadow-lg'
                  : 'bg-white text-gray-400 hover:text-gray-700 hover:bg-gray-50'
              }`}
            >
              {tab.icon}
            </button>
          ))}
        </div>

        {/* Viewer area — on mobile pad top (top bar) and bottom (bottom nav) */}
        <div className="absolute inset-0 md:top-0 top-[61px] md:bottom-0 bottom-[64px] overflow-hidden">
          <AnimatePresence mode="wait">
            {activeTab === 'planta3d' && (
              <Planta3DTab unit={unit} />
            )}

            {activeTab === 'tour360' && (
              hasTour ? (
                <Tour360Tab
                  unit={unit}
                  focusNodeId={focusNodeId}
                  isFullscreen={isFullscreen}
                  onFullscreenChange={setIsFullscreen}
                  sunAzimuths={sunAzimuths}
                />
              ) : (
                <motion.div
                  key="tour360-empty"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-0 pt-16 flex items-center justify-center text-gray-400 text-sm"
                >
                  Todavía no hay recorrido 360° cargado para esta unidad.
                </motion.div>
              )
            )}

            {activeTab === 'plano' && (
              <PlanoTab
                unit={unit}
                hasRooms={hasRooms}
                planView={planView}
                onPlanViewChange={setPlanView}
                onSelectRoom={handleSelectRoom}
              />
            )}

            {activeTab === 'galeria' && (
              unit.galleryImages && unit.galleryImages.length > 0 ? (
                <GaleriaTab
                  images={unit.galleryImages}
                  activeIndex={galleryIndex}
                  onIndexChange={setGalleryIndex}
                  onOpenLightbox={(index) => { setLightboxIndex(index); setLightboxOpen(true); }}
                />
              ) : (
                <motion.div
                  key="galeria-empty"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-0 pt-16 flex items-center justify-center text-gray-400 text-sm"
                >
                  Todavía no hay fotos cargadas para esta unidad.
                </motion.div>
              )
            )}

            {/* ── Amenities tab ── */}
            {activeTab === 'amenities' && (
              <AmenitiesTab
                amenities={relevantAmenities}
                activeAmenity={activeAmenity}
                onSelectAmenity={(a) => {
                  setActiveAmenity(a);
                  setAmenityImageIndex(0);
                  setAmenityViewMode('fotos');
                  setAmenityLightboxOpen(false);
                }}
                imageIndex={amenityImageIndex}
                onImageIndexChange={setAmenityImageIndex}
                viewMode={amenityViewMode}
                onViewModeChange={setAmenityViewMode}
                listOpen={amenitiesListOpen}
                onListOpenChange={setAmenitiesListOpen}
                onOpenLightbox={() => setAmenityLightboxOpen(true)}
              />
            )}

            {/* ── Ubicación tab ── */}
            {activeTab === 'ubicacion' && (
              <UbicacionTab
                projectLocation={projectLocation}
                projectLatitude={projectLatitude}
                projectLongitude={projectLongitude}
                pointsOfInterest={pointsOfInterest}
              />
            )}
          </AnimatePresence>
        </div>

        <AnimatePresence>
          {comparing && (
            <CompareView
              unit={unit}
              allUnits={allUnits}
              initialContentType={activeTab}
              initialCompareUnitId={initialCompareUnitId}
              onClose={() => setComparing(false)}
            />
          )}
        </AnimatePresence>

        {/* Bottom-right: "Ubicación en planta" mini map — hidden en gallery mode y en mobile */}
        {activeTab !== 'galeria' && hasUnitStep && (
          <button
            onClick={() => router.push(`${basePath}/edificio/${buildingId}?piso=${floorNumber}`)}
            className={`hidden md:block absolute right-16 z-20 bg-white rounded-xl shadow-lg overflow-hidden hover:shadow-xl transition-shadow ${
              sidebarCollapsed ? 'bottom-24 md:bottom-5' : 'bottom-5'
            }`}
          >
            <div className="relative w-24 h-16">
              <Image
                src="/floorplans/floor-1.png"
                alt="Ubicación en planta"
                fill
                sizes="100px"
                className="object-cover"
              />
              <div className="absolute inset-0 bg-black/30 flex items-end p-1">
                <span className="text-white text-[9px] font-medium leading-tight">Ubicación en planta</span>
              </div>
            </div>
          </button>
        )}


      </div>

      <ImageLightbox
        isOpen={lightboxOpen}
        images={unit.galleryImages ?? []}
        index={lightboxIndex}
        onIndexChange={setLightboxIndex}
        onClose={() => setLightboxOpen(false)}
        altPrefix="Imagen"
      />

      <ImageLightbox
        isOpen={amenityLightboxOpen}
        images={activeAmenity?.images ?? []}
        index={amenityImageIndex}
        onIndexChange={setAmenityImageIndex}
        onClose={() => setAmenityLightboxOpen(false)}
        altPrefix={activeAmenity?.name ?? 'Imagen'}
      />

      {showLeads && (
        <LeadCaptureModal
          isOpen={contactModal.isOpen}
          onClose={contactModal.close}
          unit={unit}
          projectSlug={projectSlug}
          defaultMethod={contactModal.method}
        />
      )}

      {showCalculator && (
        <MortgageCalculatorModal
          isOpen={isCalculatorOpen}
          onClose={() => setIsCalculatorOpen(false)}
          unitPrice={unit.price || 150000}
          currency={unit.currency}
          projectSlug={projectSlug}
        />
      )}

      {/* ── Mobile: bottom navigation bar ──────────────────── */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-white/95 backdrop-blur-md border-t border-gray-100 flex items-stretch shadow-lg" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            aria-label={tab.label}
            className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-2 transition-all min-w-0 ${
              activeTab === tab.id ? 'text-gray-900' : 'text-gray-400'
            }`}
          >
            <span className={`p-1.5 rounded-xl transition-all ${
              activeTab === tab.id ? 'bg-gray-900 text-white' : 'text-gray-400'
            }`}>
              {tab.icon}
            </span>
            <span className="text-[10px] font-semibold">{tab.label}</span>
          </button>
        ))}

        {/* Amenities tab — only if there are amenities */}
        {relevantAmenities.length > 0 && (
          <button
            onClick={() => setActiveTab('amenities')}
            aria-label="Amenities"
            className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-2 transition-all min-w-0 ${
              activeTab === 'amenities' ? 'text-gray-900' : 'text-gray-400'
            }`}
          >
            <span className={`p-1.5 rounded-xl transition-all ${
              activeTab === 'amenities' ? 'bg-gray-900 text-white' : 'text-gray-400'
            }`}>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 4.5l7.5 7.5-7.5 7.5m-6-15l7.5 7.5-7.5 7.5" />
              </svg>
            </span>
            <span className="text-[10px] font-semibold">Amenities</span>
          </button>
        )}

        {/* Ubicación tab — only if there are POIs */}
        {pointsOfInterest.length > 0 && (
          <button
            onClick={() => setActiveTab('ubicacion')}
            aria-label="Ubicación"
            className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-2 transition-all min-w-0 ${
              activeTab === 'ubicacion' ? 'text-gray-900' : 'text-gray-400'
            }`}
          >
            <span className={`p-1.5 rounded-xl transition-all ${
              activeTab === 'ubicacion' ? 'bg-gray-900 text-white' : 'text-gray-400'
            }`}>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
              </svg>
            </span>
            <span className="text-[10px] font-semibold">Ubicación</span>
          </button>
        )}

        {/* Contact CTA */}
        {showLeads && (
          <button
            onClick={() => contactModal.open()}
            className="flex-1 flex flex-col items-center justify-center gap-0.5 py-2 text-brand-600"
            aria-label="Contacto"
          >
            <span className="p-1.5 rounded-xl bg-brand-500 text-white">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
              </svg>
            </span>
            <span className="text-[10px] font-semibold">Contacto</span>
          </button>
        )}
      </nav>

    </div>
  );
}

function SpecRow({ label }: { label: string }) {
  return (
    <motion.div
      variants={{
        hidden: { opacity: 0, x: -10 },
        visible: { opacity: 1, x: 0, transition: { duration: 0.3 } }
      }}
      className="flex items-center gap-2 text-gray-600"
    >
      <span className="w-1 h-1 rounded-full bg-gray-300 flex-shrink-0" />
      {label}
    </motion.div>
  );
}
