'use client';

import { useState, useEffect } from 'react';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';
import { EditorSkeleton } from '@/components/admin/PanelSkeletons';
import { useThemeSectionEditor } from './theme-section-helper';
import type { PaymentPlanStep } from '@/types';

const SUGGESTED_PLAN: PaymentPlanStep[] = [
  { label: 'Reserva', value: 'USD 3.000', note: 'Para congelar unidad y precio' },
  { label: 'Boleto', value: '30%', note: 'A la firma del boleto de compraventa' },
  { label: 'Cuotas', value: '24 cuotas', note: 'Mensuales durante la obra' },
  { label: 'Posesión', value: 'Saldo', note: 'Contra entrega de llaves' },
];

export default function PaymentPlanEditor({ onSaved }: { onSaved: () => void }) {
  const { themeConfig, loading, saving, savePatch } = useThemeSectionEditor();
  const [items, setItems] = useState<PaymentPlanStep[]>([]);
  const [note, setNote] = useState('');

  useEffect(() => {
    if (themeConfig) {
      setItems(themeConfig.paymentPlanItems ?? []);
      setNote(themeConfig.paymentPlanNote ?? '');
    }
  }, [themeConfig]);

  if (loading) return <EditorSkeleton rows={4} />;

  const addItem = () => setItems(prev => [...prev, { label: '', value: '', note: '' }]);
  const updateItem = (idx: number, patch: Partial<PaymentPlanStep>) =>
    setItems(prev => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  const removeItem = (idx: number) => setItems(prev => prev.filter((_, i) => i !== idx));

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = items
      .map(it => ({
        label: it.label.trim(),
        value: it.value.trim(),
        ...(it.note?.trim() ? { note: it.note.trim() } : {}),
      }))
      .filter(it => it.label && it.value);
    const ok = await savePatch({
      paymentPlanItems: cleaned,
      paymentPlanNote: note.trim() || undefined,
    });
    if (ok) {
      setItems(cleaned);
      onSaved();
    }
  };

  return (
    <form onSubmit={handleSave} className="p-6 space-y-5">
      <div className="space-y-2">
        <p className="m-0 text-xs text-gray-500">
          Mostrá en 3 o 4 etapas simples cómo se paga la unidad.
        </p>
        {items.length === 0 && (
          <button
            type="button"
            onClick={() => setItems(SUGGESTED_PLAN)}
            className="px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-xs font-medium text-gray-700 hover:border-gray-300"
          >
            + Cargar esquema sugerido
          </button>
        )}
      </div>

      <div className="space-y-3">
        {items.map((item, idx) => (
          <div key={idx} className="p-3 rounded-xl border border-gray-200 bg-white space-y-2">
            <div className="flex items-center gap-2">
              <input
                value={item.label}
                onChange={e => updateItem(idx, { label: e.target.value })}
                placeholder="Etapa (ej: Boleto)"
                className="w-28 text-xs font-semibold px-2.5 py-1.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none"
              />
              <input
                value={item.value}
                onChange={e => updateItem(idx, { value: e.target.value })}
                placeholder="Valor (ej: 30%)"
                className="flex-1 text-xs font-semibold px-2.5 py-1.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none"
              />
              <button
                type="button"
                onClick={() => removeItem(idx)}
                className="text-xs text-red-700 hover:text-red-800 px-1.5"
              >
                Quitar
              </button>
            </div>
            <input
              value={item.note ?? ''}
              onChange={e => updateItem(idx, { note: e.target.value })}
              placeholder="Aclaración corta (opcional)"
              className="w-full text-xs px-2.5 py-1.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none"
            />
          </div>
        ))}
      </div>

      <Input
        label="Nota al pie (opcional)"
        value={note}
        onChange={e => setNote(e.target.value)}
        placeholder="Ej: Cuotas en USD o pesos ajustados por CAC. Consultá por descuentos de contado."
      />

      <div className="flex items-center justify-between gap-2 pt-2">
        <button
          type="button"
          onClick={addItem}
          className="text-xs font-medium text-gray-700 hover:text-gray-900 underline underline-offset-2"
        >
          + Agregar etapa
        </button>
        <Button type="submit" disabled={saving}>
          {saving ? 'Guardando...' : 'Guardar plan'}
        </Button>
      </div>
    </form>
  );
}
