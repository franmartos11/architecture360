'use client';

import { useState } from 'react';
import { MoreHorizontal } from 'lucide-react';
import Popover, { MenuItem } from '@/components/ui/Popover';

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
  if (items.length === 0) return null;

  return (
    <div className="relative shrink-0">
      <button
        onClick={() => setOpen(o => !o)}
        className="p-1 rounded-full text-trevo-dark/30 hover:text-trevo-dark hover:bg-trevo-dark/5 transition-colors"
        aria-label="Más opciones"
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <MoreHorizontal className="w-4 h-4" />
      </button>
      <Popover open={open} onClose={() => setOpen(false)} role="menu" ariaLabel="Más opciones" className="w-40 z-30 overflow-hidden">
        {items.map(item => (
          <MenuItem key={item.label} danger={item.danger} onClick={() => { setOpen(false); item.onClick(); }}>
            {item.label}
          </MenuItem>
        ))}
      </Popover>
    </div>
  );
}
