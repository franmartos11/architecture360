'use client';

import type { ReactNode } from 'react';
import type { TemperaturaLead } from '@/types';
import { TEMPERATURA_LABEL } from '@/lib/whatsapp-bot/calificacion';

/** Piezas visuales compartidas por las pestañas de Leads (rediseño "Leads · rediseño"). */

// Interés que calificó el bot de WhatsApp.
const TEMPERATURA_PILL: Record<TemperaturaLead, string> = {
  caliente: 'bg-red-50 text-red-700 border border-red-200',
  tibio: 'bg-amber-50 text-amber-800 border border-amber-200',
  frio: 'bg-sky-50 text-sky-800 border border-sky-200',
};

export function PillInteres({ t, size = 'sm' }: { t: TemperaturaLead; size?: 'xs' | 'sm' }) {
  const s = size === 'xs' ? 'text-[11px] px-1.5 py-px rounded-[5px]' : 'text-xs px-2 py-0.5 rounded-md';
  return <span className={`inline-flex items-center font-semibold whitespace-nowrap ${s} ${TEMPERATURA_PILL[t]}`}>{TEMPERATURA_LABEL[t]}</span>;
}

/** Etiqueta gris chica (origen, etapa, unidad). */
export function Etiqueta({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <span className={`inline-flex items-center gap-1 text-xs text-gray-700 bg-[#F1EFEA] px-2 py-0.5 rounded-md whitespace-nowrap ${className}`}>{children}</span>;
}

/** Punto verde de "activo / el bot responde". */
export function PuntoVivo({ className = '' }: { className?: string }) {
  return <span aria-hidden="true" className={`inline-block w-2 h-2 rounded-full bg-[#3F8F5F] shrink-0 ${className}`} />;
}

/** Contador redondo de las pestañas y columnas. */
export function Contador({ children, tono = 'neutral', label }: { children: ReactNode; tono?: 'neutral' | 'brand' | 'amber' | 'white'; label?: string }) {
  const tonos = {
    neutral: 'bg-gray-200 text-gray-900',
    brand: 'bg-brand-700 text-white',
    amber: 'bg-amber-100 text-amber-800',
    white: 'bg-white text-gray-700',
  }[tono];
  return (
    <span aria-label={label} className={`inline-flex items-center justify-center min-w-[22px] px-2 py-0.5 rounded-full text-xs font-semibold tabular-nums ${tonos}`}>
      {children}
    </span>
  );
}

export function iniciales(nombre: string | null | undefined): string {
  const partes = (nombre ?? '').replace(/[^\p{L}\s]/gu, ' ').trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return '?';
  return (partes[0][0] + (partes[1]?.[0] ?? '')).toUpperCase();
}

/** Avatar con iniciales: verde lleno para lo destacado, verde claro o beige para el resto. */
export function Avatar({ nombre, tono = 'brand', size = 40 }: { nombre: string | null | undefined; tono?: 'brand' | 'soft' | 'neutral'; size?: number }) {
  const tonos = {
    brand: 'bg-brand-700 text-white',
    soft: 'bg-brand-100 text-brand-800',
    neutral: 'bg-[#EBE8E2] text-gray-700',
  }[tono];
  return (
    <span
      aria-hidden="true"
      className={`rounded-full shrink-0 flex items-center justify-center font-semibold ${tonos}`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.34) }}
    >
      {iniciales(nombre)}
    </span>
  );
}

/** "12 min", "3 h", "ayer", "4 d", "2 sem". */
export function hace(iso: string, ahora: number = Date.now()): string {
  const mins = Math.max(0, Math.floor((ahora - new Date(iso).getTime()) / 60000));
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h} h`;
  const d = Math.floor(h / 24);
  if (d === 1) return 'ayer';
  if (d < 7) return `${d} d`;
  return `${Math.floor(d / 7)} sem`;
}

/** Interruptor del diseño sobre un checkbox nativo (accesible y testeable como checkbox). */
export function Interruptor({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <span className="relative shrink-0 w-[46px] h-7 inline-block">
      <input
        type="checkbox"
        role="switch"
        aria-label={label}
        checked={checked}
        disabled={disabled}
        onChange={e => onChange(e.target.checked)}
        className="peer absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10 m-0 disabled:cursor-not-allowed"
      />
      <span aria-hidden="true" className="absolute inset-0 rounded-full bg-gray-300 transition-colors peer-checked:bg-brand-700 peer-focus-visible:ring-2 peer-focus-visible:ring-brand-500/30 peer-focus-visible:ring-offset-2 peer-disabled:opacity-50" />
      <span aria-hidden="true" className="absolute top-[3px] left-[3px] w-[22px] h-[22px] rounded-full bg-white shadow transition-[left] peer-checked:left-[21px]" />
    </span>
  );
}

/** Cifra grande de los resúmenes (Tablero, Visitas, Bot). */
export function Cifra({
  label,
  valor,
  detalle,
  tono = 'white',
}: {
  label: string;
  valor: ReactNode;
  detalle?: ReactNode;
  tono?: 'white' | 'brand' | 'amber' | 'soft';
}) {
  const caja = {
    white: 'bg-white border border-gray-200 text-gray-900',
    brand: 'bg-brand-700 text-white',
    amber: 'bg-amber-50 border border-amber-200 text-amber-900',
    soft: 'bg-gray-100 text-gray-900',
  }[tono];
  const sub = tono === 'brand' ? 'text-white/80' : tono === 'amber' ? 'text-amber-800' : 'text-gray-600';
  return (
    <div className={`rounded-[14px] px-5 py-4 min-w-0 ${caja}`}>
      <div className={`text-[13px] ${sub}`}>{label}</div>
      <div className="font-display text-[30px] leading-tight font-semibold tracking-[-0.02em] mt-1 tabular-nums">{valor}</div>
      {detalle && <div className={`text-[13px] mt-0.5 ${sub}`}>{detalle}</div>}
    </div>
  );
}

/** Botón-filtro con conteo (negro el elegido). */
export function ChipFiltro({
  activo,
  onClick,
  children,
  cantidad,
  chico,
}: {
  activo: boolean;
  onClick: () => void;
  children: ReactNode;
  cantidad?: number;
  chico?: boolean;
}) {
  return (
    <button
      type="button"
      aria-pressed={activo}
      onClick={onClick}
      className={`shrink-0 inline-flex items-center gap-2 whitespace-nowrap border transition-colors ${
        chico ? 'min-h-[36px] px-3 rounded-full text-[13px]' : 'min-h-[44px] px-3.5 rounded-[10px] text-sm'
      } ${activo ? 'bg-gray-900 border-gray-900 text-white font-semibold' : 'bg-white border-gray-300 text-gray-900 font-medium hover:border-gray-400'}`}
    >
      {children}
      {cantidad !== undefined && (
        <span className={`text-xs font-semibold px-1.5 py-px rounded-full tabular-nums ${activo ? 'bg-white/15 text-white' : 'bg-[#F1EFEA] text-gray-700'}`}>{cantidad}</span>
      )}
    </button>
  );
}

/** Fila de aviso con ícono de info (las notas al pie del diseño). */
export function Nota({ children, icono }: { children: ReactNode; icono?: ReactNode }) {
  return (
    <p className="m-0 flex items-start gap-2 text-[13px] leading-relaxed text-gray-600">
      <span className="mt-0.5 shrink-0 text-gray-500" aria-hidden="true">{icono}</span>
      <span>{children}</span>
    </p>
  );
}
