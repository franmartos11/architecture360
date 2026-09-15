'use client';

import { useState } from 'react';
import BimModelViewer from './BimModelViewer';
import BimGallery from './BimGallery';

interface Props {
  geometryUrl: string | null;
  coverImage: string | null;
  galleryImages: string[];
  title: string;
}

export default function BimUnifiedViewer({ geometryUrl, coverImage, galleryImages, title }: Props) {
  const hasViewer = !!geometryUrl;
  const hasGallery = galleryImages.length > 0;
  
  // Estado inicial: si hay 3D mostramos 3D, si no mostramos galería
  const [activeTab, setActiveTab] = useState<'3d' | 'gallery'>(hasViewer ? '3d' : 'gallery');

  if (!hasViewer && !hasGallery) return null;

  if (hasViewer && !hasGallery) {
    return <BimModelViewer src={geometryUrl} alt={title} poster={coverImage} />;
  }

  if (!hasViewer && hasGallery) {
    return <BimGallery images={galleryImages} title={title} />;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex justify-center">
        <div className="inline-flex items-center p-1 bg-gray-100 rounded-lg">
          <button
            onClick={() => setActiveTab('3d')}
            className={`px-6 py-2 text-sm font-medium rounded-md transition-colors ${
              activeTab === '3d'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-900'
            }`}
          >
            Modelo 3D
          </button>
          <button
            onClick={() => setActiveTab('gallery')}
            className={`px-6 py-2 text-sm font-medium rounded-md transition-colors ${
              activeTab === 'gallery'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-900'
            }`}
          >
            Imágenes
          </button>
        </div>
      </div>

      <div className="relative">
        {/* Usamos display:none en vez de desmontar para que el visor 3D 
            no pierda su estado (ni la descarga en memoria) al cambiar de tab */}
        <div className={activeTab === '3d' ? 'block' : 'hidden'}>
          <BimModelViewer src={geometryUrl!} alt={title} poster={coverImage} />
        </div>
        
        <div className={activeTab === 'gallery' ? 'block' : 'hidden'}>
          <BimGallery images={galleryImages} title={title} />
        </div>
      </div>
    </div>
  );
}
