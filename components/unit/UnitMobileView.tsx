'use client';

import Segmented from '@/components/ui/Segmented';
import { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import { AnimatePresence } from 'framer-motion';
import { TransitionLink } from '@/components/ui/TransitionUtils';
import ShareMenu from '@/components/ui/ShareMenu';
import { formatPrice, getStatusColor, getStatusLabel, cocheraLabel } from '@/lib/units';
import type { Amenity, Unit, UnitViewTab } from '@/types';

// Ficha de la unidad en pantallas angostas: una sola página que scrollea
// — barra con volver/compartir, la imagen con su selector (Plano · 3D ·
// 360° · Fotos), precio y datos, cuota, amenities, ubicación y otras de la
// misma tipología — y una barra fija abajo para consultar. Reemplaza al
// visor de pantalla completa con seis pestañas abajo: en el celular se
// leía como una app dentro de otra y el precio no estaba a la vista.
// Los visores (plano, 3D, 360°, galería) son los mismos de escritorio; los
// arma UnitViewer y llegan como `renderMedia`.

/** Vistas de la imagen grande, en el orden en que se ofrecen. */
export type MobileMediaTab = Extract<UnitViewTab, 'plano' | 'planta3d' | 'tour360' | 'galeria'>;
const MEDIA_ORDER: { id: MobileMediaTab; label: string }[] = [
  { id: 'plano', label: 'Plano' },
  { id: 'planta3d', label: '3D' },
  { id: 'tour360', label: '360°' },
  { id: 'galeria', label: 'Fotos' },
];

// Estado escrito: los colores de estado son para puntos; como texto chico
// sobre blanco no llegan al contraste mínimo.
const STATUS_INK: Record<string, string> = { available: '#15803d', reserved: '#A16207', sold: '#B91C1C' };

interface UnitMobileViewProps {
  unit: Unit;
  allUnits: Unit[];
  buildingName: string;
  floorNumber: number;
  basePath: string;
  /** Título de la barra: "Unidad 107", "Lote 12"… */
  title: string;
  /** Tipología (h1): modelo, categoría o el nombre si no hay. */
  heading: string;
  /** "Monoambiente", "2 dorm.", "Local"… — para la barra de abajo. */
  typeLabel: string;
  showStatus: boolean;
  showPrice: boolean;
  showLeads: boolean;
  showCalculator: boolean;
  hasFloorStep: boolean;
  unitIsLand: boolean;
  isDwelling: boolean;
  projectSlug: string;
  mediaTabs: MobileMediaTab[];
  mediaTab: MobileMediaTab | null;
  onMediaTabChange: (t: MobileMediaTab) => void;
  renderMedia: (t: MobileMediaTab) => React.ReactNode;
  amenities: Amenity[];
  hasPointsOfInterest: boolean;
  /** Sección a la que se baja al entrar (deep link ?tab=amenities|ubicacion). */
  scrollToSection?: 'amenities' | 'ubicacion';
  shareUrl: string;
  shareText: string;
  onBack: () => void;
  backLabel: string;
  onCompare?: () => void;
  onContact: (method?: 'email' | 'phone' | 'whatsapp') => void;
}

export default function UnitMobileView(props: UnitMobileViewProps) {
  const {
    unit, allUnits, buildingName, floorNumber, basePath, title, heading, typeLabel,
    showStatus, showPrice, showLeads, showCalculator, hasFloorStep, unitIsLand, isDwelling, projectSlug,
    mediaTabs, mediaTab, onMediaTabChange, renderMedia, amenities, hasPointsOfInterest,
    scrollToSection, shareUrl, shareText, onBack, backLabel, onCompare, onContact,
  } = props;

  const price = showPrice && unit.price ? unit.price : undefined;
  const currency = unit.currency ?? 'USD';
  const pricePerM2 = price && unit.totalArea > 0 ? formatPrice(Math.round(price / unit.totalArea), currency) : null;
  const floorText = hasFloorStep ? (floorNumber === 0 ? 'Planta baja' : `Piso ${floorNumber}`) : '';
  const placeText = [floorText, buildingName].filter(Boolean).join(' · ');

  // Datos en tarjetas de a dos — solo los que la unidad tiene cargados.
  const specs = useMemo(() => {
    const list: { label: string; value: string }[] = [
      { label: 'Superficie', value: `${unit.totalArea} m²` },
    ];
    if (!unitIsLand && isDwelling) {
      list.push({ label: 'Dormitorios', value: unit.bedrooms === 0 ? 'Monoambiente' : String(unit.bedrooms) });
      list.push({ label: 'Baños', value: String(unit.bathrooms) });
    }
    if (placeText) list.push({ label: 'Ubicación', value: placeText });
    if (!unitIsLand && unit.innerArea > 0 && unit.innerArea !== unit.totalArea) list.push({ label: 'Sup. interna', value: `${unit.innerArea} m²` });
    if (!unitIsLand && unit.balconyArea > 0) list.push({ label: 'Balcón', value: `${unit.balconyArea} m²` });
    if (!unitIsLand && unit.orientation) list.push({ label: 'Orientación', value: unit.orientation });
    const cochera = !unitIsLand ? cocheraLabel(unit) : '';
    if (cochera) list.push({ label: 'Cochera', value: cochera });
    if (!unitIsLand && unit.hoaFee) list.push({ label: 'Expensas', value: `${formatPrice(unit.hoaFee, currency)}/mes` });
    return list;
  }, [unit, unitIsLand, isDwelling, placeText, currency]);

  // Otras unidades de la misma tipología, las más cercanas en piso primero.
  const sameType = useMemo(() => {
    if (unitIsLand || !unit.modelName) return [];
    return allUnits
      .filter(u => u.id !== unit.id && u.modelName === unit.modelName && u.status !== 'sold')
      .sort((a, b) => Math.abs(a.floor - unit.floor) - Math.abs(b.floor - unit.floor) || a.name.localeCompare(b.name));
  }, [allUnits, unit, unitIsLand]);
  const sameTypeShown = sameType.slice(0, 3);

  const amenityThumbs = amenities.filter(a => a.images[0]).slice(0, 4);

  useEffect(() => {
    if (!scrollToSection) return;
    const t = setTimeout(() => {
      document.getElementById(`unit-m-${scrollToSection}`)?.scrollIntoView({ block: 'start' });
    }, 300);
    return () => clearTimeout(t);
  }, [scrollToSection]);

  return (
    <div className="flex flex-col h-[calc(100dvh-4rem)] bg-white text-gray-900">
      {/* ── Barra: volver · unidad · compartir ── */}
      <header className="flex-none h-[60px] flex items-center gap-1 px-2 border-b border-[#ECEEF1] bg-white">
        <button
          type="button"
          onClick={onBack}
          aria-label={backLabel}
          className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg>
        </button>
        <div className="flex-1 min-w-0 flex flex-col">
          <h1 className="m-0 text-base font-bold leading-5 truncate">{title}</h1>
          {placeText && <span className="text-xs leading-[15px] text-[#5B6472] truncate">{placeText}</span>}
        </div>
        {onCompare && (
          <button
            type="button"
            onClick={onCompare}
            aria-label="Comparar con otra unidad"
            className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
              <rect x="3" y="4" width="7.5" height="16" rx="1" />
              <rect x="13.5" y="4" width="7.5" height="16" rx="1" />
            </svg>
          </button>
        )}
        <ShareMenu url={shareUrl} text={shareText} align="right">
          {trigger => (
            <button {...trigger} type="button" aria-label="Compartir" className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4" /></svg>
            </button>
          )}
        </ShareMenu>
      </header>

      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
        {/* ── Imagen con su selector ── */}
        {mediaTab ? (
          <div>
          {/* El selector va debajo de la imagen, no encima: flotando tapaba
              el plano (y algunos visores ya traen su propio selector arriba). */}
          <div className="relative aspect-square max-h-[65dvh] w-full bg-white overflow-hidden">
            <AnimatePresence mode="wait">{renderMedia(mediaTab)}</AnimatePresence>
          </div>
            {mediaTabs.length > 1 && (
              <Segmented
                className="mx-4 mt-3"
                role="tablist"
                size="lg"
                ariaLabel="Vistas de la unidad"
                value={mediaTab}
                onChange={onMediaTabChange}
                options={mediaTabs.map(id => ({ value: id, label: MEDIA_ORDER.find(m => m.id === id)!.label }))}
              />
            )}
          </div>
        ) : (
          <div className="h-40 flex items-center justify-center px-6 text-center text-sm text-gray-400 bg-[#F4F5F6]">
            Todavía no hay planos, renders ni fotos de esta unidad.
          </div>
        )}

        <main className="flex flex-col gap-7 px-4 pt-5 pb-7">
          {/* ── Estado, tipología y precio ── */}
          <section className="flex flex-col gap-1.5">
            {showStatus && (
              <span className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: STATUS_INK[unit.status] ?? getStatusColor(unit.status) }}>
                <span aria-hidden="true" className="w-2 h-2 rounded-full" style={{ background: getStatusColor(unit.status) }} />
                {getStatusLabel(unit.status)}
              </span>
            )}
            <h2 className="m-0 text-[26px] leading-8 font-bold">{heading}</h2>
            {price ? (
              <div className="flex items-baseline gap-2 flex-wrap">
                <span className="text-2xl font-bold tabular-nums">{formatPrice(price, currency)}</span>
                {pricePerM2 && <span className="text-[13px] text-[#5B6472] tabular-nums">{pricePerM2} por m²</span>}
              </div>
            ) : showLeads ? (
              <button type="button" onClick={() => onContact()} className="self-start text-[15px] font-semibold underline underline-offset-2">
                Consultar precio
              </button>
            ) : null}
          </section>

          {/* ── Datos ── */}
          <section aria-label="Datos de la unidad" className="grid grid-cols-2 gap-2">
            {specs.map(s => (
              <div key={s.label} className="bg-[#F4F5F6] rounded-xl px-3.5 py-3 flex flex-col gap-1 min-w-0">
                <span className="text-xs text-[#5B6472]">{s.label}</span>
                <span className="text-base font-bold leading-snug">{s.value}</span>
              </div>
            ))}
          </section>

          {/* Comodidades (casas): chips. */}
          {!unitIsLand && !!unit.features?.length && (
            <section className="flex flex-wrap gap-1.5" aria-label="Comodidades">
              {unit.features.map(f => (
                <span key={f} className="text-[13px] font-medium text-gray-700 bg-white border border-[#E6E8EB] rounded-full px-3 py-1">{f}</span>
              ))}
            </section>
          )}

          {/* ── Cuota ── */}
          {showCalculator && price && <QuotaCalculator price={price} currency={currency} projectSlug={projectSlug} />}

          {/* ── Amenities ── */}
          {amenities.length > 0 && (
            <section id="unit-m-amenities" aria-labelledby="unit-m-amen-t" className="flex flex-col gap-3 scroll-mt-4">
              <div className="flex items-center justify-between">
                <h2 id="unit-m-amen-t" className="m-0 text-lg font-bold">
                  Incluye {amenities.length} amenit{amenities.length === 1 ? 'y' : 'ies'}
                </h2>
                <TransitionLink href={`${basePath}/amenities`} className="h-11 flex items-center text-sm font-semibold">
                  Ver todos
                </TransitionLink>
              </div>
              {amenityThumbs.length > 0 ? (
                <div className="grid grid-cols-4 gap-2">
                  {amenityThumbs.map(a => (
                    <TransitionLink key={a.id} href={`${basePath}/amenities`} className="flex flex-col gap-1.5 min-w-0">
                      <span className="relative block w-full h-16 rounded-[10px] overflow-hidden bg-[#F4F5F6]">
                        <Image src={a.images[0]} alt="" fill sizes="90px" className="object-cover" />
                      </span>
                      <span className="text-[11px] font-semibold leading-[14px] line-clamp-2">{a.name}</span>
                    </TransitionLink>
                  ))}
                </div>
              ) : (
                <p className="m-0 text-sm text-[#5B6472]">{amenities.map(a => a.name).join(' · ')}</p>
              )}
            </section>
          )}

          {/* ── Ubicación ── */}
          {hasPointsOfInterest && (
            <TransitionLink
              id="unit-m-ubicacion"
              href={`${basePath}/ubicacion`}
              className="scroll-mt-4 flex items-center gap-3 min-h-16 px-3.5 rounded-[14px] bg-[#F4F5F6]"
            >
              <span className="w-10 h-10 rounded-[10px] bg-white flex items-center justify-center shrink-0">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z" /><circle cx="12" cy="9.5" r="2.5" /></svg>
              </span>
              <span className="flex-1 min-w-0 flex flex-col gap-0.5">
                <span className="text-[15px] font-bold">Ubicación y alrededores</span>
                <span className="text-xs text-[#5B6472]">Lugares cercanos y cómo llegar</span>
              </span>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 18l6-6-6-6" /></svg>
            </TransitionLink>
          )}

          {/* ── Misma tipología ── */}
          {sameTypeShown.length > 0 && (
            <section aria-labelledby="unit-m-same-t" className="flex flex-col">
              <h2 id="unit-m-same-t" className="m-0 mb-1 text-lg font-bold">Misma tipología</h2>
              {sameTypeShown.map(u => (
                <TransitionLink
                  key={u.id}
                  href={`${basePath}/edificio/${u.buildingId}/unidad/${u.id}`}
                  className="flex items-center gap-3 min-h-[60px] px-1 border-b border-[#ECEEF1]"
                >
                  <span className="text-base font-bold min-w-11">{u.name}</span>
                  <span className="flex-1 min-w-0 truncate text-[13px] text-[#5B6472]">
                    {[hasFloorStep ? (u.floor === 0 ? 'Planta baja' : `Piso ${u.floor}`) : '', `${u.totalArea} m²`].filter(Boolean).join(' · ')}
                  </span>
                  <span className="text-[15px] font-bold tabular-nums whitespace-nowrap">
                    {showPrice && u.price ? formatPrice(u.price, u.currency ?? 'USD') : showStatus ? getStatusLabel(u.status) : ''}
                  </span>
                </TransitionLink>
              ))}
              {sameType.length > sameTypeShown.length && (
                <TransitionLink href={`${basePath}/unidades`} className="h-11 flex items-center text-sm font-semibold">
                  Ver {sameType.length - sameTypeShown.length} más en Unidades
                </TransitionLink>
              )}
            </section>
          )}
        </main>
      </div>

      {/* ── Barra fija: precio y consulta ── */}
      {showLeads && (
        <div
          className="flex-none flex items-center gap-2.5 px-4 pt-2.5 bg-white shadow-[0_-1px_0_#ECEEF1,0_-8px_24px_rgba(17,24,39,0.06)]"
          style={{ paddingBottom: 'max(10px, env(safe-area-inset-bottom))' }}
        >
          <div className="flex-1 min-w-0 flex flex-col gap-0.5">
            <span className="text-[17px] font-bold truncate tabular-nums">{price ? formatPrice(price, currency) : title}</span>
            <span className="text-xs text-[#5B6472] truncate">{[typeLabel, `${unit.totalArea} m²`].filter(Boolean).join(' · ')}</span>
          </div>
          <button
            type="button"
            onClick={() => onContact('whatsapp')}
            aria-label="Consultar por WhatsApp"
            className="w-12 h-12 shrink-0 rounded-xl bg-[#22c55e] text-[#0b1f12] flex items-center justify-center"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 8.6 8.6 0 0 1-3.8-.9L3 21l1.9-5.2A8.4 8.4 0 1 1 21 11.5z" /></svg>
          </button>
          <button
            type="button"
            onClick={() => onContact()}
            className="h-12 shrink-0 px-[22px] rounded-xl bg-gray-900 text-white text-[15px] font-semibold"
          >
            Consultar
          </button>
        </div>
      )}
    </div>
  );
}

// ── Cuota ────────────────────────────────────────────────────────
// Misma fuente y fórmula que MortgageCalculatorModal: tasa, plazo máximo y
// anticipo mínimo del proyecto (/api/settings). La tasa la fija el
// proyecto, así que se muestra pero no se elige.
interface CalcSettings { interestRate: number; maxYears: number; minDownPayment: number }
const DEFAULT_SETTINGS: CalcSettings = { interestRate: 5.5, maxYears: 30, minDownPayment: 20 };

function QuotaCalculator({ price, currency, projectSlug }: { price: number; currency: string; projectSlug: string }) {
  const [settings, setSettings] = useState<CalcSettings>(DEFAULT_SETTINGS);
  const [down, setDown] = useState<number | null>(null);
  const [years, setYears] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    fetch(`/api/settings?projectSlug=${encodeURIComponent(projectSlug)}`)
      .then(res => res.json())
      .then(data => { if (alive && data && data.interestRate) setSettings(data); })
      .catch(() => {});
    return () => { alive = false; };
  }, [projectSlug]);

  const downOptions = [...new Set([0, 10, 20, 30].map(d => Math.min(settings.minDownPayment + d, 90)))];
  const yearOptions = [...new Set([Math.round(settings.maxYears / 3), Math.round((settings.maxYears * 2) / 3), settings.maxYears].map(y => Math.max(1, y)))];
  const downPct = down !== null && downOptions.includes(down) ? down : downOptions[0];
  const term = years !== null && yearOptions.includes(years) ? years : yearOptions[yearOptions.length - 1];

  const downAmount = (price * downPct) / 100;
  const loan = price - downAmount;
  const r = settings.interestRate / 100 / 12;
  const n = term * 12;
  const monthly = loan > 0 ? (r > 0 ? (loan * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1) : loan / n) : 0;

  return (
    <section aria-labelledby="unit-m-cuota" className="flex flex-col gap-3.5 px-4 py-[18px] rounded-2xl border border-[#E6E8EB]">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="unit-m-cuota" className="m-0 text-lg font-bold">Calculá tu cuota</h2>
        <span className="text-xs text-[#5B6472] whitespace-nowrap">sobre {formatPrice(price, currency)}</span>
      </div>
      <OptionRow label="Anticipo" options={downOptions} value={downPct} format={v => `${v}%`} onChange={setDown} />
      <OptionRow label="Plazo" options={yearOptions} value={term} format={v => `${v} año${v === 1 ? '' : 's'}`} onChange={setYears} />
      <div className="flex items-end justify-between gap-3 pt-3.5 border-t border-[#ECEEF1]">
        <div className="flex flex-col gap-0.5 min-w-0">
          <span className="text-xs text-[#5B6472]">Cuota mensual aprox.</span>
          <span className="text-[26px] leading-[30px] font-bold tabular-nums">{formatPrice(monthly, currency)}</span>
        </div>
        <div className="flex flex-col gap-0.5 text-right text-xs text-[#5B6472] tabular-nums">
          <span>Anticipo {formatPrice(downAmount, currency)}</span>
          <span>Financiás {formatPrice(loan, currency)}</span>
          <span>Tasa {String(settings.interestRate).replace('.', ',')}% anual</span>
        </div>
      </div>
      <p className="m-0 text-xs leading-[17px] text-[#5B6472]">
        Cálculo orientativo: solo capital e intereses. No incluye seguros, comisiones ni otros recargos.
      </p>
    </section>
  );
}

function OptionRow({ label, options, value, format, onChange }: {
  label: string;
  options: number[];
  value: number;
  format: (v: number) => string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex flex-col gap-2" role="group" aria-label={label}>
      <span className="text-[13px] font-semibold">{label}</span>
      <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
        {options.map(o => {
          const on = o === value;
          return (
            <button
              key={o}
              type="button"
              onClick={() => onChange(o)}
              aria-pressed={on}
              className={`h-11 rounded-[10px] text-sm font-semibold border transition-colors ${on ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-900 border-[#D5D9DE]'}`}
            >
              {format(o)}
            </button>
          );
        })}
      </div>
    </div>
  );
}
