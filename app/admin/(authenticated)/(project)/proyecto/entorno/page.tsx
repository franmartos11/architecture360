'use client';

import { useState } from 'react';
import LocationPicker from '@/components/admin/LocationPicker';
import LocationEditor from '@/components/admin/section-editors/LocationEditor';
import AmenitiesEditor from '@/components/admin/section-editors/AmenitiesEditor';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import ErrorState from '@/components/ui/ErrorState';
import { SectionRow, Pill } from '@/components/admin/panel-ui';
import { ChapterHeader, ChapterFooter } from '@/components/admin/section-editors/FichaChrome';
import { useFichaProject, UnsavedBar, FichaLayout } from '@/components/admin/section-editors/ficha-data';

// Capítulo 4 — Entorno (diseño Ficha · Entorno): dónde está y qué tiene,
// en una sola pantalla porque el comprador las lee juntas. Arriba el pin
// del proyecto; después el mapa con "Cerca de todo" al lado; abajo las
// amenidades como grilla. /admin/proyecto/ubicacion y /amenities redirigen acá.

export default function EntornoPage() {
  const ficha = useFichaProject();
  const { project, setProject, savedProject } = ficha;
  const [pinOpen, setPinOpen] = useState(false);

  if (ficha.loading) return <LoadingSpinner text="Cargando entorno..." tone="light" />;
  if (ficha.loadError || !project) return <ErrorState message="No se pudo cargar el proyecto." onRetry={ficha.reload} />;

  const hasPin = project.latitude != null && project.longitude != null;
  // El mapa de lugares cercanos lee el centro guardado al montarse: se
  // remonta cuando cambia lo guardado para que tome el pin nuevo.
  const centerKey = `${savedProject?.latitude ?? ''},${savedProject?.longitude ?? ''}`;

  return (
    <FichaLayout>
      <ChapterHeader
        title="Entorno"
        description="Dónde está y qué tiene. Ubicación y amenidades en una sola pantalla, porque el comprador las lee juntas."
        actions={hasPin ? <Pill tone="green">✓ Ubicación cargada</Pill> : <Pill tone="warn">Falta ubicar el proyecto</Pill>}
      />

      <SectionRow title="Ubicación del proyecto" description="El pin del proyecto y el centro del mapa del sitio. Los tiempos a cada lugar se calculan desde acá." first>
        {/* Con el pin ya puesto el picker queda plegado: el mapa grande de abajo es el de los lugares cercanos. */}
        {hasPin && !pinOpen ? (
          <div className="flex items-center gap-3 flex-wrap min-h-[52px] px-4 rounded-xl border border-gray-200 bg-white">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" className="text-gray-900 shrink-0"><path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11Z" /><circle cx="12" cy="10" r="2.5" /></svg>
            <span className="flex-1 min-w-0 text-sm text-gray-900 truncate">
              {project.location || 'Pin ubicado'} <span className="text-xs text-gray-500 font-mono">{Number(project.latitude).toFixed(4)}, {Number(project.longitude).toFixed(4)}</span>
            </span>
            <button type="button" onClick={() => setPinOpen(true)} className="min-h-[40px] px-3.5 rounded-[10px] border border-gray-300 bg-white text-[13px] font-semibold text-gray-900 hover:border-gray-400">Ajustar pin</button>
          </div>
        ) : (
          <LocationPicker
            label="Dirección o lugar"
            latitude={project.latitude}
            longitude={project.longitude}
            onChange={(lat, lng) => setProject({ ...project, latitude: lat, longitude: lng })}
          />
        )}
      </SectionRow>

      <section className="flex flex-col gap-3.5 pt-7 border-t border-gray-200">
        <div className="flex flex-col gap-1">
          <h2 className="m-0 text-[15px] font-semibold text-gray-900">Cerca de todo</h2>
          <p className="m-0 text-[13px] text-gray-600">Colegios, salud, comercios, transporte. Tiempos calculados desde el pin del proyecto.</p>
        </div>
        <LocationEditor key={centerKey} />
      </section>

      <section className="flex flex-col gap-3.5 pt-7 border-t border-gray-200">
        <AmenitiesEditor />
      </section>

      <ChapterFooter />
      <UnsavedBar dirty={ficha.dirty} saving={ficha.saving} onSave={() => ficha.save()} onDiscard={ficha.discard} />
    </FichaLayout>
  );
}
