'use client';

import { useState, useMemo } from 'react';
import Image from 'next/image';
import { Footprints, Bike, Car } from 'lucide-react';
import { TransitionLink as Link } from '@/components/ui/TransitionUtils';
import { shimmerDataUrl } from '@/lib/imagePlaceholder';
import type { Project, PointOfInterest, PoiCategory } from '@/types';
import { POI_CATEGORY_LABELS, PoiCategoryIcon } from '@/lib/poiCategories';

interface LocationViewProps {
  project: Project;
}

function directionsHref(poi: PointOfInterest, projectLocation: string) {
  const destination = poi.latitude != null && poi.longitude != null
    ? `${poi.latitude},${poi.longitude}`
    : `${poi.name}, ${projectLocation}`;
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`;
}

export default function LocationView({ project }: LocationViewProps) {
  const [categoryFilter, setCategoryFilter] = useState<PoiCategory | 'all'>('all');

  const categoriesPresent = useMemo(() => {
    const set = new Set(project.pointsOfInterest.map(p => p.category));
    return Array.from(set);
  }, [project.pointsOfInterest]);

  const filtered = useMemo(() => {
    if (categoryFilter === 'all') return project.pointsOfInterest;
    return project.pointsOfInterest.filter(p => p.category === categoryFilter);
  }, [project.pointsOfInterest, categoryFilter]);

  const hasCoords = project.latitude != null && project.longitude != null;
  const mapSrc = hasCoords
    ? `https://maps.google.com/maps?q=${project.latitude},${project.longitude}&z=15&output=embed`
    : null;

  return (
    <div className="min-h-screen bg-trevo-dark">
      <div className="pt-24 pb-20 px-4 sm:px-6 max-w-6xl mx-auto">
        <Link href={`/proyecto/${project.slug}`} className="text-sm text-white/50 hover:text-white transition-colors">
          ← {project.name}
        </Link>
        <h1 className="text-3xl sm:text-4xl font-light text-white mt-3 mb-1">Ubicación y Puntos de Interés</h1>
        <p className="text-white/50 mb-8">{project.location || 'Descubrí el entorno del proyecto.'}</p>

        {mapSrc && (
          <div className="relative w-full aspect-[16/9] sm:aspect-[21/9] rounded-2xl overflow-hidden border border-white/10 mb-10">
            <iframe
              src={mapSrc}
              title={`Mapa de ubicación de ${project.name}`}
              className="absolute inset-0 w-full h-full"
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
            />
          </div>
        )}

        {categoriesPresent.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-8">
            <FilterTab active={categoryFilter === 'all'} onClick={() => setCategoryFilter('all')}>
              Todas
            </FilterTab>
            {categoriesPresent.map(c => (
              <FilterTab key={c} active={categoryFilter === c} onClick={() => setCategoryFilter(c)}>
                {POI_CATEGORY_LABELS[c]}
              </FilterTab>
            ))}
          </div>
        )}

        {filtered.length === 0 ? (
          <div className="text-center py-20 text-white/40">
            {project.pointsOfInterest.length === 0 ? 'Todavía no hay puntos de interés cargados.' : 'No hay puntos de interés para este filtro.'}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {filtered.map(p => (
              <PoiCard key={p.id} poi={p} href={directionsHref(p, project.location)} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function FilterTab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
        active ? 'bg-white text-trevo-dark' : 'bg-white/10 text-white/70 hover:bg-white/20 hover:text-white'
      }`}
    >
      {children}
    </button>
  );
}

function PoiCard({ poi, href }: { poi: PointOfInterest; href: string }) {
  return (
    <div className="group relative rounded-2xl overflow-hidden bg-white/5 border border-white/10 hover:border-white/20 transition-colors">
      <div className="relative aspect-[4/3] bg-black/30">
        {poi.image ? (
          <Image
            src={poi.image}
            alt={poi.name}
            fill
            sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
            placeholder="blur"
            blurDataURL={shimmerDataUrl()}
            className="object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-white/20">
            <PoiCategoryIcon category={poi.category} className="w-10 h-10" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
        <span className="absolute top-3 right-3 flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-full bg-black/50 backdrop-blur text-white">
          {POI_CATEGORY_LABELS[poi.category]}
        </span>
        <div className="absolute bottom-0 left-0 right-0 p-4">
          <h3 className="text-white font-semibold">{poi.name}</h3>
          {poi.distanceLabel && <p className="text-xs text-white/60 mt-0.5">{poi.distanceLabel}</p>}
        </div>
      </div>
      <div className="p-4 space-y-3">
        {poi.description && <p className="text-sm text-white/60">{poi.description}</p>}
        <TravelTimes poi={poi} />
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-white hover:text-brand-400 transition-colors"
        >
          Cómo llegar
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 19.5l15-15m0 0H8.25m11.25 0v11.25" />
          </svg>
        </a>
      </div>
    </div>
  );
}

// Los minutos calculados ("Calcular tiempos automáticamente" en el admin)
// vivían solo ahí — nunca llegaban a mostrarse acá, en el visor público.
function TravelTimes({ poi }: { poi: PointOfInterest }) {
  const items: { Icon: typeof Footprints; minutes: number; label: string }[] = [
    ...(poi.walkMinutes != null ? [{ Icon: Footprints, minutes: poi.walkMinutes, label: 'caminando' }] : []),
    ...(poi.bikeMinutes != null ? [{ Icon: Bike, minutes: poi.bikeMinutes, label: 'en bici' }] : []),
    ...(poi.driveMinutes != null ? [{ Icon: Car, minutes: poi.driveMinutes, label: 'en auto' }] : []),
  ];
  if (items.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1">
      {items.map(({ Icon, minutes, label }) => (
        <span key={label} className="inline-flex items-center gap-1 text-xs text-white/50" title={`${minutes} min ${label}`}>
          <Icon className="w-3.5 h-3.5" />
          {minutes} min
        </span>
      ))}
    </div>
  );
}
