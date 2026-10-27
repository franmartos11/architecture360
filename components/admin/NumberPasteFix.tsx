'use client';

import { useEffect } from 'react';
import { parsePastedNumber } from '@/lib/parse-pasted-number';

// Pegar "85 m²" o "USD 150.000" en un <input type="number"> deja el campo
// vacío sin avisar (el browser descarta todo lo que no sea un número JS).
// Un solo listener para todo el admin — hay ~40 inputs numéricos, con y sin
// el componente <Input> — que convierte lo pegado a número y lo entrega
// como un input normal, así el onChange de React lo toma igual que tipeado.
export default function NumberPasteFix() {
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const el = e.target;
      if (!(el instanceof HTMLInputElement) || el.type !== 'number' || el.readOnly || el.disabled) return;
      const text = e.clipboardData?.getData('text') ?? '';
      const parsed = parsePastedNumber(text);
      // Si ya es un número que el browser acepta, que lo maneje él.
      if (parsed == null || parsed === text.trim()) return;
      e.preventDefault();
      const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      setValue?.call(el, parsed);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    };
    document.addEventListener('paste', onPaste, true);
    return () => document.removeEventListener('paste', onPaste, true);
  }, []);
  return null;
}
