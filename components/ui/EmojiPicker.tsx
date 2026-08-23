'use client';

import { useState, useRef, useEffect } from 'react';
import { Smile } from 'lucide-react';

// Selección curada y chica a propósito — no es un reemplazo de un picker
// completo (sin categorías, sin búsqueda, sin variantes de tono de piel):
// alcanza para lo que pidió el cliente, "poder poner emojis" en
// comentarios/mensajes, sin sumar una librería nueva para eso.
const EMOJIS = [
  '😀', '😂', '😍', '🥰', '😎', '🤔', '😢', '😮', '👍', '👎',
  '👏', '🙌', '🙏', '💪', '✅', '🔥', '✨', '🎉', '❤️', '💯',
  '🏠', '🏢', '🌇', '🌅', '📍', '📸', '👀', '💬', '⭐', '🚀',
];

export default function EmojiPicker({ onSelect }: { onSelect: (emoji: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-label="Agregar un emoji"
        aria-expanded={open}
        className="p-1.5 rounded-full text-trevo-dark/40 hover:text-trevo-dark hover:bg-trevo-dark/5 transition-colors"
      >
        <Smile className="w-5 h-5" />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute bottom-full right-0 mb-2 w-64 bg-white rounded-xl shadow-lg border border-trevo-dark/10 p-2 grid grid-cols-8 gap-0.5 z-30"
        >
          {EMOJIS.map(emoji => (
            <button
              key={emoji}
              type="button"
              onClick={() => { onSelect(emoji); setOpen(false); }}
              className="text-lg leading-none w-7 h-7 flex items-center justify-center rounded-lg hover:bg-trevo-dark/5 transition-colors"
            >
              {emoji}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
