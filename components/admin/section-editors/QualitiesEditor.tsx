'use client';

import { useState } from 'react';
import Button from '@/components/ui/Button';
import { EditorSkeleton } from '@/components/admin/PanelSkeletons';
import { useThemeSectionEditor } from './theme-section-helper';
import type { QualityItem } from '@/types';

const SUGGESTED_CATEGORIES = ['Aberturas', 'Climatización', 'Cocina', 'Pisos', 'Seguridad', 'Ascensores'];

export default function QualitiesEditor({ onSaved }: { onSaved: () => void }) {
  const { themeConfig, loading, saving, savePatch } = useThemeSectionEditor();
  const [items, setItems] = useState<QualityItem[]>([]);

  // La configuración llega después del primer render: se copia al estado al cambiar
  // (ajuste en el render, no en un efecto: evita un render extra en cascada).
  const [fuente, setFuente] = useState<typeof themeConfig | undefined>(undefined);
  if (themeConfig !== fuente) {
    setFuente(themeConfig);
    if (themeConfig) setItems(themeConfig.qualitiesItems ?? []);
  }

  if (loading) return <EditorSkeleton rows={4} />;

  const addItem = (category = '') => setItems(prev => [...prev, { category, detail: '' }]);
  const updateItem = (idx: number, patch: Partial<QualityItem>) =>
    setItems(prev => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  const removeItem = (idx: number) => setItems(prev => prev.filter((_, i) => i !== idx));

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = items
      .map(it => ({ category: it.category.trim(), detail: it.detail.trim() }))
      .filter(it => it.category && it.detail);
    const ok = await savePatch({ qualitiesItems: cleaned });
    if (ok) {
      setItems(cleaned);
      onSaved();
    }
  };

  return (
    <form onSubmit={handleSave} className="p-6 space-y-5">
      <div className="space-y-2">
        <p className="m-0 text-xs text-gray-500">
          Especificaciones constructivas y terminaciones clave (aparecen en tarjetas limpias en la web).
        </p>
        <div className="flex flex-wrap gap-1.5">
          {SUGGESTED_CATEGORIES.filter(c => !items.some(i => i.category.toLowerCase() === c.toLowerCase())).map(cat => (
            <button
              key={cat}
              type="button"
              onClick={() => addItem(cat)}
              className="px-2.5 py-1 rounded-full text-[11px] font-medium border border-gray-200 bg-white text-gray-700 hover:border-gray-300"
            >
              + {cat}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        {items.map((item, idx) => (
          <div key={idx} className="p-3 rounded-xl border border-gray-200 bg-white space-y-2">
            <div className="flex items-center gap-2">
              <input
                value={item.category}
                onChange={e => updateItem(idx, { category: e.target.value })}
                placeholder="Rubro (ej: Aberturas)"
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
            <textarea
              value={item.detail}
              onChange={e => updateItem(idx, { detail: e.target.value })}
              rows={2}
              placeholder="Ej: Carpintería de PVC con DVH hermetizado y cortinas blackout."
              className="w-full text-xs px-2.5 py-1.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none"
            />
          </div>
        ))}
        {items.length === 0 && (
          <p className="text-xs text-gray-400">Todavía no hay rubros cargados. Tocá una sugerencia o &quot;+ Agregar rubro&quot;.</p>
        )}
      </div>

      <div className="flex items-center justify-between gap-2 pt-2">
        <button
          type="button"
          onClick={() => addItem()}
          className="text-xs font-medium text-gray-700 hover:text-gray-900 underline underline-offset-2"
        >
          + Agregar rubro
        </button>
        <Button type="submit" disabled={saving}>
          {saving ? 'Guardando...' : 'Guardar calidades'}
        </Button>
      </div>
    </form>
  );
}
