'use client';

import { m as motion, AnimatePresence } from 'framer-motion';
import { POI_CATEGORY_LABELS, PoiCategoryIcon } from '@/lib/poiCategories';
import type { PointOfInterest } from '@/types';

interface LocationModalProps {
  isOpen: boolean;
  onClose: () => void;
  location: string;
  latitude?: number;
  longitude?: number;
  pointsOfInterest: PointOfInterest[];
}

function directionsHref(poi: PointOfInterest, projectLocation: string) {
  const destination = poi.latitude != null && poi.longitude != null
    ? `${poi.latitude},${poi.longitude}`
    : `${poi.name}, ${projectLocation}`;
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`;
}

export default function LocationModal({ isOpen, onClose, location, latitude, longitude, pointsOfInterest }: LocationModalProps) {
  const hasCoords = latitude != null && longitude != null;
  const mapSrc = hasCoords ? `https://maps.google.com/maps?q=${latitude},${longitude}&z=15&output=embed` : null;

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-gray-900/40 backdrop-blur-sm"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]"
          >
            <div className="flex items-center justify-between p-5 border-b border-gray-100 bg-gray-50/50 shrink-0">
              <div>
                <h3 className="text-lg font-bold text-gray-900">Ubicación</h3>
                <p className="text-xs text-gray-500">{location || 'Puntos de interés cercanos'}</p>
              </div>
              <button
                onClick={onClose}
                aria-label="Cerrar"
                className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500 transition-colors shrink-0"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="overflow-y-auto p-5 space-y-4">
              {mapSrc && (
                <div className="relative w-full aspect-video rounded-xl overflow-hidden border border-gray-200">
                  <iframe
                    src={mapSrc}
                    title="Mapa de ubicación"
                    className="absolute inset-0 w-full h-full"
                    loading="lazy"
                    referrerPolicy="no-referrer-when-downgrade"
                  />
                </div>
              )}

              {pointsOfInterest.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-6">Todavía no hay puntos de interés cargados.</p>
              ) : (
                <div className="space-y-2">
                  {pointsOfInterest.map(poi => (
                    <div
                      key={poi.id}
                      className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 hover:border-gray-200 transition-colors"
                    >
                      <div className="w-9 h-9 rounded-full bg-gray-100 text-gray-500 flex items-center justify-center shrink-0">
                        <PoiCategoryIcon category={poi.category} className="w-4.5 h-4.5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-gray-900 truncate">{poi.name}</p>
                        <p className="text-xs text-gray-400">
                          {POI_CATEGORY_LABELS[poi.category]}{poi.distanceLabel ? ` · ${poi.distanceLabel}` : ''}
                        </p>
                      </div>
                      <a
                        href={directionsHref(poi, location)}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`Cómo llegar a ${poi.name}`}
                        className="w-8 h-8 rounded-full bg-gray-50 hover:bg-gray-100 flex items-center justify-center text-gray-500 transition-colors shrink-0"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 19.5l15-15m0 0H8.25m11.25 0v11.25" />
                        </svg>
                      </a>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
