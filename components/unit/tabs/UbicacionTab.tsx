'use client';

import { useState, useRef } from 'react';
import { m as motion } from 'framer-motion';
import type { PointOfInterest } from '@/types';
import { POI_CATEGORY_LABELS, PoiCategoryIcon } from '@/lib/poiCategories';

type TransportMode = 'drive' | 'walk' | 'bike';

const TRANSPORT_MODES: { id: TransportMode; label: string; icon: React.ReactNode }[] = [
  {
    id: 'drive',
    label: 'Auto',
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 00-10.026 0 1.106 1.106 0 00-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" />
      </svg>
    ),
  },
  {
    id: 'walk',
    label: 'Caminando',
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 11-6 0 3 3 0 016 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
      </svg>
    ),
  },
  {
    id: 'bike',
    label: 'Bicicleta',
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.75a3.75 3.75 0 100 7.5 3.75 3.75 0 000-7.5zM3.75 10.5a3.75 3.75 0 100 7.5 3.75 3.75 0 000-7.5zm16.5 0a3.75 3.75 0 100 7.5 3.75 3.75 0 000-7.5zM6.75 10.5l1.5-4.5h7.5l1.5 4.5" />
      </svg>
    ),
  },
];

function getPoiMinutes(poi: PointOfInterest, mode: TransportMode): number | undefined {
  if (mode === 'drive') return poi.driveMinutes;
  if (mode === 'walk') return poi.walkMinutes;
  return poi.bikeMinutes;
}

export default function UbicacionTab({
  projectLocation,
  projectLatitude,
  projectLongitude,
  pointsOfInterest,
}: {
  projectLocation: string;
  projectLatitude?: number;
  projectLongitude?: number;
  pointsOfInterest: PointOfInterest[];
}) {
  const [mode, setMode] = useState<TransportMode>('drive');
  const [selectedPoi, setSelectedPoi] = useState<PointOfInterest | null>(null);
  const [poiListOpen, setPoiListOpen] = useState(true);
  const poiMapRef = useRef<HTMLDivElement>(null);

  const hasCoords = projectLatitude != null && projectLongitude != null;

  let mapSrc = null;
  if (hasCoords) {
    if (selectedPoi && selectedPoi.latitude != null && selectedPoi.longitude != null) {
      // Directions embed
      const dirflg = mode === 'drive' ? 'd' : mode === 'walk' ? 'w' : 'b';
      mapSrc = `https://maps.google.com/maps?saddr=${projectLatitude},${projectLongitude}&daddr=${selectedPoi.latitude},${selectedPoi.longitude}&dirflg=${dirflg}&output=embed`;
    } else {
      // Regular view embed
      mapSrc = `https://maps.google.com/maps?q=${projectLatitude},${projectLongitude}&z=15&output=embed`;
    }
  }

  return (
    <motion.div
      key="ubicacion"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      className="absolute inset-0 pt-16 flex flex-col lg:flex-row bg-white overflow-y-auto lg:overflow-hidden no-scrollbar"
    >
      {/* ── Left Sidebar: POI List ── */}
      <div
        className={`flex-shrink-0 flex flex-col order-2 lg:order-1 bg-white border-r border-gray-100 z-10 relative overflow-hidden shadow-[4px_0_24px_rgba(0,0,0,0.02)] transition-all duration-300 ${
          poiListOpen ? 'w-full lg:w-[420px] lg:h-auto' : 'w-full lg:w-0 h-0 lg:h-auto border-none'
        }`}
      >
        <div className="p-6 border-b border-gray-100 bg-white shrink-0 relative z-20 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-2xl font-bold text-gray-900 mb-1 tracking-tight">Ubicación</h2>
            <p className="text-sm text-gray-500">{projectLocation || 'Puntos de interés cercanos'}</p>
          </div>
          <button
            onClick={() => setPoiListOpen(false)}
            aria-label="Ocultar lista de puntos de interés"
            title="Ocultar lista"
            className="flex w-9 h-9 rounded-full bg-gray-100 hover:bg-gray-200 items-center justify-center text-gray-500 transition-colors shrink-0"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
            </svg>
          </button>
        </div>

        <div className="lg:flex-1 lg:overflow-y-auto p-6 bg-gray-50/50">
          {pointsOfInterest.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">Todavía no hay puntos de interés cargados.</p>
          ) : (
            <div className="space-y-6">
              <div className="flex items-center bg-gray-200/50 rounded-xl p-1 w-full shadow-inner">
                {TRANSPORT_MODES.map((tm) => (
                  <button
                    key={tm.id}
                    onClick={() => setMode(tm.id)}
                    className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold transition-all duration-200 ${
                      mode === tm.id
                        ? 'bg-white text-gray-900 shadow-sm ring-1 ring-black/5 scale-[1.02]'
                        : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200/50'
                    }`}
                  >
                    {tm.icon}
                    <span>{tm.label}</span>
                  </button>
                ))}
              </div>

              <div className="space-y-2.5 pb-8">
                {pointsOfInterest.map((poi) => {
                  const minutes = getPoiMinutes(poi, mode);
                  const isSelected = selectedPoi?.id === poi.id;

                  return (
                    <div
                      key={poi.id}
                      onClick={() => {
                        setSelectedPoi(isSelected ? null : poi);
                        poiMapRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                      }}
                      className={`group flex items-center gap-3.5 p-3.5 rounded-2xl border transition-all cursor-pointer ${
                        isSelected
                          ? 'border-brand-500 bg-brand-50 shadow-md ring-1 ring-brand-500 scale-[1.01]'
                          : 'border-gray-200 bg-white hover:border-brand-300 hover:shadow-sm'
                      }`}
                    >
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition-colors shadow-sm ${
                        isSelected ? 'bg-brand-500 text-white' : 'bg-gray-100 text-gray-500 group-hover:bg-brand-100 group-hover:text-brand-600'
                      }`}>
                        <PoiCategoryIcon category={poi.category} className="w-5 h-5" />
                      </div>

                      <div className="min-w-0 flex-1">
                        <p className={`text-[15px] font-bold truncate transition-colors ${isSelected ? 'text-brand-900' : 'text-gray-900'}`}>{poi.name}</p>
                        <p className={`text-[13px] font-medium transition-colors ${isSelected ? 'text-brand-600/80' : 'text-gray-400'}`}>
                          {POI_CATEGORY_LABELS[poi.category]}
                          {poi.distanceLabel ? ` · ${poi.distanceLabel}` : ''}
                        </p>
                      </div>

                      {minutes != null ? (
                        <span className={`shrink-0 flex items-center gap-1 text-[13px] font-bold rounded-xl px-3 py-1.5 min-w-[56px] justify-center transition-colors shadow-sm ${
                          isSelected ? 'bg-brand-500 text-white' : 'text-gray-700 bg-gray-100 group-hover:bg-gray-200'
                        }`}>
                          {minutes} min
                        </span>
                      ) : (
                        <span className="shrink-0 text-xs text-gray-300 min-w-[56px] text-center">—</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Right Side: Map ── */}
      <div ref={poiMapRef} className="flex-none lg:flex-1 relative order-1 lg:order-2 bg-gray-100 z-0 h-[45vh] lg:h-auto">
        {!poiListOpen && (
          <button
            onClick={() => setPoiListOpen(true)}
            aria-label="Mostrar lista de puntos de interés"
            title="Mostrar lista"
            className="flex absolute top-4 left-4 z-30 items-center gap-2 pl-2.5 pr-4 py-2 rounded-full bg-white/95 hover:bg-white shadow-lg border border-gray-200 text-sm font-semibold text-gray-700 backdrop-blur-md transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 5l7 7-7 7M5 5l7 7-7 7" />
            </svg>
            Ubicación
          </button>
        )}
        {mapSrc ? (
          <iframe
            key={mapSrc}
            src={mapSrc}
            title="Mapa de ubicación"
            className="absolute inset-0 w-full h-full border-0"
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-gray-400 bg-gray-50">
            <div className="text-center">
              <svg className="w-8 h-8 mx-auto mb-2 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" /></svg>
              <p className="text-sm font-medium">Mapa no disponible</p>
            </div>
          </div>
        )}
        {/* Gradient shadow for depth */}
        <div className="absolute inset-y-0 left-0 w-4 bg-gradient-to-r from-black/[0.03] to-transparent pointer-events-none hidden lg:block" />
      </div>
    </motion.div>
  );
}
