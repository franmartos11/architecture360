'use client';

import { useState, useEffect } from 'react';
import Button from '@/components/ui/Button';
import { useToast } from '@/components/ui/ToastProvider';

interface FloorLike { id: string; number: number; label: string }

// Aplica el "piso tipo" de otro piso del mismo edificio a un piso que YA
// existe (a diferencia de "Duplicar piso", que crea uno nuevo) — para
// cuando el piso destino se creó por separado (ej. desde el wizard, con
// su propio plano) y todavía no tiene unidades cargadas.
export default function ApplyTemplateModal({
  buildingId, targetFloor, onClose, onDone,
}: {
  buildingId: string;
  targetFloor: FloorLike;
  onClose: () => void;
  onDone: (result: { unitsCreated: number; skipped: number }) => void;
}) {
  const [siblingFloors, setSiblingFloors] = useState<FloorLike[]>([]);
  const [sourceFloorId, setSourceFloorId] = useState('');
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const toast = useToast();

  useEffect(() => {
    fetch(`/api/admin/buildings/${buildingId}`)
      .then(res => res.json())
      .then(data => setSiblingFloors((data.floors ?? []).filter((f: FloorLike) => f.id !== targetFloor.id)))
      .catch(() => {});
  }, [buildingId, targetFloor.id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sourceFloorId) return;
    setError('');
    setWorking(true);
    const res = await fetch(`/api/admin/floors/${targetFloor.id}/apply-template`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sourceFloorId }),
    });
    setWorking(false);
    if (res.ok) {
      const data = await res.json();
      toast(`${data.unitsCreated} unidad${data.unitsCreated === 1 ? '' : 'es'} creada${data.unitsCreated === 1 ? '' : 's'}${data.skipped > 0 ? ` — ${data.skipped} omitida${data.skipped === 1 ? '' : 's'} (código ya existía en este piso)` : ''}.`);
      onDone(data);
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? 'Error al aplicar la plantilla.');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-gray-100">
          <h3 className="text-lg font-semibold text-gray-900">Aplicar piso tipo a {targetFloor.label}</h3>
          <p className="text-sm text-gray-500 mt-0.5">Copia las unidades de otro piso de este edificio a {targetFloor.label} (código re-numerado, con polígono, ambientes, tour y pines incluidos).</p>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {siblingFloors.length === 0 ? (
            <p className="text-sm text-gray-400">Este edificio todavía no tiene otro piso para usar como referencia.</p>
          ) : (
            <select
              value={sourceFloorId}
              onChange={e => setSourceFloorId(e.target.value)}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-brand-500 outline-none"
            >
              <option value="">Elegir piso de referencia...</option>
              {siblingFloors.sort((a, b) => a.number - b.number).map(f => (
                <option key={f.id} value={f.id}>{f.label}</option>
              ))}
            </select>
          )}
          {error && <p className="text-sm text-red-500">{error}</p>}
          <div className="flex items-center gap-3 pt-2">
            <Button type="submit" disabled={working || !sourceFloorId}>
              {working ? 'Aplicando...' : 'Aplicar plantilla'}
            </Button>
            <Button type="button" variant="ghost" onClick={onClose} className="bg-transparent hover:bg-gray-100">Cancelar</Button>
          </div>
        </form>
      </div>
    </div>
  );
}
