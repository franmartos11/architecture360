'use client';

import Image from 'next/image';
import { TransitionLink as Link } from '@/components/ui/TransitionUtils';
import { shimmerDataUrl } from '@/lib/imagePlaceholder';
import { formatPrice, getStatusColor, unitIsDwelling, unitCategory, UNIT_CATEGORY_LABEL } from '@/lib/units';
import type { FloorParkingSpot } from '@/lib/floor-explorer';
import type { Amenity, Unit } from '@/types';

export const AMENITY_COLOR = '#968676';
export const AMENITY_TEXT = '#6f604f';

const STATUS_TEXT: Record<string, string> = { available: '#15803d', reserved: '#a16207', sold: '#b91c1c' };
const STATUS_SHORT: Record<string, string> = { available: 'Disponible', reserved: 'Reservado', sold: 'Vendido' };

function Chevron({ color = 'currentColor' }: { color?: string }) {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" className="shrink-0">
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

export function AmenityMarkerIcon({ color = AMENITY_COLOR, size = 10 }: { color?: string; size?: number }) {
  return <span className="block rounded-[2px] shrink-0" style={{ width: size, height: size, border: `2px solid ${color}` }} />;
}

const SECTION_TITLE = 'text-[10px] font-semibold tracking-[0.16em] text-[#968676] mt-[22px]';

function SpecGrid({ specs }: { specs: { key: string; value: string }[] }) {
  if (specs.length === 0) return null;
  return (
    <div className="grid grid-cols-3 gap-px mt-4 bg-gray-200/70 border border-gray-200/70 rounded-[11px] overflow-hidden">
      {specs.slice(0, 3).map(s => (
        <div key={s.key} className="bg-white px-[11px] py-2.5 min-w-0">
          <p className="text-[8.5px] font-semibold tracking-[0.13em] uppercase text-[#968676] truncate">{s.key}</p>
          <p className="text-[12.5px] leading-snug font-medium text-gray-900 mt-1 break-words">{s.value}</p>
        </div>
      ))}
    </div>
  );
}

export function NextAvailableCard({ caption, label, onClick }: { caption: string; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="mt-5 p-[13px] bg-emerald-50 border border-emerald-100 rounded-[11px] flex items-center gap-2.5 text-left hover:bg-emerald-100/70 transition-colors w-full"
    >
      <div className="min-w-0 flex-1">
        <p className="text-[9.5px] font-semibold tracking-[0.13em] text-emerald-700">{caption}</p>
        <p className="text-[12.5px] font-medium text-gray-900 mt-1">{label}</p>
      </div>
      <Chevron color="#047857" />
    </button>
  );
}

// ── "Incluye": cocheras de la unidad + acceso a las amenities ──────────
export function IncludesBlock({
  unit, canGoSpot, onGoSpot, amenityCount, amenityWhere, onGoAmenities,
}: {
  unit: Unit;
  /** Si la cochera está en un piso de esta torre (se puede mostrar en el plano). */
  canGoSpot: (floorId: string) => boolean;
  onGoSpot: (index: number) => void;
  amenityCount: number;
  amenityWhere: string;
  onGoAmenities?: () => void;
}) {
  const spots = (unit.parkingSpots ?? []).filter(s => s.polygon.length >= 3 && canGoSpot(s.floorId));
  if (spots.length === 0 && (amenityCount === 0 || !onGoAmenities)) return null;
  return (
    <>
      <h4 className={SECTION_TITLE}>INCLUYE</h4>
      <div className="flex flex-col gap-[7px] mt-2.5">
        {spots.map((spot, i) => (
          <button
            key={i}
            onClick={() => onGoSpot(unit.parkingSpots!.indexOf(spot))}
            className="flex items-center gap-[11px] px-3 py-2.5 border border-gray-200 rounded-[11px] text-left hover:border-emerald-700 transition-colors"
          >
            <span className="w-[30px] h-[30px] rounded-[7px] bg-[#f1efea] flex items-center justify-center text-[11px] font-bold text-gray-700 shrink-0">P</span>
            <span className="flex-1 min-w-0">
              <span className="block text-[12.5px] font-semibold text-gray-900">{spot.label ? `Cochera ${spot.label}` : 'Cochera'}</span>
              <span className="block text-[11px] text-gray-400 mt-0.5 truncate">{spot.floorLabel ? `${spot.floorLabel} · ` : ''}ver en el plano</span>
            </span>
            <Chevron color="#83978c" />
          </button>
        ))}
        {amenityCount > 0 && onGoAmenities && (
          <button
            onClick={onGoAmenities}
            className="flex items-center gap-[11px] px-3 py-2.5 border border-gray-200 rounded-[11px] text-left hover:border-emerald-700 transition-colors"
          >
            <span className="w-[30px] h-[30px] rounded-[7px] bg-[#f4f0ea] flex items-center justify-center shrink-0"><AmenityMarkerIcon /></span>
            <span className="flex-1 min-w-0">
              <span className="block text-[12.5px] font-semibold text-gray-900">{amenityCount} amenit{amenityCount === 1 ? 'y' : 'ies'} de uso común</span>
              {amenityWhere && <span className="block text-[11px] text-gray-400 mt-0.5">{amenityWhere}</span>}
            </span>
            <Chevron color="#83978c" />
          </button>
        )}
      </div>
    </>
  );
}

// ── Panel de una amenity seleccionada en el plano ──────────────────────
export function AmenityPanel({
  amenity, floorLabel, tourHref, amenitiesHref, siblings, siblingsTitle, siblingFloorLabel, onSelectSibling, next,
}: {
  amenity: Amenity;
  floorLabel: string;
  tourHref: string | null;
  amenitiesHref: string;
  siblings: Amenity[];
  siblingsTitle: string;
  siblingFloorLabel: (a: Amenity) => string;
  onSelectSibling: (a: Amenity) => void;
  next?: { label: string; onClick: () => void } | null;
}) {
  return (
    <div className="flex flex-col">
      <div className="relative h-[200px] bg-[#eceae5] shrink-0">
        {amenity.images[0] && (
          <Image
            src={amenity.images[0]}
            alt={amenity.name}
            fill
            sizes="(max-width: 768px) 100vw, 336px"
            placeholder="blur"
            blurDataURL={shimmerDataUrl(336, 200)}
            className="object-cover"
          />
        )}
        <div className="absolute top-3 left-3 flex items-center gap-1.5 px-2.5 py-1 bg-white/95 rounded-full">
          <AmenityMarkerIcon size={8} />
          <span className="text-[9.5px] font-bold tracking-[0.12em]" style={{ color: AMENITY_TEXT }}>AMENITY · USO COMÚN</span>
        </div>
      </div>
      <div className="p-[18px] pb-5">
        <div className="flex items-baseline justify-between gap-2.5">
          <h2 className="text-[23px] leading-[1.1] font-semibold text-gray-900">{amenity.name}</h2>
          <span className="text-[11px] font-medium text-[#83978c] whitespace-nowrap">{floorLabel}</span>
        </div>
        {amenity.description && (
          <p className="text-[12.5px] leading-[1.65] text-[#5c6660] mt-2.5 text-pretty line-clamp-5">{amenity.description}</p>
        )}
        <SpecGrid specs={amenity.specs ?? []} />
        {tourHref && (
          <Link
            href={tourHref}
            className="mt-4 h-[46px] flex items-center justify-center gap-2 bg-[#1b1e1c] hover:bg-[#333833] rounded-[11px] text-white font-semibold text-[13px] transition-colors"
          >
            Recorrer en 360°
            <Chevron />
          </Link>
        )}
        <Link
          href={amenitiesHref}
          className="mt-2 h-10 flex items-center justify-center border border-gray-200 rounded-[11px] text-xs font-medium text-gray-700 hover:border-emerald-700 hover:text-emerald-700 transition-colors"
        >
          Ver en Amenidades
        </Link>

        {siblings.length > 0 && (
          <>
            <h4 className={SECTION_TITLE}>{siblingsTitle}</h4>
            <div className="flex flex-col gap-1.5 mt-2.5">
              {siblings.map(o => (
                <button key={o.id} onClick={() => onSelectSibling(o)} className="flex items-center gap-[11px] p-1.5 rounded-[10px] text-left hover:bg-gray-50 transition-colors">
                  <span className="relative w-[46px] h-9 rounded-[7px] overflow-hidden bg-gray-100 shrink-0">
                    {o.images[0] && <Image src={o.images[0]} alt="" fill sizes="46px" className="object-cover" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[12.5px] font-semibold text-gray-900 truncate">{o.name}</span>
                    <span className="block text-[11px] text-[#83978c] mt-0.5 truncate">
                      {[siblingFloorLabel(o), o.specs?.[0]?.value].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </>
        )}

        {next && <NextAvailableCard caption="VER UNIDADES DISPONIBLES" label={next.label} onClick={next.onClick} />}
      </div>
    </div>
  );
}

// ── Panel de una cochera seleccionada en el piso de cocheras ───────────
export function SpotPanel({
  spot, floorLabel, buildingName, showStatus, showPrice, onGoOwner,
}: {
  spot: FloorParkingSpot;
  floorLabel: string;
  buildingName: string;
  showStatus: boolean;
  showPrice: boolean;
  onGoOwner: () => void;
}) {
  const own = spot.unit;
  const color = showStatus ? getStatusColor(own.status) : '#83978c';
  const statusLabel = own.status === 'available' ? 'DISPONIBLE CON SU UNIDAD' : STATUS_SHORT[own.status]?.toUpperCase();
  return (
    <div className="flex flex-col">
      <div className="relative h-[150px] bg-[#1b1e1c] flex flex-col justify-end p-[18px] shrink-0">
        {showStatus && (
          <div className="absolute top-3.5 left-3.5 flex items-center gap-1.5 px-2.5 py-1 bg-white/95 rounded-full">
            <span className="w-[7px] h-[7px] rounded-full" style={{ background: color }} />
            <span className="text-[9.5px] font-bold tracking-[0.12em]" style={{ color: STATUS_TEXT[own.status] }}>{statusLabel}</span>
          </div>
        )}
        <p className="text-[10px] font-semibold tracking-[0.16em] text-white/60">COCHERA</p>
        <p className="text-[40px] leading-none font-light text-white mt-1.5 truncate">{spot.spot.label || own.name}</p>
      </div>
      <div className="p-[18px] pb-5">
        <p className="text-[12.5px] text-[#5c6660]">{floorLabel} · {buildingName}</p>

        <h4 className={SECTION_TITLE}>{showStatus && own.status === 'sold' ? 'SE VENDIÓ JUNTO CON' : 'INCLUIDA CON LA UNIDAD'}</h4>
        <button
          onClick={onGoOwner}
          className="mt-2.5 w-full flex items-center gap-3 p-2 border border-gray-200 rounded-xl text-left hover:border-emerald-700 transition-colors"
        >
          <span className="relative w-16 h-[52px] rounded-lg overflow-hidden bg-gray-100 shrink-0">
            {own.interiorImageUrl && <Image src={own.interiorImageUrl} alt="" fill sizes="64px" className="object-cover" />}
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-[7px]">
              {showStatus && <span className="w-[7px] h-[7px] rounded-full shrink-0" style={{ background: color }} />}
              <span className="text-[13px] font-semibold text-gray-900 truncate">{own.name}</span>
            </span>
            <span className="block text-[11px] text-[#83978c] mt-[3px] truncate">
              {own.floor === 0 ? 'Planta baja' : `Piso ${own.floor}`} · {unitIsDwelling(own) ? `${own.bedrooms} dorm` : UNIT_CATEGORY_LABEL[unitCategory(own)]} · {own.totalArea} m²
            </span>
            {showPrice && own.price ? (
              <span className="block text-xs font-semibold text-emerald-700 mt-[3px]">{formatPrice(own.price, own.currency)}</span>
            ) : null}
          </span>
        </button>
        <button
          onClick={onGoOwner}
          className="mt-3.5 w-full h-[46px] flex items-center justify-center gap-2 bg-emerald-700 hover:bg-emerald-800 rounded-[11px] text-white font-semibold text-[13px] transition-colors"
        >
          Ver la unidad {own.name}
          <Chevron />
        </button>
      </div>
    </div>
  );
}
