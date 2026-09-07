'use client';

import { useState, useMemo, useEffect, useCallback, startTransition } from 'react';
import Image from 'next/image';
import { m as motion, AnimatePresence } from 'framer-motion';
import { TransitionLink as Link } from '@/components/ui/TransitionUtils';
import { useProjectBasePath } from '@/lib/project-base-path-context';
import { ProjectTypeProvider } from '@/lib/project-type-context';
import { shimmerDataUrl } from '@/lib/imagePlaceholder';
import { formatPrice, getStatusLabel, getStatusColor, unitTypeLabel, pluralize } from '@/lib/units';
import { unitAgreement, type ProjectTypeConfig } from '@/lib/project-types';
import { useContactModal } from '@/hooks/useContactModal';
import LeadCaptureModal from '@/components/ui/LeadCaptureModal';
import type { Project, Unit, UnitStatus, UnitType } from '@/types';

interface UnitsListViewProps {
  project: Project;
  initialBuildingFilter?: string;
  typeConfig: ProjectTypeConfig;
}

type Orden = 'piso' | 'precio-asc' | 'precio-desc' | 'm2-desc' | 'dorm-desc';
type Vista = 'grid' | 'table';
type FeatKey = 'plano' | 'tour' | 'balcon' | (string & {});

const STATUS_ORDER: UnitStatus[] = ['available', 'reserved', 'sold'];

function placeLabel(unit: Unit, buildingName: string | undefined, hasFloorStep: boolean): string {
  return (hasFloorStep
    ? [buildingName, unit.floor === 0 ? 'Planta baja' : `Piso ${unit.floor}`]
    : [buildingName]
  ).filter(Boolean).join(' · ');
}

function unitHasFeat(u: Unit, key: FeatKey): boolean {
  if (key === 'plano') return !!(u.technicalPlanUrl || u.plan3dUrl || u.floorPlan3dUrl);
  if (key === 'tour') return !!(u.tourImageUrl || u.tourData);
  if (key === 'balcon') return (u.balconyArea ?? 0) > 0;
  return (u.features ?? []).includes(key);
}

function unitTags(u: Unit): string[] {
  const tags: string[] = [];
  if (unitHasFeat(u, 'plano')) tags.push('Plano');
  if (unitHasFeat(u, 'tour')) tags.push('360°');
  return tags.slice(0, 2);
}

export default function UnitsListView({ project, initialBuildingFilter, typeConfig }: UnitsListViewProps) {
  return (
    <ProjectTypeProvider projectType={project.projectType} saleMode={project.saleMode}>
      <UnitsListViewInner project={project} initialBuildingFilter={initialBuildingFilter} typeConfig={typeConfig} />
    </ProjectTypeProvider>
  );
}

function UnitsListViewInner({ project, initialBuildingFilter, typeConfig }: UnitsListViewProps) {
  const basePath = useProjectBasePath();
  const { hasFloorStep, buildingLabel, unitLabel, unitIsLand, showPrice, showStatus } = typeConfig;
  const uAgree = unitAgreement(typeConfig);
  const unitLabelLower = unitLabel.toLowerCase();
  const buildingLabelLower = buildingLabel.toLowerCase();
  const unitLabelPlural = pluralize(unitLabel);
  const unitLabelPluralLower = unitLabelPlural.toLowerCase();
  const hasMultipleBuildings = project.buildings.length > 1;

  const [buildingFilter, setBuildingFilter] = useState<string>(
    initialBuildingFilter && project.buildings.some(b => b.id === initialBuildingFilter)
      ? initialBuildingFilter
      : 'all'
  );
  const [typeFilter, setTypeFilter] = useState<UnitType | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<UnitStatus | 'all'>('all');
  const [selectedFeats, setSelectedFeats] = useState<FeatKey[]>([]);
  const [maxPrice, setMaxPrice] = useState(0);
  const [minArea, setMinArea] = useState(0);
  const [onlyFavs, setOnlyFavs] = useState(false);
  const [advOpen, setAdvOpen] = useState(false);
  const [orden, setOrden] = useState<Orden>('piso');
  const [vista, setVista] = useState<Vista>('grid');
  const [cmp, setCmp] = useState<string[]>([]);
  const [cmpOpen, setCmpOpen] = useState(false);
  const [leadMessage, setLeadMessage] = useState<string | undefined>(undefined);

  const contactModal = useContactModal();
  const openLead = useCallback((message?: string) => {
    setLeadMessage(message);
    contactModal.open();
  }, [contactModal]);

  // ── Favoritos (solo en este navegador, por proyecto) ──────────────
  const favsKey = `atrium:favorites:${project.slug}`;
  const [favorites, setFavorites] = useState<string[]>([]);
  useEffect(() => {
    startTransition(() => {
      try {
        const raw = window.localStorage.getItem(favsKey);
        if (raw) setFavorites(JSON.parse(raw));
      } catch {
        // localStorage no disponible (privado/bloqueado) — se sigue sin favoritos.
      }
    });
  }, [favsKey]);
  const toggleFavorite = useCallback((unitId: string) => {
    setFavorites(prev => {
      const next = prev.includes(unitId) ? prev.filter(id => id !== unitId) : [...prev, unitId];
      try { window.localStorage.setItem(favsKey, JSON.stringify(next)); } catch { /* ídem */ }
      return next;
    });
  }, [favsKey]);

  const toggleCompare = useCallback((unitId: string) => {
    setCmp(prev => {
      if (prev.includes(unitId)) return prev.filter(id => id !== unitId);
      if (prev.length >= 3) return prev;
      return [...prev, unitId];
    });
  }, []);

  const typesPresent = useMemo(() => {
    const set = new Set(project.units.map(u => u.type));
    return Array.from(set);
  }, [project.units]);
  const hasTypeFilterRow = typesPresent.length > 0 && !unitIsLand;

  const pricedUnits = useMemo(() => project.units.filter(u => u.price != null), [project.units]);
  const priceBounds = useMemo(() => {
    if (!showPrice || pricedUnits.length === 0) return null;
    const vals = pricedUnits.map(u => u.price!);
    return {
      min: Math.floor(Math.min(...vals) / 5000) * 5000,
      max: Math.ceil(Math.max(...vals) / 5000) * 5000,
    };
  }, [pricedUnits, showPrice]);
  const areaBounds = useMemo(() => {
    const vals = project.units.map(u => u.totalArea).filter(v => v > 0);
    if (vals.length === 0) return null;
    return {
      min: Math.floor(Math.min(...vals) / 5) * 5,
      max: Math.ceil(Math.max(...vals) / 5) * 5,
    };
  }, [project.units]);

  const presentFeats = useMemo(() => {
    const base: { key: FeatKey; label: string }[] = [
      { key: 'plano', label: 'Con plano' },
      { key: 'tour', label: 'Recorrido 360°' },
      { key: 'balcon', label: 'Con balcón' },
    ];
    const extra = new Set<string>();
    project.units.forEach(u => (u.features ?? []).forEach(f => extra.add(f)));
    const all = [...base, ...Array.from(extra).map(f => ({ key: f as FeatKey, label: f }))];
    return all.filter(f => project.units.some(u => unitHasFeat(u, f.key)));
  }, [project.units]);

  const hasAdvancedFacets = !!priceBounds || !!areaBounds || hasMultipleBuildings || presentFeats.length > 0;

  const effectiveMaxPrice = maxPrice || priceBounds?.max || 0;
  const effectiveMinArea = minArea || areaBounds?.min || 0;

  const filtered = useMemo(() => {
    return project.units.filter(u => {
      if (buildingFilter !== 'all' && u.buildingId !== buildingFilter) return false;
      if (typeFilter !== 'all' && u.type !== typeFilter) return false;
      if (statusFilter !== 'all' && u.status !== statusFilter) return false;
      if (onlyFavs && !favorites.includes(u.id)) return false;
      if (showPrice && effectiveMaxPrice && u.price != null && u.price > effectiveMaxPrice) return false;
      if (effectiveMinArea && u.totalArea > 0 && u.totalArea < effectiveMinArea) return false;
      for (const f of selectedFeats) if (!unitHasFeat(u, f)) return false;
      return true;
    }).sort((a, b) => {
      if (orden === 'precio-asc') return (a.price ?? Infinity) - (b.price ?? Infinity);
      if (orden === 'precio-desc') return (b.price ?? -Infinity) - (a.price ?? -Infinity);
      if (orden === 'm2-desc') return b.totalArea - a.totalArea;
      if (orden === 'dorm-desc') return b.bedrooms - a.bedrooms || b.totalArea - a.totalArea;
      return a.buildingId.localeCompare(b.buildingId) || a.floor - b.floor || a.name.localeCompare(b.name);
    });
  }, [project.units, buildingFilter, typeFilter, statusFilter, onlyFavs, favorites, showPrice, effectiveMaxPrice, effectiveMinArea, selectedFeats, orden]);

  const availableCount = useMemo(() => project.units.filter(u => u.status === 'available').length, [project.units]);
  const minPrice = pricedUnits.length > 0 ? Math.min(...pricedUnits.map(u => u.price!)) : null;
  const minPriceCurrency = pricedUnits.find(u => u.price === minPrice)?.currency;
  const heroImage = project.aerialSlides[0]?.imageUrl;

  const hasFilters = typeFilter !== 'all' || statusFilter !== 'all' || buildingFilter !== 'all' || onlyFavs ||
    selectedFeats.length > 0 ||
    (!!priceBounds && maxPrice > 0 && maxPrice < priceBounds.max) ||
    (!!areaBounds && minArea > 0 && minArea > areaBounds.min);

  const clearAll = () => {
    setTypeFilter('all'); setStatusFilter('all'); setBuildingFilter('all');
    setOnlyFavs(false); setSelectedFeats([]); setMaxPrice(0); setMinArea(0);
  };

  const filterSummary = () => {
    const parts: string[] = [];
    parts.push(typeFilter === 'all' ? `todas las tipologías` : unitTypeLabel(typeFilter));
    if (showPrice && priceBounds) parts.push(`hasta ${formatPrice(effectiveMaxPrice)}`);
    return parts.join(' · ');
  };

  const buildingName = (id: string) => project.buildings.find(b => b.id === id)?.name;

  const cmpUnits = cmp.map(id => project.units.find(u => u.id === id)).filter((u): u is Unit => !!u);
  const bestArea = cmpUnits.length ? Math.max(...cmpUnits.map(u => u.totalArea)) : 0;
  const bestBedrooms = cmpUnits.length ? Math.max(...cmpUnits.map(u => u.bedrooms)) : 0;
  const cmpPriced = cmpUnits.filter(u => u.price != null);
  const bestPrice = cmpPriced.length ? Math.min(...cmpPriced.map(u => u.price!)) : null;

  const cmpRows: { label: string; vals: { text: string; hi: boolean }[] }[] = [];
  if (!unitIsLand) cmpRows.push({ label: 'TIPOLOGÍA', vals: cmpUnits.map(u => ({ text: unitTypeLabel(u.type), hi: false })) });
  cmpRows.push({ label: 'UBICACIÓN', vals: cmpUnits.map(u => ({ text: placeLabel(u, buildingName(u.buildingId), hasFloorStep) || '—', hi: false })) });
  cmpRows.push({ label: 'SUPERFICIE', vals: cmpUnits.map(u => ({ text: `${u.totalArea} m²`, hi: u.totalArea === bestArea })) });
  if (!unitIsLand) cmpRows.push({ label: 'AMBIENTES', vals: cmpUnits.map(u => ({ text: `${u.bedrooms} dorm · ${u.bathrooms} baños`, hi: u.bedrooms === bestBedrooms })) });
  if (cmpUnits.some(u => u.orientation)) cmpRows.push({ label: 'ORIENTACIÓN', vals: cmpUnits.map(u => ({ text: u.orientation || '—', hi: false })) });
  if (showPrice) {
    cmpRows.push({ label: 'PRECIO', vals: cmpUnits.map(u => ({ text: u.price != null ? formatPrice(u.price, u.currency) : 'Consultar', hi: u.price != null && u.price === bestPrice })) });
    cmpRows.push({ label: 'VALOR / M²', vals: cmpUnits.map(u => ({ text: u.price != null && u.totalArea > 0 ? formatPrice(Math.round(u.price / u.totalArea), u.currency) : '—', hi: false })) });
  }
  if (showStatus) cmpRows.push({ label: 'ESTADO', vals: cmpUnits.map(u => ({ text: getStatusLabel(u.status), hi: false })) });

  type ColKey = 'unidad' | 'ubicacion' | 'tipologia' | 'm2' | 'dorm' | 'banos' | 'estado' | 'precio' | 'acciones';
  const columns: { key: ColKey; label: string; width: string; end?: boolean }[] = [
    { key: 'unidad', label: unitLabel, width: '1.4fr' },
    { key: 'ubicacion', label: 'Ubicación', width: '1fr' },
    ...(!unitIsLand ? [{ key: 'tipologia' as const, label: 'Tipología', width: '1.2fr' }] : []),
    { key: 'm2', label: 'm²', width: '.7fr' },
    ...(!unitIsLand ? [
      { key: 'dorm' as const, label: 'Dorm', width: '.6fr' },
      { key: 'banos' as const, label: 'Baños', width: '.6fr' },
    ] : []),
    ...(showStatus ? [{ key: 'estado' as const, label: 'Estado', width: '1.4fr' }] : []),
    ...(showPrice ? [{ key: 'precio' as const, label: 'Precio', width: '.9fr' }] : []),
    { key: 'acciones', label: '', width: 'auto', end: true },
  ];
  const gridTemplate = columns.map(c => c.width).join(' ');

  return (
    <div className="min-h-screen bg-trevo-light pb-[120px]">

      {/* ── Hero ──────────────────────────────────────────────── */}
      <section className="relative overflow-hidden bg-trevo-dark">
        {heroImage && (
          <div className="absolute inset-0">
            <Image
              src={heroImage}
              alt={project.name}
              fill
              sizes="100vw"
              priority
              placeholder="blur"
              blurDataURL={shimmerDataUrl(1920, 1080)}
              className="object-cover opacity-50"
            />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-trevo-dark/[.72] via-trevo-dark/[.55] to-trevo-dark/[.94]" />

        <div className="relative max-w-[1220px] mx-auto px-[16px] sm:px-[28px] pt-[26px] pb-[30px]">
          <div className="flex items-center justify-between gap-[16px] flex-wrap">
            <Link
              href={basePath || '/'}
              className="flex items-center gap-[8px] font-medium text-[11px] leading-none tracking-[.16em] text-white/[.62] hover:text-white transition-colors"
            >
              ← {project.name.toUpperCase()}
            </Link>
            <div className="flex gap-[8px]">
              <Link
                href={`${basePath}/masterplan`}
                className="h-[34px] px-[14px] flex items-center gap-[7px] border border-white/[.28] rounded-full text-[11.5px] font-medium text-white"
              >
                Masterplan
              </Link>
              <Link
                href={`${basePath}/amenities`}
                className="h-[34px] px-[14px] flex items-center gap-[7px] border border-white/[.28] rounded-full text-[11.5px] font-medium text-white"
              >
                Amenities
              </Link>
              <button
                onClick={() => openLead()}
                className="h-[34px] px-[14px] flex items-center gap-[7px] bg-white rounded-full text-[11.5px] font-semibold text-trevo-dark"
              >
                Contactar
              </button>
            </div>
          </div>

          <div className="flex items-end justify-between gap-[32px] flex-wrap mt-[34px]">
            <div className="min-w-[260px] flex-1">
              <div className="font-semibold text-[11px] tracking-[.2em] text-trevo-lightgreen">
                {unitLabelPlural.toUpperCase()} DISPONIBLES
              </div>
              <div className="font-extralight text-[clamp(34px,5vw,52px)] leading-[1.06] text-white mt-[10px] text-pretty">
                Encontrá tu{' '}
                {unitIsLand
                  ? <span className="font-medium">próximo terreno</span>
                  : <span className="font-medium">próximo hogar</span>}
              </div>
              <div className="font-light text-[13.5px] leading-[1.6] text-white/[.68] mt-[12px] max-w-[440px]">
                Filtrá por {[!unitIsLand && 'tipología', hasMultipleBuildings && buildingLabelLower, 'presupuesto'].filter(Boolean).join(', ')}.
                {' '}Compará hasta tres {unitLabelPluralLower} y pedí la que te interese sin salir de esta página.
              </div>
            </div>
            <div className="grid grid-cols-2 sm:flex gap-x-[26px] gap-y-[16px] sm:flex-wrap">
              <Stat value={project.units.length} label={unitLabelPlural.toUpperCase()} />
              {showStatus && <Stat value={availableCount} label="DISPONIBLES" />}
              {hasMultipleBuildings && <Stat value={project.buildings.length} label={pluralize(buildingLabel).toUpperCase()} />}
              {showPrice && minPrice != null && <Stat value={formatPrice(minPrice, minPriceCurrency)} label="DESDE" />}
            </div>
          </div>
        </div>
      </section>

      {/* ── Filtros (sticky) ─────────────────────────────────── */}
      <div className="sticky top-0 z-30 bg-trevo-light/[.92] backdrop-blur-md border-b border-trevo-dark/[.1]">
        <div className="max-w-[1220px] mx-auto px-[16px] sm:px-[28px] py-[12px] flex flex-col gap-[10px]">

          <div className="flex items-center gap-[14px] flex-wrap">
            <div className="flex items-center gap-[9px] flex-wrap">
              <Chip active={typeFilter === 'all' && statusFilter === 'all' && !onlyFavs} onClick={() => { setTypeFilter('all'); setStatusFilter('all'); setOnlyFavs(false); }}>
                Todas · {project.units.length}
              </Chip>
              {hasTypeFilterRow && typesPresent.map(t => (
                <Chip key={t} active={typeFilter === t} onClick={() => setTypeFilter(typeFilter === t ? 'all' : t)}>
                  {unitTypeLabel(t)} · {project.units.filter(u => u.type === t).length}
                </Chip>
              ))}
              {showStatus && STATUS_ORDER.map(s => (
                <Chip key={s} active={statusFilter === s} onClick={() => setStatusFilter(statusFilter === s ? 'all' : s)}>
                  {getStatusLabel(s)} · {project.units.filter(u => u.status === s).length}
                </Chip>
              ))}
              {favorites.length > 0 && (
                <Chip active={onlyFavs} onClick={() => setOnlyFavs(v => !v)}>
                  ♥ Favoritas · {favorites.length}
                </Chip>
              )}
            </div>

            <div className="flex-1 min-w-[12px]" />

            <div className="flex items-center gap-[9px] flex-wrap">
              {hasAdvancedFacets && (
                <button
                  onClick={() => setAdvOpen(v => !v)}
                  className={
                    'h-[34px] px-[14px] flex items-center gap-[7px] rounded-full text-[12px] font-medium transition-colors ' +
                    (advOpen ? 'bg-trevo-green text-white border border-trevo-green' : 'bg-white text-trevo-dark border border-trevo-dark/[.16]')
                  }
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round"><path d="M4 6h16M7 12h10M10 18h4" /></svg>
                  {advOpen ? 'Menos filtros' : 'Más filtros'}
                </button>
              )}
              <div className="relative">
                <select
                  value={orden}
                  onChange={e => setOrden(e.target.value as Orden)}
                  className="h-[34px] pl-[12px] pr-[30px] rounded-full border border-trevo-dark/[.16] bg-white text-[12px] font-medium text-trevo-dark cursor-pointer appearance-none"
                >
                  <option value="piso">Orden: {hasFloorStep ? 'por torre y piso' : 'por defecto'}</option>
                  {showPrice && <option value="precio-asc">Precio: menor a mayor</option>}
                  {showPrice && <option value="precio-desc">Precio: mayor a menor</option>}
                  <option value="m2-desc">Superficie: mayor a menor</option>
                  {!unitIsLand && <option value="dorm-desc">Más dormitorios</option>}
                </select>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="absolute right-[12px] top-1/2 -translate-y-1/2 pointer-events-none text-trevo-dark/50"><path d="M6 9l6 6 6-6" /></svg>
              </div>
              <div className="flex border border-trevo-dark/[.16] rounded-full overflow-hidden bg-white">
                <button
                  onClick={() => setVista('grid')}
                  className={'h-[32px] px-[14px] flex items-center text-[11.5px] font-medium ' + (vista === 'grid' ? 'bg-trevo-dark text-white' : 'text-trevo-dark/60')}
                >
                  Fichas
                </button>
                <button
                  onClick={() => setVista('table')}
                  className={'h-[32px] px-[14px] flex items-center text-[11.5px] font-medium ' + (vista === 'table' ? 'bg-trevo-dark text-white' : 'text-trevo-dark/60')}
                >
                  Tabla
                </button>
              </div>
            </div>
          </div>

          {advOpen && hasAdvancedFacets && (
            <div className="grid grid-cols-[repeat(auto-fit,minmax(230px,1fr))] gap-x-[26px] gap-y-[18px] p-[16px_18px] bg-white border border-trevo-dark/[.1] rounded-[14px]">
              {priceBounds && (
                <div className="flex flex-col gap-[9px]">
                  <div className="flex items-baseline justify-between gap-[10px]">
                    <div className="font-semibold text-[10.5px] tracking-[.14em] text-trevo-brown">PRESUPUESTO HASTA</div>
                    <div className="font-semibold text-[12px] text-trevo-dark">{formatPrice(effectiveMaxPrice)}</div>
                  </div>
                  <input
                    type="range"
                    min={priceBounds.min}
                    max={priceBounds.max}
                    step={5000}
                    value={effectiveMaxPrice}
                    onChange={e => setMaxPrice(Number(e.target.value))}
                    className="w-full accent-trevo-green"
                  />
                </div>
              )}
              {areaBounds && (
                <div className="flex flex-col gap-[9px]">
                  <div className="flex items-baseline justify-between gap-[10px]">
                    <div className="font-semibold text-[10.5px] tracking-[.14em] text-trevo-brown">SUPERFICIE DESDE</div>
                    <div className="font-semibold text-[12px] text-trevo-dark">{effectiveMinArea} m²</div>
                  </div>
                  <input
                    type="range"
                    min={areaBounds.min}
                    max={areaBounds.max}
                    step={5}
                    value={effectiveMinArea}
                    onChange={e => setMinArea(Number(e.target.value))}
                    className="w-full accent-trevo-green"
                  />
                </div>
              )}
              {hasMultipleBuildings && (
                <div className="flex flex-col gap-[9px]">
                  <div className="font-semibold text-[10.5px] tracking-[.14em] text-trevo-brown">{buildingLabel.toUpperCase()}</div>
                  <div className="flex gap-[8px] flex-wrap">
                    <Chip size="sm" active={buildingFilter === 'all'} onClick={() => setBuildingFilter('all')}>Todas</Chip>
                    {project.buildings.map(b => (
                      <Chip key={b.id} size="sm" active={buildingFilter === b.id} onClick={() => setBuildingFilter(buildingFilter === b.id ? 'all' : b.id)}>
                        {b.name}
                      </Chip>
                    ))}
                  </div>
                </div>
              )}
              {presentFeats.length > 0 && (
                <div className="flex flex-col gap-[9px]">
                  <div className="font-semibold text-[10.5px] tracking-[.14em] text-trevo-brown">CARACTERÍSTICAS</div>
                  <div className="flex gap-[8px] flex-wrap">
                    {presentFeats.map(f => (
                      <Chip
                        key={f.key}
                        size="sm"
                        active={selectedFeats.includes(f.key)}
                        onClick={() => setSelectedFeats(prev => prev.includes(f.key) ? prev.filter(x => x !== f.key) : [...prev, f.key])}
                      >
                        {f.label}
                      </Chip>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="flex items-center justify-between gap-[14px] flex-wrap">
            <div className="flex items-center gap-[12px] flex-wrap">
              <div className="font-medium text-[12.5px] text-trevo-dark">
                {filtered.length === project.units.length
                  ? `${project.units.length} ${unitLabelPluralLower}`
                  : `${filtered.length} de ${project.units.length} ${unitLabelPluralLower}`}
              </div>
              {hasFilters && (
                <button onClick={clearAll} className="text-[11.5px] font-medium text-trevo-green underline underline-offset-[3px]">
                  Limpiar filtros
                </button>
              )}
            </div>
            {showStatus && (
              <div className="flex items-center gap-[14px] flex-wrap">
                {STATUS_ORDER.map(s => (
                  <div key={s} className="flex items-center gap-[6px]">
                    <span className="w-[7px] h-[7px] rounded-full" style={{ backgroundColor: getStatusColor(s) }} />
                    <span className="text-[11px] text-trevo-dark/[.62]">{getStatusLabel(s)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      </div>

      {/* ── Contenido ────────────────────────────────────────── */}
      <div className="max-w-[1220px] mx-auto px-[16px] sm:px-[28px] pt-[26px]">

        {filtered.length === 0 ? (
          project.units.length === 0 ? (
            <div className="text-center py-20 text-trevo-dark/40 font-light">
              Todavía no hay {unitLabelPluralLower} {uAgree.cargado}s.
            </div>
          ) : (
            <div className="bg-white border border-trevo-dark/[.1] rounded-[16px] p-[52px_28px] text-center">
              <div className="font-light text-[20px] text-trevo-dark">Ninguna {unitLabelLower} entra en esos filtros</div>
              <div className="font-light text-[13px] leading-[1.6] text-trevo-dark/60 mt-[8px] max-w-[400px] mx-auto">
                Probá ampliar el presupuesto o la superficie. También podemos avisarte cuando entre algo así.
              </div>
              <div className="flex gap-[10px] justify-center flex-wrap mt-[20px]">
                <button onClick={clearAll} className="h-[40px] px-[20px] flex items-center bg-trevo-dark rounded-full text-[12.5px] font-medium text-white">
                  Quitar filtros
                </button>
                <button
                  onClick={() => openLead(`Hola, no encontré ${unitLabelPluralLower} que encajen con mi búsqueda (${filterSummary()}). Avísenme cuando haya algo así.`)}
                  className="h-[40px] px-[20px] flex items-center border border-trevo-dark/[.18] rounded-full text-[12.5px] font-medium text-trevo-dark"
                >
                  Avisame cuando haya
                </button>
              </div>
            </div>
          )
        ) : vista === 'grid' ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-[20px]">
            {filtered.map(u => (
              <UnitCard
                key={u.id}
                unit={u}
                buildingName={buildingName(u.buildingId)}
                hasFloorStep={hasFloorStep}
                unitIsLand={unitIsLand}
                showPrice={showPrice}
                showStatus={showStatus}
                unitLabelLower={unitLabelLower}
                isFav={favorites.includes(u.id)}
                onToggleFav={() => toggleFavorite(u.id)}
                inCmp={cmp.includes(u.id)}
                onToggleCmp={() => toggleCompare(u.id)}
                basePath={basePath}
              />
            ))}

            <div className="border border-dashed border-trevo-dark/[.22] rounded-[16px] p-[22px] flex flex-col justify-center gap-[12px] bg-trevo-lightgreen/[.09]">
              <div className="font-semibold text-[10.5px] tracking-[.16em] text-trevo-brown">ASESORAMIENTO</div>
              <div className="font-light text-[19px] leading-[1.3] text-trevo-dark text-pretty">¿No encontrás lo que buscás?</div>
              <div className="font-light text-[12px] leading-[1.6] text-trevo-dark/[.62]">
                Contanos qué necesitás y te mandamos las {unitLabelPluralLower} que mejor encajan{!unitIsLand ? ', con plano y financiación' : ''}.
              </div>
              <button
                onClick={() => openLead(`Hola, busco ${unitLabelPluralLower} en ${project.name}${hasFilters ? ` (${filterSummary()})` : ''} y me gustaría que un asesor me ayude a encontrar la opción indicada.`)}
                className="h-[38px] px-[18px] self-start flex items-center bg-trevo-dark rounded-full text-[12px] font-medium text-white mt-[4px]"
              >
                Hablar con un asesor
              </button>
            </div>
          </div>
        ) : (
          <div className="bg-white border border-trevo-dark/[.1] rounded-[16px] overflow-hidden overflow-x-auto">
            <div className="min-w-[720px]">
              <div className="grid gap-[12px] p-[13px_18px] border-b border-trevo-dark/[.1] bg-trevo-light/60" style={{ gridTemplateColumns: gridTemplate }}>
                {columns.map(c => (
                  <div key={c.key} className={'font-semibold text-[10px] tracking-[.12em] uppercase text-trevo-dark/50' + (c.end ? ' justify-self-end' : '')}>
                    {c.label}
                  </div>
                ))}
              </div>
              {filtered.map(u => (
                <UnitRow
                  key={u.id}
                  unit={u}
                  columns={columns}
                  gridTemplate={gridTemplate}
                  buildingName={buildingName(u.buildingId)}
                  hasFloorStep={hasFloorStep}
                  unitLabelLower={unitLabelLower}
                  inCmp={cmp.includes(u.id)}
                  onToggleCmp={() => toggleCompare(u.id)}
                  basePath={basePath}
                />
              ))}
            </div>
          </div>
        )}

      </div>

      {/* ── Bandeja de comparación ───────────────────────────── */}
      {cmp.length > 0 && !cmpOpen && (
        <div className="fixed left-0 right-0 bottom-0 z-40 p-[16px_28px_20px] bg-gradient-to-t from-trevo-light/90 to-transparent pointer-events-none">
          <div className="max-w-[1220px] mx-auto bg-trevo-dark rounded-[16px] p-[12px_14px_12px_18px] flex items-center justify-between gap-[18px] flex-wrap shadow-[0_26px_52px_-26px_rgba(27,30,28,.7)] pointer-events-auto">
            <div className="flex items-center gap-[14px] flex-wrap min-w-0">
              <div className="font-medium text-[12.5px] text-white">
                {cmp.length === 1 ? 'Elegí una más para comparar' : `${cmp.length} ${unitLabelPluralLower} seleccionadas`}
              </div>
              <div className="flex gap-[7px] flex-wrap">
                {cmpUnits.map(u => (
                  <div key={u.id} className="h-[28px] pl-[10px] pr-[6px] flex items-center gap-[7px] bg-white/[.1] rounded-[8px] text-[11.5px] font-medium text-white">
                    {u.name}
                    <button onClick={() => toggleCompare(u.id)} className="w-[16px] h-[16px] flex items-center justify-center rounded-[5px] bg-white/[.14] text-[11px]">×</button>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-[9px]">
              <button onClick={() => setCmp([])} className="h-[36px] px-[14px] flex items-center text-[12px] font-medium text-white/[.66]">Vaciar</button>
              <button
                onClick={() => { if (cmp.length >= 2) setCmpOpen(true); }}
                disabled={cmp.length < 2}
                className={
                  'h-[36px] px-[18px] flex items-center rounded-full text-[12px] font-semibold ' +
                  (cmp.length < 2 ? 'bg-white/[.18] text-white/50 cursor-not-allowed' : 'bg-white text-trevo-dark cursor-pointer')
                }
              >
                {cmp.length < 2 ? 'Comparar' : `Comparar ${cmp.length} ${unitLabelPluralLower}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal de comparación ─────────────────────────────── */}
      <AnimatePresence>
        {cmpOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setCmpOpen(false)}
              className="fixed inset-0 z-[60] bg-trevo-dark/[.62]"
            />
            <div className="fixed inset-0 z-[60] flex items-center justify-center p-[24px] pointer-events-none">
              <motion.div
                initial={{ opacity: 0, scale: 0.97, y: 16 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.97, y: 16 }}
                className="w-full max-w-[860px] max-h-[88vh] overflow-auto bg-white rounded-[18px] shadow-2xl pointer-events-auto"
              >
                <div className="p-[20px_24px] border-b border-trevo-dark/[.1] flex items-center justify-between gap-[16px]">
                  <div>
                    <div className="font-medium text-[16px] text-trevo-dark">Comparar {unitLabelPluralLower}</div>
                    <div className="font-light text-[11.5px] text-trevo-dark/[.55] mt-[3px]">Lo mejor de cada fila queda resaltado.</div>
                  </div>
                  <button onClick={() => setCmpOpen(false)} className="w-[32px] h-[32px] flex items-center justify-center rounded-[9px] border border-trevo-dark/[.14] text-[16px] text-trevo-dark">×</button>
                </div>
                <div className="p-[20px_24px_24px]">
                  <div className="grid gap-x-[14px] items-end" style={{ gridTemplateColumns: `104px repeat(${Math.max(1, cmpUnits.length)},minmax(0,1fr))` }}>
                    <div />
                    {cmpUnits.map(u => (
                      <div key={u.id} className="flex flex-col gap-[8px]">
                        {(u.interiorImageUrl || u.galleryImages?.[0]) ? (
                          <Image
                            src={u.interiorImageUrl || u.galleryImages![0]}
                            alt={u.name}
                            width={200}
                            height={150}
                            className="w-full aspect-[4/3] object-cover rounded-[11px]"
                          />
                        ) : (
                          <div className="w-full aspect-[4/3] rounded-[11px] bg-trevo-dark/10" />
                        )}
                        <div className="font-medium text-[14px] text-trevo-dark">{u.name}</div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-[16px]">
                    {cmpRows.map(r => (
                      <div
                        key={r.label}
                        className="grid gap-x-[14px] p-[11px_0] border-t border-trevo-dark/[.08]"
                        style={{ gridTemplateColumns: `104px repeat(${Math.max(1, cmpUnits.length)},minmax(0,1fr))` }}
                      >
                        <div className="font-medium text-[11px] tracking-[.1em] text-trevo-brown self-center">{r.label}</div>
                        {r.vals.map((v, i) => (
                          <div
                            key={i}
                            className={
                              'text-[12.5px] self-center ' +
                              (v.hi ? 'font-semibold text-trevo-dark bg-trevo-lightgreen/[.16] rounded-[7px] p-[5px_9px]' : 'font-normal text-trevo-dark/[.72] p-[5px_0]')
                            }
                          >
                            {v.text}
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-[10px] flex-wrap mt-[22px]">
                    <button
                      onClick={() => { setCmpOpen(false); openLead(`Hola, quiero consultar por estas ${unitLabelPluralLower}: ${cmpUnits.map(u => u.name).join(', ')}.`); }}
                      className="h-[40px] px-[20px] flex items-center bg-trevo-dark rounded-full text-[12.5px] font-medium text-white"
                    >
                      Consultar estas {unitLabelPluralLower}
                    </button>
                    <button onClick={() => setCmpOpen(false)} className="h-[40px] px-[20px] flex items-center border border-trevo-dark/[.16] rounded-full text-[12.5px] font-medium text-trevo-dark">
                      Seguir mirando
                    </button>
                  </div>
                </div>
              </motion.div>
            </div>
          </>
        )}
      </AnimatePresence>

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
    <div className="min-w-[78px]">
      <div className="font-extralight text-[30px] leading-none text-white">{value}</div>
      <div className="font-medium text-[10px] tracking-[.16em] text-white/50 mt-[7px]">{label}</div>
    </div>
  );
}

function Chip({ active, onClick, size = 'md', children }: { active: boolean; onClick: () => void; size?: 'md' | 'sm'; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={
        (size === 'sm' ? 'h-[30px] px-[14px] ' : 'h-[34px] px-[14px] ') +
        'flex items-center gap-[7px] rounded-full whitespace-nowrap text-[12px] transition-colors ' +
        (active
          ? 'font-semibold bg-trevo-dark text-white border border-trevo-dark'
          : 'font-medium bg-white text-trevo-dark/[.66] border border-trevo-dark/[.14] hover:border-trevo-dark/30')
      }
    >
      {children}
    </button>
  );
}

function UnitCard({
  unit, buildingName, hasFloorStep, unitIsLand, showPrice, showStatus, unitLabelLower,
  isFav, onToggleFav, inCmp, onToggleCmp, basePath,
}: {
  unit: Unit;
  buildingName?: string;
  hasFloorStep: boolean;
  unitIsLand: boolean;
  showPrice: boolean;
  showStatus: boolean;
  unitLabelLower: string;
  isFav: boolean;
  onToggleFav: () => void;
  inCmp: boolean;
  onToggleCmp: () => void;
  basePath: string;
}) {
  const sold = showStatus && unit.status === 'sold';
  const statusColor = getStatusColor(unit.status);
  const tags = unitTags(unit);
  const img = unit.interiorImageUrl || unit.galleryImages?.[0];
  const href = `${basePath}/edificio/${unit.buildingId}/unidad/${unit.id}`;

  return (
    <div className={'rounded-[16px] overflow-hidden bg-white border border-trevo-dark/[.1] flex flex-col transition-all duration-300 hover:shadow-xl hover:-translate-y-[3px]' + (sold ? ' opacity-[.62]' : '')}>
      <Link href={href} className="relative aspect-[4/3] bg-trevo-dark/10 block overflow-hidden">
        {img ? (
          <Image
            src={img}
            alt={unit.name}
            fill
            sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
            placeholder="blur"
            blurDataURL={shimmerDataUrl()}
            className={'object-cover' + (sold ? ' grayscale' : '')}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-trevo-dark/20 text-xs">Sin foto</div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/[.62] via-black/0 to-black/[.16]" />
        {showStatus && (
          <span className="absolute top-[11px] right-[11px] h-[26px] px-[10px] flex items-center gap-[6px] bg-white/[.94] rounded-full text-[10.5px] font-semibold text-trevo-dark">
            <span className="w-[7px] h-[7px] rounded-full" style={{ backgroundColor: statusColor }} />
            {getStatusLabel(unit.status)}
          </span>
        )}
        <button
          onClick={e => { e.preventDefault(); e.stopPropagation(); onToggleFav(); }}
          aria-label="Favorita"
          className="absolute top-[11px] left-[11px] w-[28px] h-[28px] flex items-center justify-center rounded-full bg-white/90"
          style={{ color: isFav ? '#c94a4a' : 'rgba(27,30,28,.55)' }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill={isFav ? '#c94a4a' : 'none'} stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
            <path d="M12 20s-7-4.4-7-9.4A4 4 0 0 1 12 7a4 4 0 0 1 7 3.6c0 5-7 9.4-7 9.4z" />
          </svg>
        </button>
        <div className="absolute left-0 right-0 bottom-0 p-[14px_16px] flex items-end justify-between gap-[10px]">
          <div className="min-w-0">
            <p className="text-[10px] text-white/[.78] tracking-[.16em] uppercase font-medium">
              {placeLabel(unit, buildingName, hasFloorStep)}
            </p>
            <h3 className="text-white text-[20px] leading-[1.15] font-medium mt-[4px]">{unit.name}</h3>
          </div>
          {tags.length > 0 && (
            <div className="flex gap-[6px] flex-none">
              {tags.map(t => (
                <div key={t} className="h-[26px] px-[9px] flex items-center gap-[5px] bg-white/[.92] rounded-[7px] text-[10px] font-semibold text-trevo-dark">{t}</div>
              ))}
            </div>
          )}
        </div>
      </Link>

      <div className="p-[15px_16px_16px] flex flex-col gap-[13px]">
        <div className="flex items-start justify-between gap-[12px]">
          <div className="min-w-0">
            <p className="text-[13.5px] font-medium text-trevo-dark">{unitIsLand ? unitLabelLower : unitTypeLabel(unit.type)}</p>
            <p className="text-[11.5px] font-light text-trevo-dark/[.58] mt-[3px]">
              {unitIsLand
                ? `${unit.totalArea} m²`
                : `${unit.totalArea} m² · ${unit.bedrooms} dorm · ${unit.bathrooms} baños`}
            </p>
          </div>
          {showPrice && (
            <div className="text-right flex-none">
              <p className={'text-[15px] ' + (sold ? 'font-normal text-trevo-dark/[.45]' : 'font-semibold text-trevo-dark')}>
                {sold ? '—' : unit.price != null ? formatPrice(unit.price, unit.currency) : 'Consultar'}
              </p>
              <p className="text-[10px] font-normal text-trevo-dark/[.45] mt-[3px]">
                {sold ? 'Vendida' : unit.price != null && unit.totalArea > 0 ? `${formatPrice(Math.round(unit.price / unit.totalArea), unit.currency)} / m²` : ''}
              </p>
            </div>
          )}
        </div>
        <div className="flex items-center justify-between gap-[10px] pt-[12px] border-t border-trevo-dark/[.08]">
          <button onClick={onToggleCmp} className={'flex items-center gap-[7px] text-[11.5px] font-medium ' + (inCmp ? 'text-trevo-dark' : 'text-trevo-dark/[.55]')}>
            <span className={'w-[16px] h-[16px] rounded-[5px] flex items-center justify-center text-[10px] text-white ' + (inCmp ? 'bg-trevo-green border border-trevo-green' : 'border border-trevo-dark/[.24]')}>
              {inCmp ? '✓' : ''}
            </span>
            Comparar
          </button>
          <Link href={href} className={'text-[11.5px] font-semibold ' + (sold ? 'text-trevo-dark/50' : 'text-trevo-green')}>
            {sold ? 'Ver similares' : `Ver ${unitLabelLower} →`}
          </Link>
        </div>
      </div>
    </div>
  );
}

function UnitRow({
  unit, columns, gridTemplate, buildingName, hasFloorStep, unitLabelLower, inCmp, onToggleCmp, basePath,
}: {
  unit: Unit;
  columns: { key: string; end?: boolean }[];
  gridTemplate: string;
  buildingName?: string;
  hasFloorStep: boolean;
  unitLabelLower: string;
  inCmp: boolean;
  onToggleCmp: () => void;
  basePath: string;
}) {
  const sold = unit.status === 'sold';
  const href = `${basePath}/edificio/${unit.buildingId}/unidad/${unit.id}`;
  const thumb = unit.interiorImageUrl || unit.galleryImages?.[0];

  const cell = (key: string) => {
    switch (key) {
      case 'unidad':
        return (
          <div className="flex items-center gap-[10px] min-w-0">
            {thumb ? (
              <Image src={thumb} alt="" width={44} height={34} className={'w-[44px] h-[34px] flex-none rounded-[7px] object-cover' + (sold ? ' grayscale opacity-70' : '')} />
            ) : (
              <div className="w-[44px] h-[34px] flex-none rounded-[7px] bg-trevo-dark/10" />
            )}
            <div className="text-[12.5px] font-medium text-trevo-dark">{unit.name}</div>
          </div>
        );
      case 'ubicacion':
        return <div className="text-[12px] font-normal text-trevo-dark/70">{placeLabel(unit, buildingName, hasFloorStep)}</div>;
      case 'tipologia':
        return <div className="text-[12px] font-normal text-trevo-dark/70">{unitTypeLabel(unit.type)}</div>;
      case 'm2':
        return <div className="text-[12px] font-medium text-trevo-dark">{unit.totalArea} m²</div>;
      case 'dorm':
        return <div className="text-[12px] font-normal text-trevo-dark/70">{unit.bedrooms}</div>;
      case 'banos':
        return <div className="text-[12px] font-normal text-trevo-dark/70">{unit.bathrooms}</div>;
      case 'estado':
        return (
          <div className="flex items-center gap-[6px]">
            <span className="w-[7px] h-[7px] rounded-full flex-none" style={{ backgroundColor: getStatusColor(unit.status) }} />
            <span className="text-[11.5px] font-normal text-trevo-dark/[.72] whitespace-nowrap">{getStatusLabel(unit.status)}</span>
          </div>
        );
      case 'precio':
        return (
          <div className={'text-[12.5px] ' + (sold ? 'font-normal text-trevo-dark/[.45]' : 'font-semibold text-trevo-dark')}>
            {sold ? '—' : unit.price != null ? formatPrice(unit.price, unit.currency) : 'Consultar'}
          </div>
        );
      case 'acciones':
        return (
          <div className="flex items-center gap-[8px] justify-self-end">
            <button
              onClick={onToggleCmp}
              className={
                'w-[26px] h-[26px] flex items-center justify-center rounded-[8px] text-[11px] font-semibold ' +
                (inCmp ? 'bg-trevo-green text-white border border-trevo-green' : 'border border-trevo-dark/[.16] text-trevo-dark/60')
              }
            >
              {inCmp ? '✓' : '+'}
            </button>
            <Link href={href} className={'text-[11.5px] font-semibold whitespace-nowrap ' + (sold ? 'text-trevo-dark/50' : 'text-trevo-green')}>
              {sold ? 'Ver similares' : `Ver ${unitLabelLower} →`}
            </Link>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div
      className={'grid gap-[12px] p-[11px_18px] border-b border-trevo-dark/[.06] transition-colors hover:bg-trevo-light/60' + (sold ? ' opacity-[.62]' : '')}
      style={{ gridTemplateColumns: gridTemplate }}
    >
      {columns.map(c => (
        <div key={c.key} className={c.end ? 'justify-self-end' : 'self-center'}>
          {cell(c.key)}
        </div>
      ))}
    </div>
  );
}
