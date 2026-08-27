'use client';

import { useState, useMemo } from 'react';
import Image from 'next/image';
import { TransitionLink as Link } from '@/components/ui/TransitionUtils';
import { useProjectBasePath } from '@/lib/project-base-path-context';
import { shimmerDataUrl } from '@/lib/imagePlaceholder';
import AmenityDetailModal from './AmenityDetailModal';
import EyeIcon from '@/components/ui/icons/EyeIcon';
import type { Project, Amenity } from '@/types';

interface AmenitiesViewProps {
  project: Project;
  /** Preselecciona el filtro por torre, ej. al llegar desde la unidad de un edificio específico */
  initialBuildingFilter?: string;
}

export default function AmenitiesView({ project, initialBuildingFilter }: AmenitiesViewProps) {
  const basePath = useProjectBasePath();
  const [buildingFilter, setBuildingFilter] = useState<string>(
    initialBuildingFilter && project.buildings.some(b => b.id === initialBuildingFilter)
      ? initialBuildingFilter
      : 'all'
  );
  const [activeAmenity, setActiveAmenity] = useState<Amenity | null>(null);

  const filtered = useMemo(() => {
    if (buildingFilter === 'all') return project.amenities;
    if (buildingFilter === 'complex') return project.amenities.filter(a => !a.buildingId);
    return project.amenities.filter(a => a.buildingId === buildingFilter);
  }, [project.amenities, buildingFilter]);

  return (
    <div className="min-h-screen bg-trevo-dark">
      <div className="pt-24 pb-20 px-4 sm:px-6 max-w-6xl mx-auto">
        <Link href={basePath || '/'} className="text-sm text-white/50 hover:text-white transition-colors">
          ← {project.name}
        </Link>
        <h1 className="text-3xl sm:text-4xl font-light text-white mt-3 mb-1">Amenities</h1>
        <p className="text-white/50 mb-8">Conocé y recorré en 360° los espacios del proyecto.</p>

        {project.buildings.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-8">
            <FilterTab active={buildingFilter === 'all'} onClick={() => setBuildingFilter('all')}>
              Todas
            </FilterTab>
            <FilterTab active={buildingFilter === 'complex'} onClick={() => setBuildingFilter('complex')}>
              Todo el complejo
            </FilterTab>
            {project.buildings.map(b => (
              <FilterTab key={b.id} active={buildingFilter === b.id} onClick={() => setBuildingFilter(b.id)}>
                {b.name}
              </FilterTab>
            ))}
          </div>
        )}

        {filtered.length === 0 ? (
          <div className="text-center py-20 text-white/40">
            {project.amenities.length === 0 ? 'Todavía no hay amenities cargadas.' : 'No hay amenities para este filtro.'}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {filtered.map(a => (
              <AmenityCard
                key={a.id}
                amenity={a}
                buildingName={project.buildings.find(b => b.id === a.buildingId)?.name}
                onClick={() => setActiveAmenity(a)}
              />
            ))}
          </div>
        )}
      </div>

      <AmenityDetailModal
        amenity={activeAmenity}
        building={project.buildings.find(b => b.id === activeAmenity?.buildingId)}
        onClose={() => setActiveAmenity(null)}
      />
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

function AmenityCard({
  amenity,
  buildingName,
  onClick,
}: {
  amenity: Amenity;
  buildingName?: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="group relative rounded-2xl overflow-hidden bg-white/5 border border-white/10 hover:border-white/20 transition-colors text-left"
    >
      <div className="relative aspect-[4/3] bg-black/30">
        {amenity.images[0] ? (
          <Image
            src={amenity.images[0]}
            alt={amenity.name}
            fill
            sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
            placeholder="blur"
            blurDataURL={shimmerDataUrl()}
            className="object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-white/20 text-xs">Sin foto</div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
        {amenity.tourNodeId && (
          <span className="absolute top-3 right-3 flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-full bg-black/50 backdrop-blur text-white">
            <EyeIcon className="w-3 h-3" strokeWidth={2} />
            360°
          </span>
        )}
        <div className="absolute bottom-0 left-0 right-0 p-4">
          <h3 className="text-white font-semibold">{amenity.name}</h3>
          <p className="text-xs text-white/60 mt-0.5">{buildingName ?? 'Todo el complejo'}</p>
        </div>
      </div>
    </button>
  );
}
