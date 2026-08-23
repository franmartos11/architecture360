'use client';

import { useState, useRef, useEffect } from 'react';
import { MoreHorizontal } from 'lucide-react';

interface KebabMenuItem {
  label: string;
  onClick: () => void;
  danger?: boolean;
}

// Menú "⋯" genérico para acciones sobre una card (post, comentario) — antes
// la única acción disponible (borrar) era un link de texto plano suelto en
// la esquina, que no deja lugar para sumar más acciones ni se lee como algo
// interactivo a primera vista.
export default function KebabMenu({ items }: { items: KebabMenuItem[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (items.length === 0) return null;

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        onClick={() => setOpen(o => !o)}
        className="p-1 rounded-full text-trevo-dark/30 hover:text-trevo-dark hover:bg-trevo-dark/5 transition-colors"
        aria-label="Más opciones"
        aria-expanded={open}
      >
        <MoreHorizontal className="w-4 h-4" />
      </button>
      {open && (
        <div className="absolute top-full right-0 mt-1 w-40 bg-white rounded-xl shadow-lg border border-trevo-dark/10 overflow-hidden z-30 py-1">
          {items.map(item => (
            <button
              key={item.label}
              onClick={() => { setOpen(false); item.onClick(); }}
              className={`w-full text-left px-3.5 py-2 text-sm transition-colors ${item.danger ? 'text-red-500 hover:bg-red-50' : 'text-trevo-dark hover:bg-trevo-dark/5'}`}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
