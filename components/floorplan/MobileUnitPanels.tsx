'use client';

import { useRef, useState } from 'react';
import Image from 'next/image';
import { m as motion, useReducedMotion } from 'framer-motion';

// Piezas de la vista de plantas en mobile: la tarjeta fija de abajo con lo
// elegido en el plano y el detalle que se abre desde ella (dentro de
// UnitSheet). En escritorio la ficha vive en el panel lateral.

export interface MobileAction {
  label: string;
  onClick: () => void;
  icon?: 'arrow';
}

export interface MobileActions {
  favorite?: { on: boolean; onToggle: () => void };
  secondary?: MobileAction;
  primary?: MobileAction;
}

export interface MobileSelectionSummary {
  title: string;
  subtitle: string;
  price?: string;
  statusLabel?: string;
  statusColor?: string;
  image?: string;
}

// ── Tarjeta fija de abajo ────────────────────────────────────────
// Siempre a la vista mientras hay algo elegido: tocarla (o deslizarla hacia
// arriba) abre el detalle.
export function MobileSelectionCard({ summary, selectionKey, actions, onExpand }: {
  summary: MobileSelectionSummary;
  /** Cambia con la selección: el contenido entra con un fundido. */
  selectionKey: string;
  actions: MobileActions;
  onExpand: () => void;
}) {
  const reduced = !!useReducedMotion();
  const swipeFrom = useRef<number | null>(null);
  const hasActions = !!(actions.favorite || actions.secondary || actions.primary);
  return (
    <div
      className="relative z-10 flex flex-col gap-3 px-4 rounded-t-[20px] bg-white shadow-[0_-6px_20px_rgba(0,0,0,0.12)]"
      style={{ paddingBottom: 'max(16px, env(safe-area-inset-bottom))' }}
      onPointerDown={e => { swipeFrom.current = e.clientY; }}
      onPointerUp={e => {
        if (swipeFrom.current !== null && e.clientY - swipeFrom.current < -24) onExpand();
        swipeFrom.current = null;
      }}
    >
      <button type="button" onClick={onExpand} aria-label="Ver detalle" className="h-5 flex items-center justify-center">
        <span aria-hidden="true" className="w-10 h-1 rounded-full bg-gray-300" />
      </button>
      <motion.button
        key={selectionKey}
        type="button"
        onClick={onExpand}
        aria-haspopup="dialog"
        initial={reduced ? false : { opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
        className="flex items-center gap-3 text-left text-gray-900"
      >
        <span className="relative w-16 h-16 shrink-0 overflow-hidden rounded-xl bg-gray-100">
          {summary.image && <Image src={summary.image} alt="" fill sizes="64px" className="object-cover" />}
        </span>
        <span className="flex-1 min-w-0 flex flex-col gap-[3px]">
          {summary.statusLabel && <StatusLine label={summary.statusLabel} color={summary.statusColor} />}
          <span className="flex items-baseline justify-between gap-2">
            <span className="text-lg leading-tight font-bold truncate">{summary.title}</span>
            {summary.price && <span className="text-base font-bold whitespace-nowrap tabular-nums">{summary.price}</span>}
          </span>
          <span className="text-[13px] text-gray-500 truncate">{summary.subtitle}</span>
        </span>
      </motion.button>
      {hasActions && <ActionRow actions={actions} />}
    </div>
  );
}

// ── Detalle (dentro de la hoja) ──────────────────────────────────
export function MobileUnitDetail({ summary, photos, specs, actions, onClose, onShare, children }: {
  summary: MobileSelectionSummary;
  photos: string[];
  specs: { label: string; value: string }[];
  actions: MobileActions;
  onClose: () => void;
  onShare?: () => void;
  /** Lo que sigue a los datos: qué incluye, ubicación, etc. */
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col min-h-full">
      <div className="relative h-[220px] shrink-0 bg-gray-100">
        <PhotoCarousel photos={photos} />
        <div className="absolute top-4 right-4 flex gap-2">
          {onShare && (
            <button type="button" onClick={onShare} aria-label="Compartir esta unidad" className="w-11 h-11 rounded-full bg-white/95 text-gray-900 flex items-center justify-center shadow-sm">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true"><circle cx="18" cy="5" r="2.5" /><circle cx="6" cy="12" r="2.5" /><circle cx="18" cy="19" r="2.5" /><path d="M8.2 10.8l7.6-4.4M8.2 13.2l7.6 4.4" /></svg>
            </button>
          )}
          <button type="button" onClick={onClose} aria-label="Cerrar" className="w-11 h-11 rounded-full bg-white/95 text-gray-900 flex items-center justify-center shadow-sm">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
          </button>
        </div>
      </div>

      <div className="flex-1 px-4 pt-5 pb-6 flex flex-col gap-[18px] text-gray-900">
        <div className="flex flex-col gap-1.5">
          {summary.statusLabel && <StatusLine label={summary.statusLabel} color={summary.statusColor} />}
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="m-0 text-[26px] leading-tight font-bold">{summary.title}</h2>
            {summary.price && <span className="text-[22px] font-bold whitespace-nowrap tabular-nums">{summary.price}</span>}
          </div>
          <span className="text-sm text-gray-500">{summary.subtitle}</span>
        </div>

        {specs.length > 0 && (
          <dl className="grid grid-cols-2 gap-2 m-0">
            {specs.map(s => (
              <div key={s.label} className="flex flex-col gap-1 rounded-xl bg-[#F3F5F7] p-3">
                <dt className="text-xs text-gray-500">{s.label}</dt>
                <dd className="m-0 text-base font-bold">{s.value}</dd>
              </div>
            ))}
          </dl>
        )}

        {children}
      </div>

      {(actions.favorite || actions.secondary || actions.primary) && (
        <div
          className="sticky bottom-0 shrink-0 px-4 pt-3 border-t border-[#ECEEF0] bg-white"
          style={{ paddingBottom: 'max(20px, env(safe-area-inset-bottom))' }}
        >
          <ActionRow actions={actions} />
        </div>
      )}
    </div>
  );
}

function StatusLine({ label, color }: { label: string; color?: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span aria-hidden="true" className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
      <span className="text-[11px] font-bold tracking-[0.08em]" style={{ color }}>{label.toUpperCase()}</span>
    </span>
  );
}

function ActionRow({ actions }: { actions: MobileActions }) {
  const { favorite, secondary, primary } = actions;
  return (
    <div className="flex gap-2">
      {favorite && (
        <button
          type="button"
          onClick={favorite.onToggle}
          aria-label={favorite.on ? 'Quitar de favoritos' : 'Guardar en favoritos'}
          aria-pressed={favorite.on}
          className={`w-12 h-12 shrink-0 rounded-[14px] border flex items-center justify-center transition-colors ${
            favorite.on ? 'text-[#C2410C] border-[#F3C3A8] bg-[#FFF4ED]' : 'text-gray-900 border-[#DADDE1] bg-white'
          }`}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill={favorite.on ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={2} strokeLinejoin="round" aria-hidden="true"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" /></svg>
        </button>
      )}
      {secondary && (
        <button
          type="button"
          onClick={secondary.onClick}
          className="flex-[1_1_0] min-w-0 h-12 rounded-[14px] border border-gray-900 bg-white text-gray-900 text-sm font-bold flex items-center justify-center gap-2"
        >
          <span className="truncate">{secondary.label}</span>
        </button>
      )}
      {primary && (
        <button
          type="button"
          onClick={primary.onClick}
          className="flex-[1.3_1_0] min-w-0 h-12 rounded-[14px] bg-gray-900 text-white text-sm font-bold flex items-center justify-center gap-2"
        >
          <span className="truncate">{primary.label}</span>
          {primary.icon === 'arrow' && (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
          )}
        </button>
      )}
    </div>
  );
}

// Fotos de la unidad, deslizables de a una, con contador.
function PhotoCarousel({ photos }: { photos: string[] }) {
  const [index, setIndex] = useState(0);
  if (photos.length === 0) return null;
  return (
    <>
      <div
        className="absolute inset-0 flex overflow-x-auto snap-x snap-mandatory [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        onScroll={e => {
          const el = e.currentTarget;
          setIndex(Math.round(el.scrollLeft / Math.max(1, el.clientWidth)));
        }}
      >
        {photos.map((src, i) => (
          <div key={src + i} className="relative w-full h-full shrink-0 snap-start">
            <Image src={src} alt={i === 0 ? 'Interior de la unidad' : ''} fill sizes="100vw" priority={i === 0} className="object-cover" />
          </div>
        ))}
      </div>
      {photos.length > 1 && (
        <span className="absolute left-4 bottom-3 rounded-[10px] bg-gray-900/75 px-2 py-1 text-xs font-semibold text-white tabular-nums pointer-events-none">
          {index + 1} / {photos.length} fotos
        </span>
      )}
    </>
  );
}
