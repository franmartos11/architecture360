'use client';

import { useState, useEffect, use, useCallback, startTransition } from 'react';
import { TransitionLink as Link } from '@/components/ui/TransitionUtils';
import MultiImageUploader from '@/components/admin/MultiImageUploader';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import ErrorState from '@/components/ui/ErrorState';

export default function AdminUnitPhotosPage({ params }: { params: Promise<{ id: string; floorId: string; unitId: string }> }) {
  const { id: buildingId, floorId, unitId } = use(params);

  const [unitCode, setUnitCode] = useState('');
  const [galleryImages, setGalleryImages] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(() => {
    startTransition(() => {
      setLoading(true);
      setLoadError(false);
    });
    fetch(`/api/admin/units/${unitId}`)
      .then(res => res.json())
      .then(unit => {
        setUnitCode(unit.code ?? '');
        setGalleryImages(unit.gallery_images ?? []);
        setLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setLoadError(true);
        setLoading(false);
      });
  }, [unitId]);

  useEffect(load, [load]);

  const handleChange = useCallback((urls: string[]) => {
    setGalleryImages(urls);
    fetch(`/api/admin/units/${unitId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ galleryImages: urls }),
    }).catch(err => console.error(err));
  }, [unitId]);

  if (loading) return <LoadingSpinner text="Cargando fotos..." tone="light" />;
  if (loadError) return <ErrorState message="No se pudieron cargar las fotos." onRetry={load} />;

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/admin/edificios/${buildingId}/pisos/${floorId}`} className="text-sm text-gray-500 hover:text-gray-700">← {unitCode}</Link>
        <h2 className="text-2xl font-bold text-gray-900 tracking-tight mt-1">Galería de imágenes — Depto {unitCode}</h2>
        <p className="text-sm text-gray-500 mt-1">
          Estas fotos se muestran en la pestaña &quot;Galería&quot; de la página pública de la unidad, además de la foto principal.
        </p>
      </div>

      <MultiImageUploader values={galleryImages} onChange={handleChange} folder="units" />
    </div>
  );
}
