'use client';

import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import Image from 'next/image';
import { m as motion, AnimatePresence } from 'framer-motion';
import { useTransitionRouter } from '@/components/ui/TransitionUtils';
import Breadcrumbs from '@/components/ui/Breadcrumbs';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
import type { Building, Unit, Floor, Amenity, PointOfInterest } from '@/types';
import { getUnitsByBuildingAndFloor, getStatusColor, getStatusLabel } from '@/data/mockData';
import LeadCaptureModal from '@/components/ui/LeadCaptureModal';
import { shimmerDataUrl } from '@/lib/imagePlaceholder';

interface FloorPlanViewerProps {
  building: Building;
  units: Unit[];
  projectSlug: string;
  projectName: string;
  amenities?: Amenity[];
  pointsOfInterest?: PointOfInterest[];
  initialFloor?: number;
}

export default function FloorPlanViewer({
  building,
  units: allUnits,
  projectSlug,
  projectName,
  amenities = [],
  pointsOfInterest = [],
  initialFloor = 1,
}: FloorPlanViewerProps) {
  const router = useTransitionRouter();
  const [activeFloor, setActiveFloor] = useState(initialFloor);
  const [selectedUnit, setSelectedUnit] = useState<Unit | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [hoveredUnit, setHoveredUnit] = useState<string | null>(null);
  const [mobilePreviewUnit, setMobilePreviewUnit] = useState<Unit | null>(null);
  const isMobileRef = useRef(typeof window !== 'undefined' ? window.innerWidth < 768 : false);

  useEffect(() => {
    const checkMobile = () => { isMobileRef.current = window.innerWidth < 768; };
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const [isContactModalOpen, setIsContactModalOpen] = useState(false);
  const [contactMethod, setContactMethod] = useState<'email' | 'whatsapp' | 'phone'>('email');

  const openContact = (method: 'email' | 'whatsapp' | 'phone' = 'email') => {
    setContactMethod(method);
    setIsContactModalOpen(true);
  };

  const handleShare = async () => {
    if (!selectedUnit) return;
    const url = `${window.location.origin}/proyecto/${projectSlug}/edificio/${building.id}/unidad/${selectedUnit.id}`;
    const title = `Unidad ${selectedUnit.name} - ${projectSlug}`;
    if (navigator.share) {
      try {
        await navigator.share({
          title,
          text: `Mirá esta unidad: ${selectedUnit.name} (${selectedUnit.modelName})`,
          url,
        });
      } catch (err) {
        console.log('Error sharing', err);
      }
    } else {
      navigator.clipboard.writeText(url);
      alert('Link copiado al portapapeles');
    }
  };

  const floor: Floor | undefined = building.floors.find(f => f.number === activeFloor);
  const unitsOnFloor = getUnitsByBuildingAndFloor(allUnits, building.id, activeFloor);

  // Unidades que tienen la forma real delimitada (polígono) sobre el plano,
  // para marcar la sección en gris al pasar el mouse.
  const polygonUnits = useMemo(
    () => unitsOnFloor.filter(u => u.polygon && u.polygon.length > 0),
    [unitsOnFloor]
  );

  useEffect(() => {
    if (unitsOnFloor.length > 0) {
      if (!selectedUnit || selectedUnit.floor !== activeFloor) {
        setSelectedUnit(unitsOnFloor[0]);
        // On mobile: don't auto-open the full panel, just pre-select silently
        if (!isMobileRef.current) {
          setPanelOpen(true);
        } else {
          setMobilePreviewUnit(null);
        }
      }
    }
  }, [activeFloor, unitsOnFloor, selectedUnit]);

  const handleSelectUnit = useCallback((unit: Unit) => {
    if (isMobileRef.current) {
      // On mobile: tap pin → show compact bottom preview, not full panel
      setMobilePreviewUnit(prev => prev?.id === unit.id ? null : unit);
      setSelectedUnit(unit);
    } else {
      setSelectedUnit(unit);
      setPanelOpen(true);
    }
  }, []);

  const handleOpenFullPanel = useCallback((unit: Unit) => {
    if (isMobileRef.current) {
      // On mobile: go directly to the unit page, no intermediate panel
      router.push(`/proyecto/${projectSlug}/edificio/${building.id}/unidad/${unit.id}`);
    } else {
      setSelectedUnit(unit);
      setMobilePreviewUnit(null);
      setPanelOpen(true);
    }
  }, [router, projectSlug, building.id]);

  const handleClosePanel = useCallback(() => {
    // No limpiamos selectedUnit acá: el efecto de arriba auto-selecciona
    // la primera unidad del piso en cuanto detecta que no hay ninguna
    // seleccionada, lo que reabría este mismo panel apenas se cerraba.
    setPanelOpen(false);
  }, []);

  const handleEnterUnit = useCallback(() => {
    if (!selectedUnit) return;
    router.push(`/proyecto/${projectSlug}/edificio/${building.id}/unidad/${selectedUnit.id}`);
  }, [selectedUnit, projectSlug, building.id, router]);

  // Entra a la unidad directo en el tab de Amenities/Ubicación — misma
  // experiencia inmersiva que ya tiene el visor de la unidad, en vez de
  // un popup aparte acá.
  const handleEnterUnitTab = useCallback((tab: 'amenities' | 'ubicacion') => {
    if (!selectedUnit) return;
    router.push(`/proyecto/${projectSlug}/edificio/${building.id}/unidad/${selectedUnit.id}?tab=${tab}`);
  }, [selectedUnit, projectSlug, building.id, router]);

  const floorNumbers = building.floors
    .map(f => f.number)
    .sort((a, b) => b - a); // descending (top = highest)

  return (
    <div className="flex h-screen bg-white overflow-hidden">
      {/* ── Left unit panel ──────────────────────────────────── */}
      {/* ── Left panel ──────────────────────────────────── */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 md:relative flex-shrink-0 bg-white border-r border-gray-100 flex flex-col overflow-y-auto transition-transform duration-300 shadow-2xl md:shadow-sm ${
          panelOpen ? 'translate-x-0 w-full sm:w-80' : '-translate-x-full md:translate-x-0'
        } md:w-72`}
      >
        {selectedUnit ? (
          <div className="flex flex-col h-full animate-in fade-in duration-300">
            {/* Interior photo thumbnail */}
            <div className="relative h-44 sm:h-56 md:h-44 bg-gray-100 flex-shrink-0">
              {/* Close button for mobile */}
              <button
                onClick={handleClosePanel}
                aria-label="Cerrar panel de la unidad"
                className="md:hidden absolute top-4 left-4 w-10 h-10 rounded-full bg-white/80 backdrop-blur flex items-center justify-center shadow z-10"
              >
                <svg className="w-5 h-5 text-gray-800" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
              {selectedUnit.interiorImageUrl && (
                <Image
                  src={selectedUnit.interiorImageUrl}
                  alt="Interior"
                  fill
                  sizes="(max-width: 768px) 100vw, 300px"
                  priority
                  placeholder="blur"
                  blurDataURL={shimmerDataUrl(300, 176)}
                  className="object-cover"
                />
              )}
              {/* Share button */}
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

            {/* Unit info */}
            <div className="p-5 flex-1 flex flex-col">
              {/* Header */}
              <div className="flex items-center justify-between mb-1">
                <h2 className="text-lg font-bold text-gray-900">{selectedUnit.name}</h2>
                <span
                  className="text-xs font-semibold flex items-center gap-1"
                  style={{ color: getStatusColor(selectedUnit.status) }}
                >
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: getStatusColor(selectedUnit.status) }}
                  />
                  {getStatusLabel(selectedUnit.status).toUpperCase()}
                </span>
              </div>
              <p className="text-sm text-gray-500 mb-4 uppercase tracking-wide">{selectedUnit.modelName}</p>

              {/* Price / Consult */}
              {selectedUnit.price ? (
                <div className="mb-4">
                  <p className="text-xs text-gray-400">Precio</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(selectedUnit.price)}
                  </p>
                </div>
              ) : (
                <button 
                  onClick={() => openContact()}
                  className="w-full mb-4 py-2 rounded-lg border border-gray-200 text-sm text-gray-700 font-medium hover:bg-gray-50 transition-colors"
                >
                  Consultar precio
                </button>
              )}

              {/* Enter button */}
              {selectedUnit.status !== 'sold' && (
                <button
                  onClick={handleEnterUnit}
                  className="w-full py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-600 text-white font-semibold text-sm transition-colors mb-6"
                >
                  Ingresar
                </button>
              )}

              {/* Specs */}
              <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">Instalaciones</h4>
              <motion.div
                initial="hidden"
                animate="visible"
                variants={{
                  hidden: { opacity: 0 },
                  visible: { opacity: 1, transition: { staggerChildren: 0.1 } }
                }}
                className="space-y-2.5"
              >
                <SpecRow icon="area-total" label={`Área total ${selectedUnit.totalArea} m²`} />
                <SpecRow icon="area-inner" label={`Área interna ${selectedUnit.innerArea} m²`} />
                {selectedUnit.balconyArea > 0 && (
                  <SpecRow icon="balcony" label={`Área balcones ${selectedUnit.balconyArea} m²`} />
                )}
                {selectedUnit.externalArea > 0 && (
                  <SpecRow icon="external" label={`Área externa ${selectedUnit.externalArea} m²`} />
                )}
                <SpecRow icon="bed" label={`${selectedUnit.bedrooms} Dormitorio${selectedUnit.bedrooms !== 1 ? 's' : ''}`} />
                <SpecRow icon="bath" label={`${selectedUnit.bathrooms} Baños`} />
                {selectedUnit.hasServiceRoom && (
                  <SpecRow icon="service" label="Cuarto de Servicio" />
                )}
              </motion.div>

              {/* Amenities / Ubicación */}
              {(amenities.length > 0 || pointsOfInterest.length > 0) && (
                <div className="grid grid-cols-2 gap-2 mt-5">
                  {amenities.length > 0 && (
                    <button
                      onClick={() => handleEnterUnitTab('amenities')}
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
                      onClick={() => handleEnterUnitTab('ubicacion')}
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
              <div className="mt-auto pt-4 border-t border-gray-100">
                <p className="text-xs text-gray-400 mb-3">Solicitar información</p>
                <div className="flex items-center gap-3">
                  <ContactBtn title="Email" onClick={() => openContact('email')}>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                    </svg>
                  </ContactBtn>
                  <ContactBtn title="Teléfono" onClick={() => openContact('phone')}>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
                    </svg>
                  </ContactBtn>
                  <ContactBtn title="WhatsApp" onClick={() => openContact('whatsapp')}>
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                    </svg>
                  </ContactBtn>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col h-full animate-in fade-in duration-300">
            {/* Building/Floor abstract header */}
            <div className="relative h-44 sm:h-56 md:h-44 bg-gray-900 flex-shrink-0 overflow-hidden">
              {floor && (
                <Image
                  src={floor.planImage}
                  alt="Floor plan background"
                  fill
                  sizes="(max-width: 768px) 100vw, 300px"
                  priority
                  placeholder="blur"
                  blurDataURL={shimmerDataUrl(300, 176)}
                  className="object-cover opacity-30 blur-sm scale-110"
                />
              )}
              <div className="absolute inset-0 flex flex-col items-center justify-center p-4 text-center">
                <h2 className="text-3xl font-bold text-white drop-shadow-lg">{building.name}</h2>
                <span className="text-sm font-semibold text-gray-900 bg-white/90 px-4 py-1.5 rounded-full mt-3 shadow-md">
                  Planta {activeFloor}
                </span>
              </div>
            </div>

            {/* Floor Summary */}
            <div className="p-5 flex-1 flex flex-col">
              <h3 className="text-lg font-bold text-gray-900 mb-2">Resumen de Planta</h3>
              <p className="text-sm text-gray-500 mb-6 leading-relaxed">
                Selecciona una unidad en el plano interactivo para ver fotografías interiores, recorrerla en 360° y conocer sus especificaciones completas.
              </p>

              <div className="space-y-4 mb-6">
                <div className="flex justify-between items-center border-b border-gray-100 pb-2">
                  <span className="text-sm text-gray-500">Unidades Totales</span>
                  <span className="text-sm font-semibold text-gray-900">{unitsOnFloor.length}</span>
                </div>
                <div className="flex justify-between items-center border-b border-gray-100 pb-2">
                  <span className="text-sm text-gray-500">Unidades Disponibles</span>
                  <span className="text-sm font-semibold text-emerald-600">
                    {unitsOnFloor.filter(u => u.status === 'available').length}
                  </span>
                </div>
                <div className="flex justify-between items-center border-b border-gray-100 pb-2">
                  <span className="text-sm text-gray-500">Reservadas / Vendidas</span>
                  <span className="text-sm font-semibold text-amber-600">
                    {unitsOnFloor.filter(u => u.status !== 'available').length}
                  </span>
                </div>
              </div>

              {/* Contact */}
              <div className="mt-auto pt-4 border-t border-gray-100">
                <p className="text-xs text-gray-400 mb-3">Asesoramiento Comercial</p>
                <div className="flex items-center gap-3">
                  <ContactBtn title="Email" onClick={() => openContact('email')}>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                    </svg>
                  </ContactBtn>
                  <ContactBtn title="Teléfono" onClick={() => openContact('phone')}>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
                    </svg>
                  </ContactBtn>
                  <ContactBtn title="WhatsApp" onClick={() => openContact('whatsapp')}>
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                    </svg>
                  </ContactBtn>
                </div>
              </div>
            </div>
          </div>
        )}
      </aside>

      {/* ── Main floor plan area ────────────────────────────── */}
      <div className="flex-1 relative overflow-hidden">
        {/* Top bar */}
        <div className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-5 pt-5 pointer-events-none">
          <div className="flex items-center gap-2 pointer-events-auto">
            <Breadcrumbs projectName={projectName} />
          </div>


        </div>

        {/* Floor plan image + unit dots */}
        <div className="absolute inset-0 flex items-center justify-center p-2 sm:p-8 sm:pt-16 cursor-grab active:cursor-grabbing">
          {floor ? (
            <TransformWrapper
              initialScale={1}
              minScale={0.5}
              maxScale={4}
              centerOnInit
              wheel={{ step: 0.1 }}
              doubleClick={{ disabled: false, step: 0.5 }}
              pinch={{ step: 5 }}
            >
              <TransformComponent wrapperClass="w-full h-full !flex items-center justify-center" contentClass="relative w-full max-w-[1400px]">
                <Image
                  src={floor.planImage}
                  alt={floor.label}
                  width={1600}
                  height={1600}
                  priority
                  unoptimized={floor.planImage.endsWith('.svg')}
                  className="w-full h-auto object-contain select-none pointer-events-none"
                  draggable={false}
                />

                {/* Deptos: al pasar el mouse se marca la sección en gris */}
                {polygonUnits.length > 0 && (
                  <svg
                    className="absolute inset-0 w-full h-full pointer-events-none"
                    viewBox="0 0 100 100"
                    preserveAspectRatio="none"
                  >
                    {polygonUnits.map(unit => (
                      <polygon
                        key={unit.id}
                        points={unit.polygon!.map(p => `${p.x},${p.y}`).join(' ')}
                        className="unit-hover-zone pointer-events-auto"
                        onMouseEnter={() => setHoveredUnit(unit.id)}
                        onMouseLeave={() => setHoveredUnit(null)}
                        onFocus={() => setHoveredUnit(unit.id)}
                        onBlur={() => setHoveredUnit(null)}
                        onClick={() => handleSelectUnit(unit)}
                        role="button"
                        tabIndex={0}
                        aria-label={`Seleccionar ${unit.name}`}
                        onKeyDown={e => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            handleSelectUnit(unit);
                          }
                        }}
                      />
                    ))}
                  </svg>
                )}

                {/* Etiqueta flotante del depto bajo el mouse */}
                {hoveredUnit && (() => {
                  const hu = polygonUnits.find(u => u.id === hoveredUnit);
                  const poly = hu?.polygon;
                  if (!hu || !poly || poly.length === 0) return null;
                  const cx = poly.reduce((s, p) => s + p.x, 0) / poly.length;
                  const cy = poly.reduce((s, p) => s + p.y, 0) / poly.length;
                  return (
                    <div
                      className="absolute z-10 pointer-events-none"
                      style={{ left: `${cx}%`, top: `${cy}%`, transform: 'translate(-50%, -50%)' }}
                    >
                      <div className="bg-white shadow-lg rounded-lg px-3 py-1.5 text-center whitespace-nowrap border border-gray-100">
                        <p className="text-xs font-semibold text-gray-900">{hu.name}</p>
                        <p className="text-[10px] text-gray-500">{hu.modelName} · {hu.totalArea}m²</p>
                      </div>
                    </div>
                  );
                })()}

                {/* Unit dots (etiquetas tipo píldora, como antes) */}
                <motion.div
                  initial="hidden"
                  animate="visible"
                  variants={{
                    hidden: { opacity: 0 },
                    visible: {
                      opacity: 1,
                      transition: { staggerChildren: 0.05 },
                    },
                  }}
                  className="absolute inset-0 pointer-events-none"
                >
                  {floor.unitDots.map(dot => {
                    let unit = unitsOnFloor.find(u => u.id === dot.unitId);
                    if (!unit) {
                      // Generate a placeholder unit for floors beyond our defined data
                      unit = {
                        id: dot.unitId, name: dot.unitId, modelName: 'DUET STANDARD',
                        buildingId: building.id, floor: activeFloor, type: '2 dormitorios',
                        totalArea: 95, innerArea: 82, balconyArea: 13, externalArea: 0,
                        bedrooms: 2, bathrooms: 2, hasServiceRoom: false, status: 'available',
                        interiorImageUrl: '/units/interior-1.jpg',
                        tourImageUrl: '/tours/sample-pano.png',
                        floorPlan3dUrl: '/floorplans/floor-1-3d.png',
                        technicalPlanUrl: '/floorplans/floor-1-2d.png',
                      };
                    }
                    return (
                      <UnitDotMarker
                        key={dot.unitId} dot={dot} unit={unit}
                        isSelected={selectedUnit?.id === dot.unitId}
                        onSelect={handleSelectUnit}
                      />
                    );
                  })}
                </motion.div>
              </TransformComponent>
            </TransformWrapper>
          ) : (
            <div className="text-gray-400 text-sm">Plano no disponible</div>
          )}
        </div>
      </div>


      {/* ── Right floor selector ──────────────────────────── */}
      <div className="w-11 sm:w-14 flex-shrink-0 flex flex-col items-center justify-between py-4 bg-white border-l border-gray-100 z-20">
        {/* Top: fullscreen icon placeholder */}
        <div className="w-8 h-8" />

        {/* Floor numbers */}
        <div className="flex flex-col items-center gap-1 overflow-y-auto max-h-[calc(100vh-8rem)] py-2 w-full">
          {floorNumbers.map(num => (
            <button
              key={num}
              onClick={() => { setActiveFloor(num); setSelectedUnit(null); setPanelOpen(false); setMobilePreviewUnit(null); }}
              aria-label={num === 0 ? 'Planta baja' : `Piso ${num}`}
              aria-current={activeFloor === num ? 'true' : undefined}
              className={`rounded-full text-sm font-medium transition-all duration-150 flex items-center justify-center flex-shrink-0 ${
                activeFloor === num
                  ? 'w-9 h-9 sm:w-10 sm:h-10 bg-gray-900 text-white shadow-lg'
                  : 'w-8 h-8 sm:w-9 sm:h-9 text-gray-400 hover:text-gray-700 hover:bg-gray-100'
              }`}
            >
              {num === 0 ? 'L' : num}
            </button>
          ))}
        </div>

        {/* Bottom placeholder */}
        <div className="w-8 h-8" />
      </div>

      <LeadCaptureModal
        isOpen={isContactModalOpen}
        onClose={() => setIsContactModalOpen(false)}
        unit={selectedUnit}
        defaultMethod={contactMethod}
      />

      {/* ── Mobile: tap-outside overlay for full panel ── */}
      {panelOpen && (
        <div
          className="md:hidden fixed inset-0 z-30 bg-black/30 backdrop-blur-sm"
          onClick={handleClosePanel}
        />
      )}

      {/* ── Mobile bottom sheet unit preview ── */}
      <AnimatePresence>
        {mobilePreviewUnit && !panelOpen && (
          <motion.div
            key="mobile-preview"
            initial={{ y: '100%', opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: '100%', opacity: 0 }}
            transition={{ type: 'spring', stiffness: 380, damping: 38 }}
            className="md:hidden fixed bottom-0 inset-x-0 z-50 bg-white rounded-t-3xl shadow-2xl border-t border-gray-100 overflow-hidden"
          >
            {/* Drag handle */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full bg-gray-300" />
            </div>

            <div className="flex gap-4 px-5 py-4">
              {/* Thumbnail */}
              {mobilePreviewUnit.interiorImageUrl ? (
                <div className="relative w-24 h-24 rounded-xl overflow-hidden flex-shrink-0 bg-gray-100">
                  <Image
                    src={mobilePreviewUnit.interiorImageUrl}
                    alt="Interior"
                    fill sizes="96px"
                    className="object-cover"
                    placeholder="blur"
                    blurDataURL={shimmerDataUrl(96, 96)}
                  />
                </div>
              ) : (
                <div className="w-24 h-24 rounded-xl flex-shrink-0 bg-gray-100 flex items-center justify-center">
                  <svg className="w-8 h-8 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
                  </svg>
                </div>
              )}

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-0.5">
                  <h3 className="text-lg font-bold text-gray-900 truncate">{mobilePreviewUnit.name}</h3>
                  <span
                    className="text-xs font-semibold ml-2 flex-shrink-0"
                    style={{ color: getStatusColor(mobilePreviewUnit.status) }}
                  >
                    {getStatusLabel(mobilePreviewUnit.status).toUpperCase()}
                  </span>
                </div>
                <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">{mobilePreviewUnit.modelName}</p>
                <div className="flex gap-3 text-xs text-gray-600">
                  <span>🛏 {mobilePreviewUnit.bedrooms}</span>
                  <span>🚿 {mobilePreviewUnit.bathrooms}</span>
                  <span>📐 {mobilePreviewUnit.totalArea}m²</span>
                </div>
                {mobilePreviewUnit.price && (
                  <p className="text-sm font-bold text-gray-900 mt-1.5">
                    {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(mobilePreviewUnit.price)}
                  </p>
                )}
              </div>
            </div>

            <div className="px-5 pb-8 pt-1 flex gap-3">
              <button
                onClick={() => setMobilePreviewUnit(null)}
                className="flex-shrink-0 px-4 py-3 rounded-xl border border-gray-200 text-gray-500 text-sm font-medium hover:bg-gray-50 transition-colors"
              >
                Cerrar
              </button>
              <button
                onClick={() => handleOpenFullPanel(mobilePreviewUnit)}
                className="flex-1 px-4 py-3 rounded-xl bg-gray-900 text-white text-sm font-semibold hover:bg-gray-800 transition-colors"
              >
                Ver unidad completa →
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Unit dot marker ─────────────────────────────────────────────
function UnitDotMarker({
  dot, unit, isSelected, onSelect,
}: {
  dot: { x: number; y: number };
  unit: Unit;
  isSelected: boolean;
  onSelect: (unit: Unit) => void;
}) {
  const color = getStatusColor(unit.status);
  return (
    <motion.button
      variants={{
        hidden: { opacity: 0, scale: 0 },
        visible: { opacity: 1, scale: 1, transition: { type: 'spring', stiffness: 300, damping: 20 } }
      }}
      className="absolute group pointer-events-auto"
      style={{ left: `${dot.x}%`, top: `${dot.y}%`, transform: 'translate(-50%, -50%)' }}
      onClick={() => onSelect(unit)}
      aria-label={`Seleccionar ${unit.name}`}
    >
      <div
        className={`flex items-center gap-1 rounded-full px-2 py-1 text-white text-[11px] font-bold shadow-lg transition-all duration-200 border-2 border-white ${isSelected ? 'scale-125' : 'hover:scale-110'}`}
        style={{ backgroundColor: color }}
      >
        {unit.name}
      </div>
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
    service: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 21v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21m0 0h4.5V3.545M12.75 21h7.5V10.75M2.25 21h1.5m18 0h-18M2.25 9l4.5-1.636M18.75 3l-1.5.545m0 6.205l3 1m1.5.5l-1.5-.5M6.75 7.364V3h-3v18m3-13.636l10.5-3.819" /></svg>,
  };

  return (
    <motion.div
      variants={{
        hidden: { opacity: 0, x: -10 },
        visible: { opacity: 1, x: 0, transition: { duration: 0.3 } }
      }}
      className="flex items-center gap-2.5"
    >
      <span className="text-gray-400 flex-shrink-0">{icons[icon] || null}</span>
      <span className="text-sm text-gray-600">{label}</span>
    </motion.div>
  );
}

function ContactBtn({ title, children, onClick }: { title: string; children: React.ReactNode; onClick?: () => void }) {
  return (
    <button
      title={title}
      aria-label={title}
      onClick={onClick}
      className="w-9 h-9 rounded-full border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-50 hover:text-gray-700 transition-colors"
    >
      {children}
    </button>
  );
}
