'use client';

import { useState } from 'react';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';
import { useToast } from '@/components/ui/ToastProvider';

interface FloorLike { id: string; number: number; label: string }

// Duplica un piso a un rango de números de una sola vez (ej: del 4 al 9),
// en vez de tener que repetir la acción piso por piso — clave para torres
// con muchos pisos idénticos. El patrón de etiqueta usa "{n}" como
// placeholder del número de piso. Se usa tanto desde el detalle del
// edificio como embebido en el wizard de carga guiada.
export default function DuplicateFloorModal({ floor, onClose, onDone }: { floor: FloorLike; onClose: () => void; onDone: (result: { created: number; unitsCopied: number }) => void }) {
  const numStr = String(floor.number);
  const defaultTemplate = floor.label.includes(numStr) ? floor.label.replace(numStr, '{n}') : `${floor.label} {n}`;

  const [fromNumber, setFromNumber] = useState(String(floor.number + 1));
  const [toNumber, setToNumber] = useState(String(floor.number + 1));
  const [labelTemplate, setLabelTemplate] = useState(defaultTemplate);
  const [includeUnits, setIncludeUnits] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const toast = useToast();

  const from = Number(fromNumber);
  const to = Number(toNumber);
  const count = Number.isFinite(from) && Number.isFinite(to) && to >= from ? to - from + 1 : 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (count === 0) { setError('Rango inválido.'); return; }
    if (!labelTemplate.includes('{n}')) { setError('El patrón de etiqueta necesita "{n}" en algún lugar.'); return; }
    setWorking(true);

    let totalUnits = 0;
    let created = 0;
    for (let n = from; n <= to; n++) {
      const res = await fetch(`/api/admin/floors/${floor.id}/duplicate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ number: n, label: labelTemplate.replace('{n}', String(n)), includeUnits }),
      });
      if (res.ok) {
        const data = await res.json();
        totalUnits += data.unitsCopied ?? 0;
        created++;
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? `Error al duplicar al piso ${n}.`);
        break;
      }
    }

    setWorking(false);
    if (created > 0) {
      toast(`${created} piso${created === 1 ? '' : 's'} creado${created === 1 ? '' : 's'}${includeUnits ? ` con ${totalUnits} unidad${totalUnits === 1 ? '' : 'es'} en total` : ''}.`);
      onDone({ created, unitsCopied: totalUnits });
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-gray-100">
          <h3 className="text-lg font-semibold text-gray-900">Duplicar {floor.label}</h3>
          <p className="text-sm text-gray-500 mt-0.5">Crea uno o varios pisos nuevos con el mismo plano{includeUnits ? ' y las mismas unidades (código, polígono, ambientes, tour y pines re-numerados).' : '.'}</p>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Input label="Desde piso N°" type="number" value={fromNumber} onChange={e => setFromNumber(e.target.value)} />
            <Input label="Hasta piso N°" type="number" value={toNumber} onChange={e => setToNumber(e.target.value)} />
          </div>
          <Input
            label="Patrón de etiqueta"
            value={labelTemplate}
            onChange={e => setLabelTemplate(e.target.value)}
            placeholder="Planta {n}"
          />
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={includeUnits} onChange={e => setIncludeUnits(e.target.checked)} className="rounded border-gray-300 text-brand-600 focus:ring-brand-500" />
            Incluir unidades (código, polígono, ambientes, tour, pines)
          </label>
          {count > 0 && <p className="text-xs text-gray-400">Se van a crear {count} piso{count === 1 ? '' : 's'}.</p>}
          {error && <p className="text-sm text-red-500">{error}</p>}
          <div className="flex items-center gap-3 pt-2">
            <Button type="submit" disabled={working || count === 0}>
              {working ? 'Duplicando...' : `Duplicar${count > 1 ? ` (${count})` : ''}`}
            </Button>
            <Button type="button" variant="ghost" onClick={onClose} className="bg-transparent hover:bg-gray-100">Cancelar</Button>
          </div>
        </form>
      </div>
    </div>
  );
}
