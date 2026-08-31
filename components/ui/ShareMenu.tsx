'use client';

import { useState, useRef, useEffect } from 'react';
import { useToast } from '@/components/ui/ToastProvider';

interface ShareMenuProps {
  /** Link a compartir. */
  url: string;
  /** Texto que acompaña al link (título del post / proyecto / unidad). */
  text: string;
  /** El botón/trigger — recibe onClick del menú. */
  children: (props: { onClick: () => void; 'aria-expanded': boolean }) => React.ReactNode;
  /** Alineación del panel. */
  align?: 'left' | 'right';
}

// Menú de "compartir fuera de la app": WhatsApp / Facebook / X / copiar
// link, más el share nativo del sistema si existe (en mobile trae también
// Instagram, Telegram, etc.). Reemplaza al viejo useShareLink() que en
// desktop solo copiaba en silencio.
export default function ShareMenu({ url, text, children, align = 'right' }: ShareMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const toast = useToast();

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onClick); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const enc = encodeURIComponent;
  const targets = [
    { label: 'WhatsApp', href: `https://wa.me/?text=${enc(`${text} ${url}`)}` },
    { label: 'Facebook', href: `https://www.facebook.com/sharer/sharer.php?u=${enc(url)}` },
    { label: 'X', href: `https://twitter.com/intent/tweet?text=${enc(text)}&url=${enc(url)}` },
    { label: 'Telegram', href: `https://t.me/share/url?url=${enc(url)}&text=${enc(text)}` },
  ];

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast('Link copiado');
    } catch {
      toast('No se pudo copiar el link', 'error');
    }
    setOpen(false);
  };

  const nativeShare = async () => {
    try { await navigator.share({ text, url }); } catch { /* cancelado */ }
    setOpen(false);
  };

  return (
    <div ref={ref} className="relative inline-block">
      {children({ onClick: () => setOpen(o => !o), 'aria-expanded': open })}
      {open && (
        <div
          role="menu"
          className={`absolute z-50 mt-1.5 w-44 bg-white rounded-xl shadow-lg border border-gray-200 py-1 text-sm ${align === 'right' ? 'right-0' : 'left-0'}`}
        >
          <button
            type="button"
            onClick={copy}
            className="w-full text-left px-3 py-2 text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Copiar link
          </button>
          {targets.map(t => (
            <a
              key={t.label}
              href={t.href}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setOpen(false)}
              className="block px-3 py-2 text-gray-700 hover:bg-gray-50 transition-colors"
            >
              {t.label}
            </a>
          ))}
          {typeof navigator !== 'undefined' && typeof navigator.share === 'function' && (
            <button
              type="button"
              onClick={nativeShare}
              className="w-full text-left px-3 py-2 text-gray-700 hover:bg-gray-50 transition-colors border-t border-gray-100"
            >
              Más opciones…
            </button>
          )}
        </div>
      )}
    </div>
  );
}
