'use client';

import { useState, useRef, useEffect } from 'react';
import { useTransitionRouter } from '@/components/ui/TransitionUtils';
import Breadcrumbs from '@/components/ui/Breadcrumbs';
import Image from 'next/image';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
import dynamic from 'next/dynamic';
import { m as motion, AnimatePresence } from 'framer-motion';
import type { Unit, UnitViewTab } from '@/types';
import { getStatusColor, getStatusLabel } from '@/data/mockData';

const VirtualTour = dynamic(() => import('@/components/tour/VirtualTour'), { ssr: false });
import LeadCaptureModal from '@/components/ui/LeadCaptureModal';

interface UnitViewerProps {
  unit: Unit;
  projectSlug: string;
  buildingId: string;
  floorNumber: number;
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
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
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

export default function UnitViewer({ unit, projectSlug, buildingId, floorNumber }: UnitViewerProps) {
  const router = useTransitionRouter();
  const [activeTab, setActiveTab] = useState<UnitViewTab>('planta3d');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [galleryIndex, setGalleryIndex] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const thumbsRef = useRef<HTMLDivElement>(null);
  
  const [isContactModalOpen, setIsContactModalOpen] = useState(false);
  const [contactMethod, setContactMethod] = useState<'email' | 'whatsapp' | 'phone'>('email');

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

  const openContact = (method: 'email' | 'whatsapp' | 'phone' = 'email') => {
    setContactMethod(method);
    setIsContactModalOpen(true);
  };

  const handleShare = async () => {
    const url = window.location.href;
    const title = `Unidad ${unit.name} - ${projectSlug}`;
    if (navigator.share) {
      try {
        await navigator.share({
          title,
          text: `Mirá esta unidad: ${unit.name} (${unit.modelName})`,
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

  const scrollThumbs = (dir: 'left' | 'right') => {
    thumbsRef.current?.scrollBy({ left: dir === 'right' ? 220 : -220, behavior: 'smooth' });
  };

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
        className={`fixed inset-y-0 left-0 z-40 md:relative flex-shrink-0 bg-white border-gray-100 flex flex-col overflow-y-auto transition-all duration-300 shadow-2xl md:shadow-sm ${sidebarCollapsed ? '-translate-x-full md:w-0 md:overflow-hidden md:border-none md:opacity-0' : 'translate-x-0 w-full sm:w-80 md:w-72 border-r md:opacity-100'}`}
      >
        {/* Interior photo */}
        <div className="relative h-44 sm:h-56 md:h-44 bg-gray-100 flex-shrink-0">
          {/* Close button for mobile */}
          <button
            onClick={() => setSidebarCollapsed(true)}
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
              className="object-cover" 
            />
          )}
          <button 
            onClick={handleShare}
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
            <span className="text-xs font-semibold flex items-center gap-1" style={{ color: statusColor }}>
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: statusColor }} />
              {statusLabel.toUpperCase()}
            </span>
          </div>
          <p className="text-sm text-gray-400 uppercase tracking-wide mb-4">{unit.modelName}</p>

          {/* Price */}
          <button 
            onClick={() => openContact()}
            className="w-full py-2 rounded-lg border border-gray-200 text-sm text-gray-700 font-medium hover:bg-gray-50 transition-colors mb-4"
          >
            Consultar precio
          </button>

          {/* View tabs (Galería / Planta 3D / Planos) */}
          <div className="flex items-center justify-around border border-gray-100 rounded-xl p-1 mb-5 bg-gray-50">
            {TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 flex flex-col items-center gap-1 py-2 rounded-lg text-xs font-medium transition-all duration-150 ${
                  activeTab === tab.id
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-400 hover:text-gray-600'
                }`}
              >
                {tab.icon}
                {tab.label}
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
            <SpecRow label={`${unit.bedrooms} Dormitorio${unit.bedrooms !== 1 ? 's' : ''}`} />
            <SpecRow label={`${unit.bathrooms} Baños`} />
            {unit.hasServiceRoom && <SpecRow label="Cuarto de Servicio" />}
          </motion.div>

          {/* Contact */}
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
                  onClick={() => openContact(item.type)}
                  className="w-9 h-9 rounded-full border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-50 hover:text-gray-700 transition-colors"
                >
                  {item.icon}
                </button>
              ))}
            </div>
          </div>
        </div>
      </aside>

      {/* ── Main viewer ───────────────────────────────────── */}
      <div className="flex-1 relative overflow-hidden">
        {/* Top bar */}
        <div className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-4 pt-4 pointer-events-none">
          <div className="flex items-center gap-2 pointer-events-auto">
            <Breadcrumbs />
          </div>

          {/* Floor badge + Cambiar planta */}
          <div className="flex items-center gap-2 pointer-events-auto">
            <span className="text-sm font-medium text-gray-700 bg-white shadow rounded-lg px-3 py-1.5">
              Planta {floorNumber}
            </span>
            <button
              onClick={() => router.push(`/proyecto/${projectSlug}/edificio/${buildingId}`)}
              className="px-4 py-1.5 rounded-lg bg-white shadow text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Cambiar planta
            </button>
          </div>
        </div>        {/* Right tab selector */}
        <div className="absolute right-4 top-20 z-20 flex flex-col gap-2">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              title={tab.label}
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

        {/* Viewer area */}
        <div className="absolute inset-0 overflow-hidden">
          <AnimatePresence mode="wait">
            {activeTab === 'planta3d' && (
              <motion.div
                key="planta3d"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.3 }}
                className="absolute inset-0 pt-16 flex items-center justify-center p-2 sm:p-4"
              >
                <div className="relative w-full h-full">
                  {unit.floorPlan3dUrl && (
                    <TransformWrapper
                      initialScale={1}
                      minScale={0.5}
                      maxScale={4}
                      centerOnInit={true}
                      wheel={{ step: 0.1 }}
                    >
                      <TransformComponent 
                        wrapperStyle={{ width: '100%', height: '100%' }}
                      >
                        <Image
                          src={unit.floorPlan3dUrl}
                          alt="Planta 3D"
                          width={1200}
                          height={1200}
                          priority
                          className="max-w-full max-h-[85vh] object-contain"
                          draggable={false}
                        />
                      </TransformComponent>
                    </TransformWrapper>
                  )}
                </div>
              </motion.div>
            )}

            {activeTab === 'tour360' && unit.tourImageUrl && (
              <motion.div
                key="tour360"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.3 }}
                className={isFullscreen ? "fixed inset-0 z-[100] bg-black animate-in zoom-in duration-300" : "absolute inset-0 pt-16"}
              >
                <div className="relative w-full h-full overflow-hidden shadow-inner">
                  <VirtualTour imageUrl={unit.tourImageUrl} />
                  {isFullscreen ? (
                    <button
                      onClick={() => setIsFullscreen(false)}
                      className="absolute top-6 left-6 w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 border border-white/20 flex items-center justify-center text-white backdrop-blur z-[110] transition-colors shadow-2xl"
                      title="Salir de pantalla completa"
                    >
                      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  ) : (
                    <button
                      onClick={() => setIsFullscreen(true)}
                      className="absolute top-6 left-6 w-12 h-12 rounded-full bg-gray-900/80 hover:bg-gray-900 border border-white/10 flex items-center justify-center text-white backdrop-blur z-[110] transition-colors shadow-lg"
                      title="Pantalla completa"
                    >
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
                      </svg>
                    </button>
                  )}
                </div>
              </motion.div>
            )}

            {activeTab === 'plano' && (
              <motion.div
                key="plano"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.3 }}
                className="absolute inset-0 pt-16 flex items-center justify-center p-2 sm:p-4"
              >
                <div className="relative w-full h-full">
                  {unit.floorPlan3dUrl && (
                    <TransformWrapper
                      initialScale={1}
                      minScale={0.5}
                      maxScale={4}
                      centerOnInit={true}
                      wheel={{ step: 0.1 }}
                    >
                      <TransformComponent 
                        wrapperStyle={{ width: '100%', height: '100%' }}
                      >
                        <Image
                          src={unit.floorPlan3dUrl}
                          alt="Plano técnico"
                          width={1200}
                          height={1200}
                          className="max-w-full max-h-[85vh] object-contain"
                          style={{ filter: 'grayscale(100%)' }}
                          draggable={false}
                        />
                      </TransformComponent>
                    </TransformWrapper>
                  )}
                </div>
              </motion.div>
            )}

            {activeTab === 'galeria' && unit.galleryImages && unit.galleryImages.length > 0 && (
              <motion.div
                key="galeria"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3 }}
                className="absolute inset-0 flex flex-col"
              >
                {/* ── Main image (fills all space) ── */}
                <div
                  className="relative flex-1 overflow-hidden cursor-zoom-in"
                  onClick={() => { setLightboxIndex(galleryIndex); setLightboxOpen(true); }}
                >
                  <AnimatePresence mode="wait">
                    <motion.img
                      key={galleryIndex}
                      src={unit.galleryImages[galleryIndex]}
                      alt={`Imagen ${galleryIndex + 1}`}
                      initial={{ opacity: 0, scale: 1.03 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.98 }}
                      transition={{ duration: 0.4 }}
                      className="absolute inset-0 w-full h-full object-cover"
                    />
                  </AnimatePresence>

                  {/* Gradient overlay */}
                  <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-black/50 pointer-events-none" />

                  {/* Expand hint */}
                  <div className="absolute top-4 right-4 bg-black/40 backdrop-blur-md rounded-full w-9 h-9 flex items-center justify-center border border-white/20">
                    <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
                    </svg>
                  </div>

                  {/* Prev arrow */}
                  {galleryIndex > 0 && (
                    <button
                      onClick={e => { e.stopPropagation(); setGalleryIndex(i => i - 1); }}
                      className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/40 hover:bg-black/60 backdrop-blur-md border border-white/20 flex items-center justify-center text-white transition-all hover:scale-110"
                    >
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
                      </svg>
                    </button>
                  )}

                  {/* Next arrow */}
                  {galleryIndex < unit.galleryImages.length - 1 && (
                    <button
                      onClick={e => { e.stopPropagation(); setGalleryIndex(i => i + 1); }}
                      className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/40 hover:bg-black/60 backdrop-blur-md border border-white/20 flex items-center justify-center text-white transition-all hover:scale-110"
                    >
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                      </svg>
                    </button>
                  )}
                </div>

                {/* ── Thumbnails carousel ── */}
                <div className="relative flex-shrink-0 bg-white/95 backdrop-blur-md border-t border-gray-200">

                  {/* Left scroll button */}
                  <button
                    onClick={() => scrollThumbs('left')}
                    className="absolute left-0 top-0 bottom-0 z-10 px-3 flex items-center justify-center bg-gradient-to-r from-white via-white/90 to-transparent hover:from-gray-50 transition-colors"
                    aria-label="Desplazar izquierda"
                  >
                    <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
                    </svg>
                  </button>

                  {/* Scrollable strip */}
                  <div
                    ref={thumbsRef}
                    className="flex items-center gap-2 px-10 py-3 overflow-x-auto scroll-smooth"
                    style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
                  >
                    {unit.galleryImages.map((img, i) => (
                      <button
                        key={i}
                        onClick={() => setGalleryIndex(i)}
                        className={`relative flex-shrink-0 rounded-lg overflow-hidden transition-all duration-200 ${
                          i === galleryIndex
                            ? 'ring-2 ring-gray-900 w-24 h-16 opacity-100 shadow-md'
                            : 'w-20 h-14 opacity-55 hover:opacity-90 hover:scale-105'
                        }`}
                      >
                        <Image src={img} alt={`Thumbnail ${i + 1}`} fill sizes="100px" className="object-cover" />
                      </button>
                    ))}
                  </div>

                  {/* Right scroll button */}
                  <button
                    onClick={() => scrollThumbs('right')}
                    className="absolute right-0 top-0 bottom-0 z-10 px-3 flex items-center justify-center bg-gradient-to-l from-white via-white/90 to-transparent hover:from-gray-50 transition-colors"
                    aria-label="Desplazar derecha"
                  >
                    <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                    </svg>
                  </button>

                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Bottom-right: "Ubicación en planta" mini map — hidden in gallery mode */}
        {activeTab !== 'galeria' && (
          <button
            onClick={() => router.push(`/proyecto/${projectSlug}/edificio/${buildingId}?piso=${floorNumber}`)}
            className="absolute bottom-5 right-16 z-20 bg-white rounded-xl shadow-lg overflow-hidden hover:shadow-xl transition-shadow"
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

      {/* ── Lightbox ──────────────────────────────────────── */}
      <AnimatePresence>
        {lightboxOpen && unit.galleryImages && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="fixed inset-0 z-[200] bg-black/95 flex items-center justify-center"
            onClick={() => setLightboxOpen(false)}
          >
            {/* Image */}
            <motion.img
              key={lightboxIndex}
              src={unit.galleryImages[lightboxIndex]}
              alt={`Imagen ${lightboxIndex + 1}`}
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.92 }}
              transition={{ duration: 0.3 }}
              className="max-w-[90vw] max-h-[85vh] object-contain rounded-2xl shadow-2xl"
              onClick={e => e.stopPropagation()}
            />

            {/* Close */}
            <button
              onClick={() => setLightboxOpen(false)}
              className="absolute top-6 right-6 w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 border border-white/20 flex items-center justify-center text-white transition-colors backdrop-blur"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            {/* Prev */}
            {lightboxIndex > 0 && (
              <button
                onClick={e => { e.stopPropagation(); setLightboxIndex(i => i - 1); }}
                className="absolute left-6 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 border border-white/20 flex items-center justify-center text-white transition-colors backdrop-blur"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
                </svg>
              </button>
            )}

            {/* Next */}
            {lightboxIndex < unit.galleryImages.length - 1 && (
              <button
                onClick={e => { e.stopPropagation(); setLightboxIndex(i => i + 1); }}
                className="absolute right-6 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 border border-white/20 flex items-center justify-center text-white transition-colors backdrop-blur"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                </svg>
              </button>
            )}

            {/* Counter */}
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-white/10 backdrop-blur rounded-full px-4 py-1.5 text-white/80 text-sm font-medium border border-white/20">
              {lightboxIndex + 1} / {unit.galleryImages.length}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <LeadCaptureModal 
        isOpen={isContactModalOpen}
        onClose={() => setIsContactModalOpen(false)}
        unit={unit}
        defaultMethod={contactMethod}
      />
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
