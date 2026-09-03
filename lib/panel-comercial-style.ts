import { Poppins } from 'next/font/google';
import type { CSSProperties } from 'react';

// Tipografía y paleta del panel comercial (dashboard/inventario/leads) —
// portadas 1:1 desde el diseño de Claude Design ("Panel comercial.dc.html")
// en vez de reusar la escala tipográfica/color del resto del admin, para
// que las tres pantallas se vean idénticas a lo que se mandó.
export const poppins = Poppins({ subsets: ['latin'], weight: ['300', '400', '500', '600', '700'], display: 'swap' });

export const ACCENT = '#5c7a58';
export const ACCENT_DARK = '#3f5a3c';
export const ACCENT_SOFT_BG = '#eef1ec';
export const ACCENT_SOFT_TEXT = '#2f3f2d';
export const DARK = '#101828';

export const CHART_COLOR = { available: ACCENT, reserved: '#d9a13a', sold: '#2f5d7c' };

export const STATUS_STYLE = {
  available: { color: '#0f7a4d', bg: '#eaf4ee', border: 'rgba(15,122,77,.24)', label: 'Disponible' },
  reserved: { color: '#a06a12', bg: '#fdf7ec', border: 'rgba(176,124,32,.24)', label: 'Reservado' },
  sold: { color: '#2f5d7c', bg: '#eaf0f6', border: 'rgba(47,93,124,.24)', label: 'Vendido' },
} as const;

export const LEAD_BADGE = {
  nuevo: { bg: '#fdecea', color: '#b3261e', label: 'Nuevo' },
  contactado: { bg: '#eaf0f6', color: '#2f5d7c', label: 'Contactado' },
  negociacion: { bg: '#fdf7ec', color: '#7a5514', label: 'Negociación' },
  cerrado: { bg: '#eaf4ee', color: '#0f7a4d', label: 'Cerrado' },
} as const;

export function money(n: number) {
  return `$${Math.round(n).toLocaleString('es-AR')}`;
}

/** Chip de filtro — como los <select> y botones de filtro del diseño. */
export const CHIP_CLASS = 'h-9 px-3 flex items-center gap-1.5 rounded-lg text-[11.5px] font-medium border cursor-pointer transition-colors outline-none';
export function chipStyle(on: boolean): CSSProperties {
  return on
    ? { borderColor: ACCENT, background: ACCENT_SOFT_BG, color: ACCENT_SOFT_TEXT }
    : { borderColor: 'rgba(16,24,40,.13)', background: '#fff', color: 'rgba(16,24,40,.6)' };
}
