'use client';

import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import Button from '@/components/ui/Button';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { useToast } from '@/components/ui/ToastProvider';
import { useActiveProjectId, withActiveProject } from '@/lib/active-project-context';
import BimModelList from '@/components/admin/BimModelList';
import BimModelEditor from '@/components/admin/BimModelEditor';
import type { BimModel, Floor, Unit } from '@/types';

// Editor de BIM autosuficiente — resuelve el proyecto por el id fijado al
// entrar (useActiveProjectId, ver lib/active-project-context.tsx), no
// releyendo la cookie compartida en el momento del pedido. Mismo patrón que
// AmenitiesEditor/LocationEditor. Se usa en dos lugares: el paso "Modelo
// BIM" del asistente guiado, y /admin/proyecto/bim para activarlo o seguir
// cargando después. Con cero piezas muestra la decisión explícita "¿querés
// mostrar un modelo BIM?" — con una o más, la lista + editor de siempre,
// sin volver a preguntar.
export default function BimEditor() {
  const activeProjectId = useActiveProjectId();
  const [models, setModels] = useState<BimModel[] | null>(null);
  const [floors, setFloors] = useState<Floor[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [skipped, setSkipped] = useState(false);
  const [creating, setCreating] = useState(false);
  const toast = useToast();

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch(withActiveProject('/api/admin/bim', activeProjectId)).then(res => (res.ok ? res.json() : { models: [] })),
      fetch(withActiveProject('/api/admin/floors', activeProjectId)).then(res => (res.ok ? res.json() : [])),
      fetch(withActiveProject('/api/admin/units', activeProjectId)).then(res => (res.ok ? res.json() : []))
    ])
      .then(([bimData, floorsData, unitsData]) => {
        if (cancelled) return;
        setModels(bimData.models as BimModel[]);
        setSelectedId((bimData.models as BimModel[])[0]?.id ?? null);
        setFloors((floorsData as Floor[]) ?? []);
        setUnits((unitsData as Unit[]) ?? []);
      })
      .catch(() => { if (!cancelled) setModels([]); });
    return () => { cancelled = true; };
  }, [activeProjectId]);

  const create = async () => {
    setCreating(true);
    const res = await fetch(withActiveProject('/api/admin/bim', activeProjectId), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'Pieza sin título' }),
    });
    setCreating(false);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast(data.error ?? 'No se pudo crear la pieza.', 'error');
      return;
    }
    const model = data.model as BimModel;
    setModels(prev => [model, ...(prev ?? [])]);
    setSelectedId(model.id);
  };

  if (models === null) {
    return <LoadingSpinner text="Cargando..." />;
  }

  if (models.length === 0 && !skipped) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200 p-6 text-center">
        <p className="text-base font-medium text-gray-900">¿Querés mostrar un modelo BIM de este proyecto?</p>
        <p className="text-sm text-gray-500 mt-1.5 max-w-md mx-auto">
          Título, descripción e imágenes por ahora — más adelante, un modelo 3D navegable.
        </p>
        <div className="flex items-center justify-center gap-4 mt-5">
          <Button type="button" onClick={create} disabled={creating}>
            <Plus className="w-4 h-4" /> {creating ? 'Creando...' : 'Agregar modelo BIM'}
          </Button>
          <button type="button" onClick={() => setSkipped(true)} className="text-sm text-gray-400 hover:text-gray-600">
            Saltear — no tengo uno
          </button>
        </div>
      </div>
    );
  }

  if (models.length === 0 && skipped) {
    return (
      <p className="text-sm text-gray-500 px-1 py-6">
        Sin problema — podés agregarlo cuando quieras desde Proyecto → Modelo BIM.
      </p>
    );
  }

  const selected = models.find(m => m.id === selectedId) ?? null;

  return (
    <div className="grid md:grid-cols-[minmax(0,320px)_minmax(0,1fr)] gap-6 items-start">
      <div className="flex flex-col gap-3">
        <Button type="button" onClick={create} disabled={creating} className="self-start">
          <Plus className="w-4 h-4" /> {creating ? 'Creando...' : 'Nueva pieza'}
        </Button>
        <BimModelList models={models} selectedId={selectedId} onSelect={setSelectedId} />
      </div>
      <div className="bg-white rounded-2xl border border-gray-200 p-5">
        {selected ? (
          <BimModelEditor
            key={selected.id}
            model={selected}
            floors={floors}
            units={units}
            onSaved={updated => setModels(prev => (prev ?? []).map(m => (m.id === updated.id ? updated : m)))}
            onDeleted={id => {
              setModels(prev => (prev ?? []).filter(m => m.id !== id));
              setSelectedId(prev => (prev === id ? null : prev));
            }}
          />
        ) : (
          <p className="text-sm text-gray-500">Elegí una pieza de la lista o creá una nueva.</p>
        )}
      </div>
    </div>
  );
}
