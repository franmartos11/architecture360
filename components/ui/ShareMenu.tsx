'use client';

import { useState } from 'react';
import Popover, { MenuItem } from '@/components/ui/Popover';
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
  const toast = useToast();

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
    <div className="relative inline-block">
      {children({ onClick: () => setOpen(o => !o), 'aria-expanded': open })}
      <Popover open={open} onClose={() => setOpen(false)} role="menu" align={align === 'right' ? 'end' : 'start'} ariaLabel="Compartir" className="w-44 text-sm">
        <MenuItem onClick={copy}>Copiar link</MenuItem>
        {targets.map(t => (
          <a
            key={t.label}
            href={t.href}
            target="_blank"
            rel="noopener noreferrer"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="block px-3.5 py-2 min-h-[40px] text-gray-800 hover:bg-gray-100 focus-visible:outline-none focus-visible:bg-gray-100 transition-colors"
          >
            {t.label}
          </a>
        ))}
        {typeof navigator !== 'undefined' && typeof navigator.share === 'function' && (
          <MenuItem onClick={nativeShare} className="border-t border-gray-100">Más opciones…</MenuItem>
        )}
      </Popover>
    </div>
  );
}
