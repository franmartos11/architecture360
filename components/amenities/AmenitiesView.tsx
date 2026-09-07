'use client';

import { useState, useMemo, useCallback } from 'react';
import Image from 'next/image';
import { TransitionLink as Link } from '@/components/ui/TransitionUtils';
import { useProjectBasePath } from '@/lib/project-base-path-context';
import { ProjectTypeProvider } from '@/lib/project-type-context';
import { shimmerDataUrl } from '@/lib/imagePlaceholder';
import { pluralize } from '@/lib/units';
import type { ProjectTypeConfig } from '@/lib/project-types';
import { useContactModal } from '@/hooks/useContactModal';
import LeadCaptureModal from '@/components/ui/LeadCaptureModal';
import AmenityDetailModal from './AmenityDetailModal';
import EyeIcon from '@/components/ui/icons/EyeIcon';
import type { Project, Amenity, Building } from '@/types';

interface AmenitiesViewProps {
  project: Project;
  /** Preselecciona el filtro por torre, ej. al llegar desde la unidad de un edificio específico */
  initialBuildingFilter?: string;
  typeConfig: ProjectTypeConfig;
}

type Vista = 'mosaic' | 'list';

function zoneLabel(a: Amenity, buildings: Building[]): string {
  if (!a.buildingId) return 'Todo el complejo';
  return buildings.find(b => b.id === a.buildingId)?.name ?? 'Todo el complejo';
}

export default function AmenitiesView(props: AmenitiesViewProps) {
  return (
    <ProjectTypeProvider projectType={props.project.projectType} saleMode={props.project.saleMode}>
      <AmenitiesViewInner {...props} />
    </ProjectTypeProvider>
  );
}

function AmenitiesViewInner({ project, initialBuildingFilter, typeConfig }: AmenitiesViewProps) {
  const basePath = useProjectBasePath();
  const [zone, setZone] = useState<string>(
    initialBuildingFilter && project.buildings.some(b => b.id === initialBuildingFilter)
      ? initialBuildingFilter
      : 'all'
  );
  const [category, setCategory] = useState<string>('all');
  const [only360, setOnly360] = useState(false);
  const [vista, setVista] = useState<Vista>('mosaic');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [leadMessage, setLeadMessage] = useState<string | undefined>(undefined);

  const contactModal = useContactModal();
  const openLead = useCallback((message?: string) => {
    setLeadMessage(message);
    contactModal.open();
  }, [contactModal]);

  const categoriesPresent = useMemo(() => {
    const list: string[] = [];
    project.amenities.forEach(a => { if (a.category && !list.includes(a.category)) list.push(a.category); });
    return list;
  }, [project.amenities]);

  const hasTours = useMemo(() => project.amenities.some(a => a.tourNodeId), [project.amenities]);

  const matchesZone = useCallback((a: Amenity) => {
    if (zone === 'all') return true;
    if (zone === 'complex') return !a.buildingId;
    return a.buildingId === zone || !a.buildingId;
  }, [zone]);

  const filtered = useMemo(() => project.amenities.filter(a =>
    matchesZone(a) &&
    (category === 'all' || a.category === category) &&
    (!only360 || !!a.tourNodeId)
  ), [project.amenities, matchesZone, category, only360]);

  const zoneCount = useCallback((z: string) => project.amenities.filter(a => {
    if (z === 'all') return true;
    if (z === 'complex') return !a.buildingId;
    return a.buildingId === z || !a.buildingId;
  }).length, [project.amenities]);

  const clearAll = () => { setZone('all'); setCategory('all'); setOnly360(false); };

  const featured = project.amenities[0];
  const cur = activeId ? project.amenities.find(a => a.id === activeId) ?? null : null;
  const curIndex = cur ? filtered.findIndex(a => a.id === cur.id) : -1;
  const prevAmenity = curIndex >= 0 && filtered.length > 0 ? filtered[(curIndex - 1 + filtered.length) % filtered.length] : null;
  const nextAmenity = curIndex >= 0 && filtered.length > 0 ? filtered[(curIndex + 1) % filtered.length] : null;

  const unitLabelPlural = pluralize(typeConfig.unitLabel);

  if (project.amenities.length === 0) {
    return (
      <div className="min-h-screen bg-trevo-dark">
        <div className="max-w-[1240px] mx-auto px-[16px] sm:px-[28px] pt-[26px]">
          <Link href={basePath || '/'} className="text-[11px] font-medium tracking-[.16em] text-white/[.55] hover:text-white transition-colors">
            ← {project.name.toUpperCase()}
          </Link>
        </div>
        <div className="text-center py-20 text-white/40 font-light">Todavía no hay amenidades cargadas.</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-trevo-dark">

      {/* ── Hero ──────────────────────────────────────────────── */}
      <div className="max-w-[1240px] mx-auto px-[16px] sm:px-[28px] pt-[26px]">
        <div className="flex items-center justify-between gap-[16px] flex-wrap">
          <Link href={basePath || '/'} className="text-[11px] font-medium tracking-[.16em] text-white/[.55] hover:text-white transition-colors">
            ← {project.name.toUpperCase()}
          </Link>
          <div className="flex gap-[8px]">
            <Link href={`${basePath}/unidades`} className="h-[34px] px-[14px] flex items-center border border-white/20 rounded-full text-[11.5px] font-medium text-white">
              {unitLabelPlural}
            </Link>
            <Link href={`${basePath}/ubicacion`} className="h-[34px] px-[14px] flex items-center border border-white/20 rounded-full text-[11.5px] font-medium text-white">
              Ubicación
            </Link>
          </div>
        </div>

        <div className="flex items-end justify-between gap-[34px] flex-wrap mt-[26px]">
          <div className="min-w-[280px] flex-1">
            <div className="font-semibold text-[11px] tracking-[.2em] text-trevo-lightgreen">ESPACIOS COMUNES</div>
            <div className="font-extralight text-[clamp(32px,4.6vw,48px)] leading-[1.08] text-white mt-[10px]">
              La vida <span className="font-medium">fuera del departamento</span>
            </div>
            <div className="font-light text-[13.5px] leading-[1.65] text-white/60 mt-[12px] max-w-[480px] text-pretty">
              {project.amenities.length} espacio{project.amenities.length === 1 ? '' : 's'} pensado{project.amenities.length === 1 ? '' : 's'} para el día a día.
              {hasTours ? ' Recorrelos en 360°, ' : ' Mirá '}mirá en qué torre está cada uno y qué se puede hacer ahí.
            </div>
          </div>
          <div className="flex gap-[26px] flex-wrap">
            <Stat value={project.amenities.length} label="ESPACIOS" />
            {hasTours && <Stat value={project.amenities.filter(a => a.tourNodeId).length} label="CON 360°" />}
            {categoriesPresent.length > 0 && <Stat value={categoriesPresent.length} label="CATEGORÍAS" />}
          </div>
        </div>
      </div>

      {/* ── Destacado ─────────────────────────────────────────── */}
      {featured && (
        <div className="max-w-[1240px] mx-auto px-[16px] sm:px-[28px] mt-[26px]">
          <button
            onClick={() => setActiveId(featured.id)}
            className="relative w-full text-left rounded-[20px] overflow-hidden cursor-pointer bg-[#26302b] min-h-[340px] flex items-end"
          >
            {featured.images[0] && (
              <Image
                src={featured.images[0]}
                alt={featured.name}
                fill
                sizes="100vw"
                placeholder="blur"
                blurDataURL={shimmerDataUrl(1240, 340)}
                className="object-cover"
              />
            )}
            <div className="absolute inset-0 bg-gradient-to-r from-[#0f1210]/90 via-[#0f1210]/[.55] to-[#0f1210]/[.15]" />
            <div className="relative p-[30px_32px] max-w-[560px] flex flex-col gap-[11px]">
              <div className="flex items-center gap-[9px] flex-wrap">
                <div className="h-[24px] px-[10px] flex items-center bg-white rounded-full text-[10px] font-semibold tracking-[.12em] text-trevo-dark">DESTACADO</div>
                <div className="h-[24px] px-[10px] flex items-center bg-white/[.14] rounded-full text-[10.5px] font-medium text-white">{zoneLabel(featured, project.buildings)}</div>
              </div>
              <div className="font-light text-[32px] leading-[1.15] text-white">{featured.name}</div>
              {featured.description && (
                <div className="font-light text-[13px] leading-[1.65] text-white/[.72] max-w-[430px]">{featured.description}</div>
              )}
              {!!featured.specs?.length && (
                <div className="flex gap-[16px] flex-wrap mt-[2px]">
                  {featured.specs.slice(0, 3).map(s => (
                    <div key={s.key}>
                      <div className="font-medium text-[9.5px] tracking-[.14em] text-white/45">{s.key}</div>
                      <div className="font-normal text-[12.5px] text-white mt-[3px]">{s.value}</div>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex gap-[9px] flex-wrap mt-[8px]">
                {featured.tourNodeId && (
                  <div className="h-[40px] px-[18px] flex items-center gap-[8px] bg-white rounded-full text-[12.5px] font-semibold text-trevo-dark">
                    <EyeIcon className="w-[15px] h-[15px]" strokeWidth={1.8} />
                    Recorrer en 360°
                  </div>
                )}
                {featured.images.length > 0 && (
                  <div className="h-[40px] px-[18px] flex items-center border border-white/[.28] rounded-full text-[12.5px] font-medium text-white">
                    Ver {featured.images.length === 1 ? 'la foto' : `las ${featured.images.length} fotos`}
                  </div>
                )}
              </div>
            </div>
          </button>
        </div>
      )}

      {/* ── Filtros (sticky) ─────────────────────────────────── */}
      <div className="sticky top-0 z-20 bg-trevo-dark/90 backdrop-blur-md border-b border-white/[.08] mt-[26px]">
        <div className="max-w-[1240px] mx-auto px-[16px] sm:px-[28px] py-[12px] flex items-center gap-[14px] flex-wrap">
          {project.buildings.length > 0 && (
            <div className="flex gap-[8px] flex-wrap">
              <DarkChip active={zone === 'all'} onClick={() => setZone('all')}>Todas · {zoneCount('all')}</DarkChip>
              <DarkChip active={zone === 'complex'} onClick={() => setZone('complex')}>Todo el complejo · {zoneCount('complex')}</DarkChip>
              {project.buildings.map(b => (
                <DarkChip key={b.id} active={zone === b.id} onClick={() => setZone(b.id)}>{b.name} · {zoneCount(b.id)}</DarkChip>
              ))}
            </div>
          )}
          {project.buildings.length > 0 && categoriesPresent.length > 0 && (
            <div className="w-px h-[22px] bg-white/[.14]" />
          )}
          {categoriesPresent.length > 0 && (
            <div className="flex gap-[8px] flex-wrap">
              <DarkChip active={category === 'all'} onClick={() => setCategory('all')}>Todo</DarkChip>
              {categoriesPresent.map(c => (
                <DarkChip key={c} active={category === c} onClick={() => setCategory(category === c ? 'all' : c)}>{c}</DarkChip>
              ))}
            </div>
          )}
          <div className="flex-1 min-w-[10px]" />
          {hasTours && (
            <button
              onClick={() => setOnly360(v => !v)}
              className={
                'h-[32px] px-[14px] flex items-center gap-[7px] rounded-full whitespace-nowrap text-[11.5px] transition-colors ' +
                (only360 ? 'font-semibold bg-white text-trevo-dark' : 'font-medium bg-white/[.08] text-white/70')
              }
            >
              <EyeIcon className="w-[13px] h-[13px]" strokeWidth={1.8} />
              Con recorrido 360°
            </button>
          )}
          <div className="flex border border-white/[.18] rounded-full overflow-hidden">
            <button
              onClick={() => setVista('mosaic')}
              className={'h-[30px] px-[13px] flex items-center text-[11.5px] font-medium ' + (vista === 'mosaic' ? 'bg-white text-trevo-dark' : 'text-white/60')}
            >
              Mosaico
            </button>
            <button
              onClick={() => setVista('list')}
              className={'h-[30px] px-[13px] flex items-center text-[11.5px] font-medium ' + (vista === 'list' ? 'bg-white text-trevo-dark' : 'text-white/60')}
            >
              Lista
            </button>
          </div>
        </div>
      </div>

      {/* ── Contenido ────────────────────────────────────────── */}
      <div className="max-w-[1240px] mx-auto px-[16px] sm:px-[28px] pt-[24px] pb-[80px]">
        <div className="font-normal text-[12px] text-white/50 mb-[16px]">
          {filtered.length === project.amenities.length
            ? `${project.amenities.length} espacio${project.amenities.length === 1 ? '' : 's'} comun${project.amenities.length === 1 ? '' : 'es'}`
            : `${filtered.length} de ${project.amenities.length} espacios`}
        </div>

        {filtered.length === 0 ? (
          <div className="border border-white/[.12] rounded-[18px] p-[52px_26px] text-center">
            <div className="font-light text-[20px] text-white">Nada con esos filtros</div>
            <div className="font-light text-[12.5px] leading-[1.6] text-white/[.55] mt-[8px] max-w-[380px] mx-auto">
              Probá quitar la categoría o mirar los espacios de todo el complejo.
            </div>
            <button onClick={clearAll} className="h-[40px] px-[20px] inline-flex items-center bg-white rounded-full text-[12.5px] font-semibold text-trevo-dark cursor-pointer mt-[20px]">
              Ver todos los espacios
            </button>
          </div>
        ) : vista === 'mosaic' ? (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(268px,1fr))] gap-[18px]">
            {filtered.map(a => (
              <AmenityCard
                key={a.id}
                amenity={a}
                place={zoneLabel(a, project.buildings)}
                onClick={() => setActiveId(a.id)}
              />
            ))}

            <div className="border border-dashed border-white/20 rounded-[18px] p-[22px] flex flex-col justify-center gap-[11px] bg-trevo-lightgreen/[.08]">
              <div className="font-semibold text-[10.5px] tracking-[.16em] text-trevo-lightgreen">VISITA GUIADA</div>
              <div className="font-light text-[19px] leading-[1.3] text-white text-pretty">Conocelos en persona</div>
              <div className="font-light text-[12px] leading-[1.6] text-white/[.58]">Coordinamos una recorrida por la obra y los espacios comunes terminados.</div>
              <button
                onClick={() => openLead('Hola, quiero coordinar una recorrida por la obra y los espacios comunes.')}
                className="h-[38px] px-[18px] self-start flex items-center bg-white rounded-full text-[12px] font-semibold text-trevo-dark cursor-pointer mt-[4px]"
              >
                Agendar visita
              </button>
            </div>
          </div>
        ) : (
          <div className="border border-white/[.1] rounded-[18px] overflow-hidden">
            {filtered.map(a => (
              <AmenityRow
                key={a.id}
                amenity={a}
                place={zoneLabel(a, project.buildings)}
                onClick={() => setActiveId(a.id)}
              />
            ))}
          </div>
        )}
      </div>

      <AmenityDetailModal
        amenity={cur}
        building={project.buildings.find(b => b.id === cur?.buildingId)}
        onClose={() => setActiveId(null)}
        onRequestVisit={name => openLead(`Hola, quiero agendar una visita para conocer ${name}.`)}
        prevName={prevAmenity?.name}
        nextName={nextAmenity?.name}
        onPrev={prevAmenity ? () => setActiveId(prevAmenity.id) : undefined}
        onNext={nextAmenity ? () => setActiveId(nextAmenity.id) : undefined}
      />

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

function Stat({ value, label }: { value: string | number; label: string }) {
  return (
    <div className="min-w-[74px]">
      <div className="font-extralight text-[28px] leading-none text-white">{value}</div>
      <div className="font-medium text-[10px] tracking-[.16em] text-white/45 mt-[7px]">{label}</div>
    </div>
  );
}

function DarkChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={
        'h-[32px] px-[14px] flex items-center rounded-full whitespace-nowrap text-[11.5px] transition-colors ' +
        (active ? 'font-semibold bg-white text-trevo-dark' : 'font-medium bg-white/[.08] text-white/70')
      }
    >
      {children}
    </button>
  );
}

function AmenityCard({ amenity, place, onClick }: { amenity: Amenity; place: string; onClick: () => void }) {
  const metaLine = amenity.specs?.slice(0, 2).map(s => s.value).join(' · ');
  const cta = amenity.tourNodeId ? 'Recorrer →' : amenity.tour3dUrl ? 'Ver recorrido 3D →' : 'Ver detalle →';
  return (
    <button
      onClick={onClick}
      className="text-left bg-white/[.04] border border-white/[.1] rounded-[18px] overflow-hidden flex flex-col cursor-pointer transition-all duration-300 hover:border-white/30 hover:-translate-y-[3px]"
    >
      <div className="relative aspect-[4/3] bg-white/[.05] overflow-hidden">
        {amenity.images[0] ? (
          <Image
            src={amenity.images[0]}
            alt={amenity.name}
            fill
            sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
            placeholder="blur"
            blurDataURL={shimmerDataUrl()}
            className="object-cover"
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-[8px]" style={{ background: 'repeating-linear-gradient(120deg, rgba(255,255,255,.035) 0 10px, rgba(255,255,255,.06) 10px 20px)' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.4)" strokeWidth="1.5" strokeLinecap="round"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 15l4.5-4 4 3.5 3-2.5L21 16" /></svg>
            <div className="font-normal text-[10.5px] text-white/45">Sin fotos todavía</div>
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/[.78] via-black/0 to-black/10" />
        <div className="absolute top-[11px] left-[11px] right-[11px] flex items-center justify-between gap-[8px]">
          {amenity.category ? (
            <div className="h-[24px] px-[9px] flex items-center bg-black/50 backdrop-blur rounded-full text-[10px] font-medium tracking-[.08em] text-white/90">{amenity.category}</div>
          ) : <div />}
          {amenity.tourNodeId && (
            <div className="h-[24px] px-[9px] flex items-center gap-[5px] bg-white/[.94] rounded-full text-[10px] font-semibold text-trevo-dark">
              <EyeIcon className="w-[11px] h-[11px]" strokeWidth={2} />
              360°
            </div>
          )}
        </div>
        <div className="absolute left-0 right-0 bottom-0 p-[14px_15px]">
          <div className="font-medium text-[17px] leading-[1.2] text-white">{amenity.name}</div>
          <div className="font-normal text-[11px] text-white/[.62] mt-[4px]">{place}</div>
        </div>
      </div>
      <div className="p-[13px_15px_14px] flex flex-col gap-[10px] flex-1">
        <div className="font-light text-[12px] leading-[1.6] text-white/60 flex-1">{amenity.description}</div>
        <div className="flex items-center justify-between gap-[10px] pt-[11px] border-t border-white/[.08]">
          <div className="font-normal text-[10.5px] text-white/45">{metaLine}</div>
          <div className="font-semibold text-[11.5px] text-brand-300">{cta}</div>
        </div>
      </div>
    </button>
  );
}

function AmenityRow({ amenity, place, onClick }: { amenity: Amenity; place: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left flex items-center gap-[16px] p-[13px_16px] border-b border-white/[.07] last:border-b-0 cursor-pointer transition-colors hover:bg-white/[.04]"
    >
      <div className="w-[78px] h-[56px] flex-none rounded-[11px] overflow-hidden bg-white/[.06] relative">
        {amenity.images[0] && (
          <Image src={amenity.images[0]} alt="" fill sizes="78px" className="object-cover" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-[9px] flex-wrap">
          <div className="font-medium text-[14px] text-white">{amenity.name}</div>
          {amenity.tourNodeId && <div className="h-[20px] px-[8px] flex items-center bg-white/[.14] rounded-full text-[9.5px] font-semibold text-white">360°</div>}
        </div>
        <div className="font-light text-[11.5px] leading-[1.5] text-white/55 mt-[3px] overflow-hidden text-ellipsis whitespace-nowrap">{amenity.description}</div>
      </div>
      <div className="font-normal text-[11.5px] text-white/50 flex-none">{place}</div>
      <div className="font-semibold text-[11.5px] text-brand-300 flex-none">Ver →</div>
    </button>
  );
}
