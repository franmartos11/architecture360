'use client';

import { useState, useMemo, useCallback } from 'react';
import { Footprints, Bike, Car } from 'lucide-react';
import { TransitionLink as Link } from '@/components/ui/TransitionUtils';
import { useProjectBasePath } from '@/lib/project-base-path-context';
import { ProjectTypeProvider } from '@/lib/project-type-context';
import { pluralize } from '@/lib/units';
import { useContactModal } from '@/hooks/useContactModal';
import LeadCaptureModal from '@/components/ui/LeadCaptureModal';
import { POI_CATEGORY_LABELS, PoiCategoryIcon } from '@/lib/poiCategories';
import { POI_CATEGORY_COLORS } from '@/lib/poiCategoryColors';
import type { ProjectTypeConfig } from '@/lib/project-types';
import type { Project, PointOfInterest, PoiCategory } from '@/types';

interface LocationViewProps {
  project: Project;
  typeConfig: ProjectTypeConfig;
}

type Mode = 'walk' | 'bike' | 'drive';

const MODES: { key: Mode; label: string; upper: string; Icon: typeof Footprints; field: 'walkMinutes' | 'bikeMinutes' | 'driveMinutes'; dirflg: string; travelmode: string }[] = [
  { key: 'walk', label: 'Caminando', upper: 'CAMINANDO', Icon: Footprints, field: 'walkMinutes', dirflg: 'w', travelmode: 'walking' },
  { key: 'bike', label: 'En bici', upper: 'EN BICI', Icon: Bike, field: 'bikeMinutes', dirflg: 'b', travelmode: 'bicycling' },
  { key: 'drive', label: 'En auto', upper: 'EN AUTO', Icon: Car, field: 'driveMinutes', dirflg: 'd', travelmode: 'driving' },
];

function poiDestination(poi: PointOfInterest, projectLocation: string): string {
  return poi.latitude != null && poi.longitude != null
    ? `${poi.latitude},${poi.longitude}`
    : `${poi.name}, ${projectLocation}`;
}

function directionsHref(poi: PointOfInterest, projectLocation: string, mode: Mode) {
  const destination = poiDestination(poi, projectLocation);
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}&travelmode=${MODES.find(m => m.key === mode)!.travelmode}`;
}

// Minutos a mostrar para una POI en el modo activo — si ese modo no tiene
// dato cargado, cae a driveMinutes (con su propia etiqueta) antes que a
// distanceLabel, igual que ya hacía el visor viejo.
function minutesDisplay(poi: PointOfInterest, mode: Mode): { minutes: number; label: string } | null {
  const modeDef = MODES.find(m => m.key === mode)!;
  const direct = poi[modeDef.field];
  if (direct != null) return { minutes: direct, label: modeDef.upper };
  if (poi.driveMinutes != null) return { minutes: poi.driveMinutes, label: 'EN AUTO' };
  return null;
}

export default function LocationView({ project, typeConfig }: LocationViewProps) {
  return (
    <ProjectTypeProvider projectType={project.projectType} saleMode={project.saleMode}>
      <LocationViewInner project={project} typeConfig={typeConfig} />
    </ProjectTypeProvider>
  );
}

function LocationViewInner({ project, typeConfig }: LocationViewProps) {
  const basePath = useProjectBasePath();
  const [mode, setMode] = useState<Mode>('walk');
  const [category, setCategory] = useState<PoiCategory | 'all'>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [leadMessage, setLeadMessage] = useState<string | undefined>(undefined);

  const contactModal = useContactModal();
  const openLead = useCallback((message?: string) => {
    setLeadMessage(message);
    contactModal.open();
  }, [contactModal]);

  const hasCoords = project.latitude != null && project.longitude != null;
  const pois = project.pointsOfInterest;

  const categoriesPresent = useMemo(() => {
    const list: PoiCategory[] = [];
    pois.forEach(p => { if (!list.includes(p.category)) list.push(p.category); });
    return list;
  }, [pois]);

  const modeDef = MODES.find(m => m.key === mode)!;

  const filtered = useMemo(() => {
    return pois
      .filter(p => category === 'all' || p.category === category)
      .slice()
      .sort((a, b) => {
        const ma = a[modeDef.field], mb = b[modeDef.field];
        if (ma == null && mb == null) return (a.driveMinutes ?? Infinity) - (b.driveMinutes ?? Infinity);
        if (ma == null) return 1;
        if (mb == null) return -1;
        return ma - mb;
      });
  }, [pois, category, modeDef]);

  const bands = useMemo(() => {
    const defs = [
      { title: 'A PASOS · MENOS DE 5 MIN', test: (m: number | null) => m != null && m < 5 },
      { title: 'CERCA · 5 A 10 MIN', test: (m: number | null) => m != null && m >= 5 && m <= 10 },
      { title: 'EN LA ZONA · MÁS DE 10 MIN', test: (m: number | null) => m != null && m > 10 },
      { title: 'SOLO EN AUTO', test: (m: number | null) => m == null },
    ];
    return defs
      .map(b => ({
        title: b.title,
        items: filtered.filter(p => b.test(p[modeDef.field] ?? null)),
      }))
      .filter(g => g.items.length > 0);
  }, [filtered, modeDef]);

  const selected = selectedId ? pois.find(p => p.id === selectedId) ?? null : null;

  const mapSrc = hasCoords
    ? selected
      ? `https://maps.google.com/maps?saddr=${project.latitude},${project.longitude}&daddr=${encodeURIComponent(poiDestination(selected, project.location))}&dirflg=${modeDef.dirflg}&output=embed`
      : `https://maps.google.com/maps?q=${project.latitude},${project.longitude}&z=15&output=embed`
    : null;
  const mapsLink = hasCoords ? `https://www.google.com/maps/search/?api=1&query=${project.latitude},${project.longitude}` : null;

  const copyAddress = () => {
    if (navigator.clipboard) navigator.clipboard.writeText(project.location).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const heroStats = useMemo(() => {
    const stats: { value: string | number; label: string }[] = [];
    if (pois.length > 0) stats.push({ value: pois.length, label: 'LUGARES CERCA' });
    const walkable = pois.filter(p => p.walkMinutes != null && p.walkMinutes <= 10).length;
    if (walkable > 0) stats.push({ value: walkable, label: 'A MENOS DE 10 MIN CAMINANDO' });
    let nearest: { poi: PointOfInterest; minutes: number } | null = null;
    pois.forEach(p => {
      ([p.walkMinutes, p.bikeMinutes, p.driveMinutes] as (number | undefined)[]).forEach(v => {
        if (v != null && (!nearest || v < nearest.minutes)) nearest = { poi: p, minutes: v };
      });
    });
    if (nearest) stats.push({ value: `${(nearest as { poi: PointOfInterest; minutes: number }).minutes} min`, label: (nearest as { poi: PointOfInterest; minutes: number }).poi.name.toUpperCase() });
    return stats.slice(0, 3);
  }, [pois]);

  return (
    <div className="min-h-screen bg-trevo-dark">

      {/* ── Hero ──────────────────────────────────────────────── */}
      <div className="max-w-[1300px] mx-auto px-[16px] sm:px-[28px] pt-[26px]">
        <div className="flex items-center justify-between gap-[16px] flex-wrap">
          <Link href={basePath || '/'} className="text-[11px] font-medium tracking-[.16em] text-white/[.55] hover:text-white transition-colors">
            ← {project.name.toUpperCase()}
          </Link>
          <div className="flex gap-[8px]">
            <Link href={`${basePath}/unidades`} className="h-[34px] px-[14px] flex items-center border border-white/20 rounded-full text-[11.5px] font-medium text-white">
              {pluralize(typeConfig.unitLabel)}
            </Link>
            <Link href={`${basePath}/amenities`} className="h-[34px] px-[14px] flex items-center border border-white/20 rounded-full text-[11.5px] font-medium text-white">
              Amenities
            </Link>
          </div>
        </div>

        <div className="flex items-end justify-between gap-[30px] flex-wrap mt-[24px]">
          <div className="min-w-[280px] flex-1">
            <div className="font-semibold text-[11px] tracking-[.2em] text-trevo-lightgreen">EL ENTORNO</div>
            <div className="font-extralight text-[clamp(30px,4.4vw,44px)] leading-[1.1] text-white mt-[9px]">
              Todo lo que necesitás, <span className="font-medium">a pasos</span>
            </div>
            <div className="flex items-center gap-[12px] flex-wrap mt-[14px]">
              <div className="flex items-center gap-[8px]">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#83978c" strokeWidth="1.7" strokeLinecap="round"><path d="M12 21s7-6.3 7-11a7 7 0 1 0-14 0c0 4.7 7 11 7 11z" /><circle cx="12" cy="10" r="2.4" /></svg>
                <div className="font-normal text-[13px] text-white/[.72]">{project.location}</div>
              </div>
              <button
                onClick={copyAddress}
                className={
                  'h-[28px] px-[12px] flex items-center rounded-full cursor-pointer text-[11px] font-medium transition-colors ' +
                  (copied ? 'bg-trevo-green text-white' : 'bg-white/[.08] text-white/70')
                }
              >
                {copied ? 'Dirección copiada' : 'Copiar dirección'}
              </button>
            </div>
          </div>
          {heroStats.length > 0 && (
            <div className="flex gap-[24px] flex-wrap">
              {heroStats.map(s => (
                <div key={s.label} className="min-w-[96px]">
                  <div className="font-light text-[26px] leading-none text-white">{s.value}</div>
                  <div className="font-medium text-[9.5px] leading-[1.4] tracking-[.14em] text-white/45 mt-[7px]">{s.label}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Mapa + lista ─────────────────────────────────────── */}
      <div className={'max-w-[1300px] mx-auto px-[16px] sm:px-[28px] pt-[24px] pb-[80px] grid gap-[22px] items-start ' + (hasCoords ? 'grid-cols-[repeat(auto-fit,minmax(380px,1fr))]' : 'grid-cols-1')}>

        {hasCoords && (
          <div className="sticky top-[22px] flex flex-col gap-[12px]">
            <div className="relative border border-white/[.12] rounded-[18px] overflow-hidden bg-[#0f120f]">
              <iframe
                src={mapSrc!}
                title="Mapa de ubicación del proyecto"
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                className="block w-full border-0"
                style={{ height: 'min(62vh, 560px)' }}
              />
              <div className="absolute top-[12px] left-[12px] flex gap-[7px] flex-wrap max-w-[calc(100%-24px)]">
                <div className={
                  'h-[28px] px-[12px] flex items-center gap-[7px] rounded-full text-[11px] font-medium text-white backdrop-blur-md max-w-full overflow-hidden whitespace-nowrap text-ellipsis ' +
                  (selected ? 'bg-trevo-green' : 'bg-black/[.62]')
                }>
                  {selected
                    ? `Recorrido a ${selected.name} · ${minutesDisplay(selected, mode)?.minutes ?? selected.driveMinutes ?? '—'} min`
                    : `${project.name} · ${project.location}`}
                </div>
                {selected && (
                  <button
                    onClick={() => setSelectedId(null)}
                    className="h-[28px] px-[11px] flex items-center gap-[6px] bg-black/[.62] backdrop-blur-md rounded-full text-[11px] font-medium text-white cursor-pointer"
                  >
                    Volver al proyecto ×
                  </button>
                )}
              </div>
            </div>
            <div className="flex items-center gap-[10px] flex-wrap">
              <a href={mapsLink!} target="_blank" rel="noopener noreferrer" className="h-[36px] px-[15px] flex items-center gap-[7px] border border-white/20 rounded-full text-[11.5px] font-medium text-white">
                Abrir en Google Maps ↗
              </a>
              <div className="font-light text-[11px] leading-[1.5] text-white/[.42]">
                {selected ? 'Tocá otro lugar de la lista para cambiar el recorrido.' : 'Tocá cualquier lugar de la lista y el mapa traza el recorrido.'}
              </div>
            </div>
          </div>
        )}

        <div className="flex flex-col gap-[16px] min-w-0">

          <div className="flex gap-[6px] p-[5px] bg-white/[.07] rounded-[14px]">
            {MODES.map(m => (
              <button
                key={m.key}
                onClick={() => setMode(m.key)}
                className={
                  'flex-1 h-[36px] flex items-center justify-center gap-[7px] rounded-[10px] cursor-pointer whitespace-nowrap transition-all text-[12px] ' +
                  (mode === m.key ? 'font-semibold bg-white text-trevo-dark' : 'font-medium text-white/65')
                }
              >
                <m.Icon className="w-[15px] h-[15px]" strokeWidth={1.7} />
                {m.label}
              </button>
            ))}
          </div>

          {categoriesPresent.length > 0 && (
            <div className="flex gap-[8px] flex-wrap">
              <CatChip active={category === 'all'} onClick={() => setCategory('all')}>
                Todo el entorno · {pois.length}
              </CatChip>
              {categoriesPresent.map(c => (
                <CatChip key={c} active={category === c} onClick={() => setCategory(category === c ? 'all' : c)} dotColor={POI_CATEGORY_COLORS[c]}>
                  {POI_CATEGORY_LABELS[c]} · {pois.filter(p => p.category === c).length}
                </CatChip>
              ))}
            </div>
          )}

          <div className="font-normal text-[11.5px] text-white/50">
            {pois.length === 0
              ? 'Todavía no hay puntos de interés cargados.'
              : (category === 'all' ? `${pois.length} lugares del entorno` : `${filtered.length} en ${POI_CATEGORY_LABELS[category]}`) +
                ` · ordenados por tiempo ${modeDef.label.toLowerCase()}`}
          </div>

          {pois.length > 0 && filtered.length === 0 && (
            <div className="border border-white/[.12] rounded-[16px] p-[36px_22px] text-center">
              <div className="font-light text-[17px] text-white">Nada en esa categoría</div>
              <button onClick={() => setCategory('all')} className="h-[36px] px-[18px] inline-flex items-center bg-white rounded-full text-[12px] font-semibold text-trevo-dark cursor-pointer mt-[16px]">
                Ver todo el entorno
              </button>
            </div>
          )}

          {bands.map(g => (
            <div key={g.title} className="flex flex-col gap-[9px]">
              <div className="flex items-center gap-[11px]">
                <div className="font-semibold text-[10.5px] tracking-[.16em] text-trevo-lightgreen whitespace-nowrap">{g.title}</div>
                <div className="flex-1 h-px bg-white/10" />
                <div className="font-normal text-[10.5px] text-white/40">{g.items.length} {g.items.length === 1 ? 'lugar' : 'lugares'}</div>
              </div>
              {g.items.map(p => {
                const active = selectedId === p.id;
                const disp = minutesDisplay(p, mode);
                return (
                  <div
                    key={p.id}
                    onClick={hasCoords ? () => setSelectedId(active ? null : p.id) : undefined}
                    className={
                      'flex items-center gap-[13px] p-[12px_14px] rounded-[14px] transition-all border ' +
                      (hasCoords ? 'cursor-pointer ' : '') +
                      (active ? 'border-white/40 bg-white/10' : 'border-white/10 bg-white/[.035] hover:border-white/25')
                    }
                  >
                    <div
                      className="w-[38px] h-[38px] flex-none flex items-center justify-center rounded-[11px]"
                      style={{ color: active ? '#fff' : POI_CATEGORY_COLORS[p.category], background: active ? POI_CATEGORY_COLORS[p.category] : 'rgba(255,255,255,.07)' }}
                    >
                      <PoiCategoryIcon category={p.category} className="w-[18px] h-[18px]" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-[13.5px] text-white overflow-hidden text-ellipsis whitespace-nowrap">{p.name}</div>
                      <div className="font-light text-[11.5px] leading-[1.5] text-white/55 mt-[2px] overflow-hidden text-ellipsis whitespace-nowrap">
                        {POI_CATEGORY_LABELS[p.category]}{p.description ? ` · ${p.description}` : ''}
                      </div>
                    </div>
                    <div className="flex-none text-right">
                      <div className={'font-semibold text-[14px] ' + (active ? 'text-white' : 'text-white/90')}>
                        {disp ? `${disp.minutes} min` : p.distanceLabel ?? '—'}
                      </div>
                      <div className="font-normal text-[9.5px] tracking-[.1em] text-white/40 mt-[3px]">{disp?.label ?? ''}</div>
                    </div>
                    <a
                      href={directionsHref(p, project.location, mode)}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={e => e.stopPropagation()}
                      className="flex-none w-[30px] h-[30px] flex items-center justify-center rounded-[9px] border border-white/[.16] text-white hover:bg-white/10 transition-colors"
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M5 19L19 5" /><path d="M9 5h10v10" /></svg>
                    </a>
                  </div>
                );
              })}
            </div>
          ))}

          <div className="border border-dashed border-white/20 rounded-[16px] p-[20px] flex items-center justify-between gap-[16px] flex-wrap bg-trevo-lightgreen/[.08]">
            <div className="min-w-[200px] flex-1">
              <div className="font-medium text-[14px] text-white">¿Querés ver el barrio en persona?</div>
              <div className="font-light text-[12px] leading-[1.6] text-white/[.58] mt-[4px]">Coordinamos una recorrida por la zona y la obra.</div>
            </div>
            <button
              onClick={() => openLead('Hola, quiero coordinar una recorrida por la zona y la obra.')}
              className="h-[38px] px-[18px] flex items-center bg-white rounded-full text-[12px] font-semibold text-trevo-dark cursor-pointer flex-none"
            >
              Agendar visita
            </button>
          </div>

        </div>
      </div>

      {typeConfig.showLeads && (
        <LeadCaptureModal
          isOpen={contactModal.isOpen}
          onClose={contactModal.close}
          unit={null}
          projectSlug={project.slug}
          defaultMethod={contactModal.method}
          initialMessage={leadMessage}
        />
      )}
    </div>
  );
}

function CatChip({ active, onClick, dotColor, children }: { active: boolean; onClick: () => void; dotColor?: string; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={
        'h-[30px] px-[13px] flex items-center rounded-full whitespace-nowrap transition-all text-[11px] cursor-pointer ' +
        (active ? 'font-semibold bg-white text-trevo-dark' : 'font-medium bg-white/[.07] text-white/65')
      }
    >
      {dotColor && <span className="w-[7px] h-[7px] rounded-full flex-none mr-[7px]" style={{ background: dotColor }} />}
      {children}
    </button>
  );
}
