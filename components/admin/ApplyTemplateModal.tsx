'use client';

import { useState, useEffect } from 'react';
import Button from '@/components/ui/Button';
import Dialog from '@/components/ui/Dialog';
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
    <Dialog
      open
      onClose={onClose}
      title={`Aplicar piso tipo a ${targetFloor.label}`}
      description={`Copia las unidades de otro piso de este edificio a ${targetFloor.label} (código re-numerado, con polígono, ambientes, tour y pines incluidos).`}
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onClose} className="bg-transparent hover:bg-gray-100">Cancelar</Button>
          <Button type="submit" form="apply-template-form" disabled={working || !sourceFloorId}>
            {working ? 'Aplicando...' : 'Aplicar plantilla'}
          </Button>
        </>
      }
    >
      <form id="apply-template-form" onSubmit={handleSubmit} className="space-y-4">
        {siblingFloors.length === 0 ? (
          <p className="text-sm text-gray-400">Este edificio todavía no tiene otro piso para usar como referencia.</p>
        ) : (
          <select
            value={sourceFloorId}
            onChange={e => setSourceFloorId(e.target.value)}
            aria-label="Piso de referencia"
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-brand-500 outline-none"
          >
            <option value="">Elegir piso de referencia...</option>
            {siblingFloors.sort((a, b) => a.number - b.number).map(f => (
              <option key={f.id} value={f.id}>{f.label}</option>
            ))}
          </select>
        )}
        {error && <p className="text-sm text-red-500">{error}</p>}
      </form>
    </Dialog>
  );
}
