'use client';

import { useState } from 'react';
import Button from '@/components/ui/Button';
import { EditorSkeleton } from '@/components/admin/PanelSkeletons';
import { useThemeSectionEditor } from './theme-section-helper';
import type { HighlightItem } from '@/types';

const SUGGESTED_HIGHLIGHTS: HighlightItem[] = [
  { kicker: 'Ubicación', title: 'Zona consolidada', detail: 'A minutos de parques, colegios y accesos principales.' },
  { kicker: 'Eficiencia', title: 'Aberturas con DVH', detail: 'Aislación térmica y acústica en todos los ambientes.' },
  { kicker: 'Inversión', title: 'Bajas expensas', detail: 'Diseño pensado para optimizar mantenimiento.' },
];

export default function HighlightsEditor({ onSaved }: { onSaved: () => void }) {
  const { themeConfig, loading, saving, savePatch } = useThemeSectionEditor();
  const [items, setItems] = useState<HighlightItem[]>([]);

  // La configuración llega después del primer render: se copia al estado al cambiar
  // (ajuste en el render, no en un efecto: evita un render extra en cascada).
  const [fuente, setFuente] = useState<typeof themeConfig | undefined>(undefined);
  if (themeConfig !== fuente) {
    setFuente(themeConfig);
    if (themeConfig) setItems(themeConfig.highlightsItems ?? []);
  }

  if (loading) return <EditorSkeleton rows={4} />;

  const addItem = () => setItems(prev => [...prev, { kicker: '', title: '', detail: '' }]);
  const updateItem = (idx: number, patch: Partial<HighlightItem>) =>
    setItems(prev => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  const removeItem = (idx: number) => setItems(prev => prev.filter((_, i) => i !== idx));

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = items
      .map(it => ({
        kicker: it.kicker.trim(),
        title: it.title.trim(),
        ...(it.detail?.trim() ? { detail: it.detail.trim() } : {}),
      }))
      .filter(it => it.kicker && it.title);
    const ok = await savePatch({ highlightsItems: cleaned });
    if (ok) {
      setItems(cleaned);
      onSaved();
    }
  };

  return (
    <form onSubmit={handleSave} className="p-6 space-y-5">
      <div className="space-y-2">
        <p className="m-0 text-xs text-gray-500">
          3 o 4 argumentos concretos que resumen por qué elegir el proyecto.
        </p>
        {items.length === 0 && (
          <button
            type="button"
            onClick={() => setItems(SUGGESTED_HIGHLIGHTS)}
            className="px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-xs font-medium text-gray-700 hover:border-gray-300"
          >
            + Cargar diferenciales sugeridos
          </button>
        )}
      </div>

      <div className="space-y-3">
        {items.map((item, idx) => (
          <div key={idx} className="p-3 rounded-xl border border-gray-200 bg-white space-y-2">
            <div className="flex items-center gap-2">
              <input
                value={item.kicker}
                onChange={e => updateItem(idx, { kicker: e.target.value })}
                placeholder="Etiqueta (ej: Eficiencia)"
                className="w-28 text-xs font-medium px-2.5 py-1.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none"
              />
              <input
                value={item.title}
                onChange={e => updateItem(idx, { title: e.target.value })}
                placeholder="Título (ej: Aberturas DVH)"
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
              value={item.detail ?? ''}
              onChange={e => updateItem(idx, { detail: e.target.value })}
              rows={2}
              placeholder="Bajada corta (opcional)…"
              className="w-full text-xs px-2.5 py-1.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none"
            />
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between gap-2 pt-2">
        <button
          type="button"
          onClick={addItem}
          className="text-xs font-medium text-gray-700 hover:text-gray-900 underline underline-offset-2"
        >
          + Agregar diferencial
        </button>
        <Button type="submit" disabled={saving}>
          {saving ? 'Guardando...' : 'Guardar diferenciales'}
        </Button>
      </div>
    </form>
  );
}
