'use client';

import { useState } from 'react';
import { Smile } from 'lucide-react';
import Popover from '@/components/ui/Popover';

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

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-label="Agregar un emoji"
        aria-expanded={open}
        aria-haspopup="dialog"
        className="p-1.5 rounded-full text-trevo-dark/40 hover:text-trevo-dark hover:bg-trevo-dark/5 transition-colors"
      >
        <Smile className="w-5 h-5" />
      </button>
      <Popover open={open} onClose={() => setOpen(false)} role="dialog" ariaLabel="Emojis" side="top" className="w-64 !p-2 grid grid-cols-8 gap-0.5 z-30">
        {EMOJIS.map(emoji => (
          <button
            key={emoji}
            type="button"
            onClick={() => { onSelect(emoji); setOpen(false); }}
            className="text-lg leading-none w-7 h-7 flex items-center justify-center rounded-lg hover:bg-trevo-dark/5 focus-visible:bg-trevo-dark/5 focus-visible:outline-none transition-colors"
          >
            {emoji}
          </button>
        ))}
      </Popover>
    </div>
  );
}
