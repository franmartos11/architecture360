'use client';

import { useState } from 'react';
import { ChevronUp, ChevronDown, Pencil, Trash2 } from 'lucide-react';
import { labelStyle, inputStyle } from './styles';

export interface ListFieldConfig {
  key: string;
  label: string;
  placeholder: string;
  /** Ocupa las dos columnas del formulario en vez de una. */
  full?: boolean;
}

// Sin constraint de índice: ProfileExperience/ProfileEducation/etc. son
// interfaces concretas (sin index signature), así que un genérico
// `T extends Record<string, ...>` las rechaza aunque calcen en la
// práctica. El acceso por clave dinámica (form.values[f.key]) se castea
// puntualmente en vez de forzar ese constraint.
interface ListSectionProps<T> {
  /** Ancla de navegación — ver ANCHORS en la página principal del editor. */
  id: string;
  title: string;
  description: string;
  addLabel: string;
  emptyText: string;
  isNew?: boolean;
  items: T[];
  fields: ListFieldConfig[];
  emptyItem: T;
  renderItem: (item: T) => { title: string; subtitle?: string; meta?: string; note?: string };
  onChange: (items: T[]) => void;
}

// Sección de lista reordenable (Experiencia / Educación / Certificados /
// Premios) — las cuatro comparten exactamente esta forma en el mockup
// Editor de perfil.dc.html (lista + flechas de orden + form inline de
// agregar/editar con un puñado de campos de texto simples), así que es
// un solo componente parametrizado por `fields`/`renderItem` en vez de
// cuatro casi-copias.
export default function ListSection<T>({
  id, title, description, addLabel, emptyText, isNew, items, fields, emptyItem, renderItem, onChange,
}: ListSectionProps<T>) {
  const [form, setForm] = useState<{ idx: number | null; values: Record<string, string | undefined> } | null>(null);

  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= items.length) return;
    const next = items.slice();
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };

  const remove = (i: number) => onChange(items.filter((_, idx) => idx !== i));

  const save = () => {
    if (!form) return;
    const firstKey = fields[0].key;
    if (!(form.values[firstKey] ?? '').trim()) return;
    const next = form.idx !== null ? items.map((it, i) => (i === form.idx ? form.values as T : it)) : [...items, form.values as T];
    onChange(next);
    setForm(null);
  };

  return (
    <div id={id} className="rounded-2xl bg-white border border-[rgba(28,25,23,0.08)] overflow-hidden scroll-mt-[130px]">
      <div className="px-5 py-[17px] flex items-center gap-2.5 border-b border-[rgba(28,25,23,0.06)]">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-[14.5px] text-[#1c1a17]">{title}</span>
            {isNew && (
              <span className="h-[19px] px-1.5 rounded-md bg-[rgba(92,122,88,0.14)] text-[9.5px] font-semibold tracking-[0.06em] text-[#4a6647] flex items-center">NUEVO</span>
            )}
            {items.length > 0 && (
              <span className="text-[11.5px] text-[rgba(28,25,23,0.4)]">{items.length} {items.length === 1 ? 'ítem' : 'ítems'}</span>
            )}
          </div>
          <p className="font-light text-[11.5px] leading-[1.5] text-[rgba(28,25,23,0.48)] mt-0.5">{description}</p>
        </div>
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => setForm({ idx: null, values: emptyItem as Record<string, string | undefined> })}
          className="h-8 px-3.5 rounded-[9px] border border-[rgba(92,122,88,0.32)] bg-[rgba(92,122,88,0.07)] text-[12px] font-medium text-[#4a6647] hover:bg-[rgba(92,122,88,0.15)] transition-colors shrink-0 whitespace-nowrap"
        >
          + {addLabel}
        </button>
      </div>

      {items.length === 0 && !form && (
        <div className="p-5 flex gap-[13px] items-center">
          <div className="w-[38px] h-[38px] rounded-[10px] bg-[#f5f4f0] flex items-center justify-center text-lg text-[rgba(28,25,23,0.3)] shrink-0">·</div>
          <p className="font-light text-xs leading-[1.55] text-[rgba(28,25,23,0.5)] flex-1">{emptyText}</p>
          <button
            type="button"
            onClick={() => setForm({ idx: null, values: emptyItem as Record<string, string | undefined> })}
            className="h-[31px] px-3.5 rounded-[9px] bg-[#1c1a17] text-white text-[11.5px] font-medium hover:bg-[#2f3d2c] transition-colors shrink-0 whitespace-nowrap"
          >
            {addLabel}
          </button>
        </div>
      )}

      {items.map((item, i) => {
        const r = renderItem(item);
        return (
          <div key={i} className="px-5 py-[15px] flex gap-[13px] items-start border-b border-[rgba(28,25,23,0.05)]">
            <div className="flex flex-col gap-0.5 pt-[5px] shrink-0">
              <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Subir" className="w-4 h-[13px] flex items-center justify-center text-[rgba(28,25,23,0.38)] disabled:text-[rgba(28,25,23,0.14)] disabled:cursor-default">
                <ChevronUp className="w-3 h-3" />
              </button>
              <button type="button" onClick={() => move(i, 1)} disabled={i === items.length - 1} aria-label="Bajar" className="w-4 h-[13px] flex items-center justify-center text-[rgba(28,25,23,0.38)] disabled:text-[rgba(28,25,23,0.14)] disabled:cursor-default">
                <ChevronDown className="w-3 h-3" />
              </button>
            </div>
            <div className="w-[42px] h-[42px] rounded-[10px] bg-[#f2f0ea] flex items-center justify-center font-semibold text-[15px] text-[rgba(28,25,23,0.42)] shrink-0">
              {(r.title || '·').charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-[13px] text-[#1c1a17]">{r.title}</p>
              {r.subtitle && <p className="text-xs text-[rgba(28,25,23,0.55)] mt-px">{r.subtitle}</p>}
              {r.meta && <p className="text-[11px] text-[rgba(28,25,23,0.4)] mt-[3px]">{r.meta}</p>}
              {r.note && <p className="font-light text-[11.5px] leading-[1.55] text-[rgba(28,25,23,0.55)] mt-[5px]">{r.note}</p>}
            </div>
            <div className="flex gap-1 shrink-0">
              <button type="button" onClick={() => setForm({ idx: i, values: item as Record<string, string | undefined> })} aria-label="Editar" className="w-[30px] h-[30px] rounded-lg flex items-center justify-center text-[rgba(28,25,23,0.4)] hover:bg-[#f5f4f0] hover:text-[#1c1a17] transition-colors">
                <Pencil className="w-3.5 h-3.5" />
              </button>
              <button type="button" onClick={() => remove(i)} aria-label="Eliminar" className="w-[30px] h-[30px] rounded-lg flex items-center justify-center text-[rgba(28,25,23,0.4)] hover:bg-[rgba(194,84,61,0.1)] hover:text-[#b0503a] transition-colors">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        );
      })}

      {form && (
        <div className="px-5 py-[17px] bg-[#faf9f6] border-t border-[rgba(28,25,23,0.06)]">
          <p className="font-medium text-[10px] tracking-[0.13em] text-[rgba(28,25,23,0.42)]">
            {(form.idx !== null ? addLabel.replace('Agregar', 'Editar').replace('Añadir', 'Editar') : addLabel).toUpperCase()}
          </p>
          <div className="grid grid-cols-2 gap-2.5 mt-[11px]">
            {fields.map(f => (
              <div key={f.key} className={f.full ? 'col-span-2' : ''}>
                <div className={labelStyle}>{f.label}</div>
                <input
                  value={form.values[f.key] ?? ''}
                  onChange={e => setForm(prev => (prev ? { ...prev, values: { ...prev.values, [f.key]: e.target.value } } : prev))}
                  placeholder={f.placeholder}
                  className={inputStyle}
                />
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2 mt-[13px]">
            <p className="font-light text-[10.5px] text-[rgba(28,25,23,0.42)] flex-1">Se guarda en tu portfolio al confirmar. Los cambios se publican al instante.</p>
            <button type="button" onClick={() => setForm(null)} className="h-8 px-3.5 rounded-[9px] text-[12px] font-medium text-[rgba(28,25,23,0.5)] hover:text-[#1c1a17] transition-colors">
              Cancelar
            </button>
            <button type="button" onClick={save} className="h-8 px-4 rounded-[9px] bg-[#1c1a17] text-white text-[12px] font-medium hover:bg-[#2f3d2c] transition-colors">
              {form.idx !== null ? 'Guardar cambios' : 'Agregar'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
