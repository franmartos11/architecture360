'use client';

import { useState, useEffect } from 'react';
import Button from '@/components/ui/Button';
import { EditorSkeleton } from '@/components/admin/PanelSkeletons';
import { useThemeSectionEditor } from './theme-section-helper';
import type { FaqItem } from '@/types';

const SUGGESTED_QUESTIONS: FaqItem[] = [
  { question: '¿Cuál es la forma de pago y financiación?', answer: '' },
  { question: '¿Cuándo es la fecha estimada de entrega?', answer: '' },
  { question: '¿Se incluyen cocheras o bauleras?', answer: '' },
];

export default function FaqEditor({ onSaved }: { onSaved: () => void }) {
  const { themeConfig, loading, saving, savePatch } = useThemeSectionEditor();
  const [items, setItems] = useState<FaqItem[]>([]);

  useEffect(() => {
    if (themeConfig) setItems(themeConfig.faqItems ?? []);
  }, [themeConfig]);

  if (loading) return <EditorSkeleton rows={4} />;

  const addItem = (seed?: FaqItem) => setItems(prev => [...prev, seed ?? { question: '', answer: '' }]);
  const updateItem = (idx: number, patch: Partial<FaqItem>) =>
    setItems(prev => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  const removeItem = (idx: number) => setItems(prev => prev.filter((_, i) => i !== idx));

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = items
      .map(it => ({ question: it.question.trim(), answer: it.answer.trim() }))
      .filter(it => it.question && it.answer);
    const ok = await savePatch({ faqItems: cleaned });
    if (ok) {
      setItems(cleaned);
      onSaved();
    }
  };

  return (
    <form onSubmit={handleSave} className="p-6 space-y-5">
      <div className="space-y-2">
        <p className="m-0 text-xs text-gray-500">
          Respondé las dudas típicas de quienes consultan antes de agendar visita.
        </p>
        {items.length === 0 && (
          <button
            type="button"
            onClick={() => setItems(SUGGESTED_QUESTIONS)}
            className="px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-xs font-medium text-gray-700 hover:border-gray-300"
          >
            + Cargar preguntas sugeridas
          </button>
        )}
      </div>

      <div className="space-y-3">
        {items.map((item, idx) => (
          <div key={idx} className="p-3 rounded-xl border border-gray-200 bg-white space-y-2">
            <div className="flex items-center gap-2">
              <input
                value={item.question}
                onChange={e => updateItem(idx, { question: e.target.value })}
                placeholder="Pregunta (ej: ¿Aceptan financiación?)"
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
              value={item.answer}
              onChange={e => updateItem(idx, { answer: e.target.value })}
              rows={2}
              placeholder="Respuesta clara y directa…"
              className="w-full text-xs px-2.5 py-1.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none"
            />
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between gap-2 pt-2">
        <button
          type="button"
          onClick={() => addItem()}
          className="text-xs font-medium text-gray-700 hover:text-gray-900 underline underline-offset-2"
        >
          + Agregar pregunta
        </button>
        <Button type="submit" disabled={saving}>
          {saving ? 'Guardando...' : 'Guardar FAQ'}
        </Button>
      </div>
    </form>
  );
}
