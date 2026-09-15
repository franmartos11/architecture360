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
          <div className="inline-flex items-center p-1 bg-gray-900/40 backdrop-blur-md rounded-lg shadow-lg border border-white/10">
            <button
              onClick={() => setInternalTab('3d')}
              className={`px-6 py-2 text-sm font-medium rounded-md transition-colors ${
                activeTab === '3d'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-white hover:text-gray-200'
              }`}
            >
              Modelo 3D
            </button>
            <button
              onClick={() => setInternalTab('gallery')}
              className={`px-6 py-2 text-sm font-medium rounded-md transition-colors ${
                activeTab === 'gallery'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-white hover:text-gray-200'
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
