'use client';

import { useState } from 'react';
import BimModelViewer from './BimModelViewer';
import BimGallery from './BimGallery';

interface Props {
  geometryUrl: string | null;
  coverImage: string | null;
  galleryImages: string[];
  title: string;
  /** Si se provee, el componente no muestra su propio toggle y usa este valor */
  controlledMode?: '3d' | 'gallery';
}

export default function BimUnifiedViewer({ 
  geometryUrl, 
  coverImage, 
  galleryImages, 
  title, 
  controlledMode 
}: Props) {
  const hasViewer = !!geometryUrl;
  const hasGallery = galleryImages.length > 0;
  
  // Estado interno (solo se usa si no hay controlledMode)
  const [internalTab, setInternalTab] = useState<'3d' | 'gallery'>(hasViewer ? '3d' : 'gallery');
  
  const activeTab = controlledMode ?? internalTab;

  if (!hasViewer && !hasGallery) return null;

  if (hasViewer && !hasGallery) {
    return <BimModelViewer src={geometryUrl} alt={title} poster={coverImage} />;
  }

  if (!hasViewer && hasGallery) {
    return <BimGallery images={galleryImages} title={title} />;
  }

  return (
    <div className="flex flex-col gap-6 w-full h-full">
      {/* Solo mostramos el toggle interno si NO está controlado externamente */}
      {!controlledMode && (
        <div className="flex justify-center absolute top-4 left-1/2 -translate-x-1/2 z-20">
          <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1 shadow-md border border-gray-200">
            <button
              onClick={() => setInternalTab('3d')}
              className={`px-4 sm:px-6 py-2 sm:py-2.5 text-[11px] sm:text-xs font-semibold rounded-lg transition-all duration-200 ${
                activeTab === '3d'
                  ? 'bg-white text-gray-900 shadow'
                  : 'text-gray-500 hover:text-gray-900'
              }`}
            >
              Modelo 3D
            </button>
            <button
              onClick={() => setInternalTab('gallery')}
              className={`px-4 sm:px-6 py-2 sm:py-2.5 text-[11px] sm:text-xs font-semibold rounded-lg transition-all duration-200 ${
                activeTab === 'gallery'
                  ? 'bg-white text-gray-900 shadow'
                  : 'text-gray-500 hover:text-gray-900'
              }`}
            >
              Imágenes
            </button>
          </div>
        </div>
      )}

      <div className="relative w-full h-full flex-1">
        {/* Usamos display:none en vez de desmontar para que el visor 3D 
            no pierda su estado (ni la descarga en memoria) al cambiar de tab */}
        <div className={activeTab === '3d' ? 'absolute inset-0 block' : 'hidden'}>
          <BimModelViewer src={geometryUrl!} alt={title} poster={coverImage} />
        </div>
        
        <div className={activeTab === 'gallery' ? 'absolute inset-0 block' : 'hidden'}>
          <BimGallery images={galleryImages} title={title} />
        </div>
      </div>
    </div>
  );
}
