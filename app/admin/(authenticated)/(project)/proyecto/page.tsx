'use client';

import { useState, useEffect, startTransition } from 'react';
import { TransitionLink as Link } from '@/components/ui/TransitionUtils';
import ImageUploader from '@/components/admin/ImageUploader';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import ErrorState from '@/components/ui/ErrorState';
import { SectionRow, Pill, SegmentedTabs, fieldClass } from '@/components/admin/panel-ui';
import { ChapterHeader, ChapterFooter } from '@/components/admin/section-editors/FichaChrome';
import { useFichaProject, UnsavedBar, FichaLayout } from '@/components/admin/section-editors/ficha-data';
import { useToast } from '@/components/ui/ToastProvider';
import { useConfirm } from '@/components/ui/ConfirmProvider';
import { useActiveProjectId, withActiveProject } from '@/lib/active-project-context';
import { getProjectDisplayUrl } from '@/lib/project-url';
import { usePublishState } from '@/lib/publish-state-context';
import { useProjectTypeConfig } from '@/lib/project-type-context';
import { PROJECT_STRUCTURES, PROJECT_SALE_MODES, canonicalProjectType } from '@/lib/project-types';
import { pluralize } from '@/lib/units';
import type { ConstructionProgress, ProjectSaleMode, ProjectType } from '@/types';
import { useCustomDomain } from '@/lib/custom-domain-context';

// Capítulo 1 de la ficha — "Esencial" (diseño Ficha · Esencial): lo que
// hace falta para publicar (identidad y portada), qué forma tiene el
// proyecto y las cifras clave. El resto de lo que antes vivía en esta
// pantalla larga está repartido en los otros capítulos (ver FichaChrome).

const FORM_ORDER: ProjectType[] = ['edificio', 'duplex', 'casa', 'loteo', 'unico'];
const FORM_HINTS: Record<ProjectType, string> = {
  edificio: 'Pisos y unidades',
  duplex: 'Varias unidades',
  casa: 'Una sola unidad',
  loteo: 'Lotes en plano',
  unico: 'Solo mostrar',
};

interface UnitLite { total_area: number | null; model_name: string | null }

export default function AdminProjectPage() {
  const customDomain = useCustomDomain();
  const typeConfig = useProjectTypeConfig();
  const { saleMode, buildingLabel, aerialLabelPlural, unitLabel } = typeConfig;
  const ficha = useFichaProject();
  const { project, setProject, buildings, slides, unitPrices } = ficha;
  const toast = useToast();
  const confirmDialog = useConfirm();
  const activeProjectId = useActiveProjectId();
  const publishState = usePublishState();
  const [copied, setCopied] = useState(false);
  const [preview, setPreview] = useState<'desktop' | 'mobile'>('desktop');
  const [switchingMode, setSwitchingMode] = useState(false);
  const [units, setUnits] = useState<UnitLite[]>([]);

  // Para "Desde m²": la superficie más chica cargada y de qué tipología es.
  useEffect(() => {
    fetch(withActiveProject('/api/admin/units', activeProjectId))
      .then(res => (res.ok ? res.json() : []))
      .then(data => { if (Array.isArray(data)) setUnits(data); })
      .catch(() => {});
  }, [activeProjectId]);

  // Se completa recién en el cliente para no desalinear el render de servidor.
  const [origin, setOrigin] = useState('');
  useEffect(() => { startTransition(() => setOrigin(window.location.origin)); }, []);

  if (ficha.loading) return <LoadingSpinner text="Cargando proyecto..." tone="light" />;
  if (ficha.loadError || !project) return <ErrorState message="No se pudo cargar el proyecto." onRetry={ficha.reload} />;

  const displayUrl = origin ? getProjectDisplayUrl(project.slug, origin, customDomain) : `/proyecto/${project.slug}`;
  const handleCopyLink = () => {
    navigator.clipboard.writeText(getProjectDisplayUrl(project.slug, origin || window.location.origin, customDomain));
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  const currentType = canonicalProjectType(project.project_type ?? '') as ProjectType;
  const structure = PROJECT_STRUCTURES[currentType];

  // Modalidad: cambia qué secciones y datos de venta existen en todo el
  // panel (lo resuelve el layout del servidor), así que se guarda al toque
  // y se recarga, en vez de quedar en la barra de cambios sin guardar.
  const changeSaleMode = async (next: ProjectSaleMode) => {
    if (next === saleMode || switchingMode) return;
    if (ficha.dirty) { toast('Guardá los cambios antes de cambiar la modalidad.', 'error'); return; }
    const ok = await confirmDialog({
      message: next === 'showcase'
        ? 'Pasar a "Solo para mostrar" oculta precios, estados, leads y calculadora del sitio. Los datos no se borran.'
        : 'Pasar a "Para vender" muestra precios, estados y el formulario de contacto en el sitio.',
      confirmLabel: 'Cambiar modalidad',
    });
    if (!ok) return;
    setSwitchingMode(true);
    const res = await fetch(withActiveProject('/api/admin/project', activeProjectId), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ saleMode: next }),
    });
    if (res.ok) { window.location.reload(); return; }
    setSwitchingMode(false);
    const data = await res.json().catch(() => ({}));
    toast(data.error ?? 'No se pudo cambiar la modalidad.', 'error');
  };

  // Cifras clave
  const progress = (project.construction_progress ?? null) as ConstructionProgress | null;
  const delivery = progress?.deliveryEstimate ?? '';
  const setDelivery = (value: string) => {
    const base: ConstructionProgress = progress ?? { stages: [], updates: [] };
    const next: ConstructionProgress = { ...base };
    if (value.trim()) next.deliveryEstimate = value; else delete next.deliveryEstimate;
    setProject({ ...project, construction_progress: next });
  };
  const withArea = units.filter(u => (u.total_area ?? 0) > 0);
  const smallest = withArea.reduce<UnitLite | null>((min, u) => (!min || (u.total_area as number) < (min.total_area as number) ? u : min), null);
  const unitsWord = unitPrices.total === 1 ? unitLabel.toLowerCase() : pluralize(unitLabel.toLowerCase());

  const aside = (
    <>
      <div className="flex items-center justify-between gap-3">
        <span className="text-[13px] font-semibold text-gray-900">Vista en vivo</span>
        <SegmentedTabs label="Tamaño de la vista" value={preview} onChange={setPreview}
          options={[
            { value: 'desktop', label: <span className="sr-only sm:not-sr-only">Escritorio</span> },
            { value: 'mobile', label: <span className="sr-only sm:not-sr-only">Celular</span> },
          ]} />
      </div>
      <div className={`mx-auto w-full ${preview === 'mobile' ? 'max-w-[260px]' : ''} rounded-2xl overflow-hidden bg-white border border-gray-200 shadow-[0_1px_2px_rgba(23,25,26,0.06),0_12px_32px_-12px_rgba(23,25,26,0.18)]`}>
        <div className="flex items-center gap-1.5 px-3 py-2 border-b border-gray-200">
          <span className="w-2 h-2 rounded-full bg-gray-300" /><span className="w-2 h-2 rounded-full bg-gray-300" /><span className="w-2 h-2 rounded-full bg-gray-300" />
          <span className="ml-2 font-mono text-[10px] text-gray-600 truncate">{displayUrl.replace(/^https?:\/\//, '')}</span>
        </div>
        <div
          className={`relative ${preview === 'mobile' ? 'min-h-[380px]' : 'min-h-[300px]'} p-5 flex flex-col justify-end gap-2 bg-cover bg-center`}
          style={project.masterplan_image
            ? { backgroundImage: `linear-gradient(180deg, rgba(23,25,26,.15), rgba(23,25,26,.78)), url(${project.masterplan_image})` }
            : { background: 'repeating-linear-gradient(135deg, #2B302D 0 14px, #313733 14px 28px)' }}
        >
          {!project.masterplan_image && (
            <span className="absolute left-1/2 top-[22%] -translate-x-1/2 whitespace-nowrap text-[10px] tracking-[0.12em] uppercase text-[#C9C6BE] border border-dashed border-[#6B6A65] rounded px-2.5 py-1">[ Imagen de portada ]</span>
          )}
          {project.location && <span className="text-[10px] font-semibold tracking-[0.14em] uppercase text-[#E4E0D8]">{project.location}</span>}
          <span className="font-display text-[28px] leading-[1.05] font-semibold text-white tracking-[-0.02em]">{project.name || 'Nombre del proyecto'}</span>
          <span className="text-[13px] leading-snug text-white/90">{project.tagline || 'La bajada aparece acá'}</span>
          <span className="flex gap-2 pt-2">
            <span className="text-[11px] font-semibold px-3 py-1.5 rounded-full bg-white text-gray-900">{saleMode === 'venta' ? 'Ver unidades' : 'Ver proyecto'}</span>
            <span className="text-[11px] font-semibold px-3 py-1.5 rounded-full border border-white/70 text-white">Consultar</span>
          </span>
        </div>
        <div className="grid grid-cols-3 px-4 py-3 gap-2">
          <div><div className="font-display text-base font-semibold text-gray-900">{unitPrices.total || '—'}</div><div className="text-[10px] text-gray-500">{unitsWord}</div></div>
          <div><div className="font-display text-base font-semibold text-gray-900">{smallest ? `${Math.round(smallest.total_area as number)} m²` : '—'}</div><div className="text-[10px] text-gray-500">desde</div></div>
          <div><div className="font-display text-base font-semibold text-gray-900">{delivery || '—'}</div><div className="text-[10px] text-gray-500">entrega</div></div>
        </div>
      </div>
      <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <span className="text-[13px] font-semibold text-gray-900">Secciones que alimenta este capítulo</span>
          <Link href="/admin/sitio" className="text-[13px] font-semibold text-gray-900 underline underline-offset-2 shrink-0">Ordenar en Sitio</Link>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {['Portada', 'Cifras', 'Compartir en redes'].map(s => (
            <span key={s} className="min-h-[30px] px-3 flex items-center rounded-full bg-white border border-gray-200 text-xs text-gray-700">{s}</span>
          ))}
        </div>
      </div>
      <a href={publishState.siteHref} target="_blank" rel="noopener noreferrer" className="self-start text-[13px] font-medium text-gray-700 underline underline-offset-2 hover:text-gray-900">
        {publishState.published ? 'Ver sitio publicado ↗' : 'Abrir la vista previa ↗'}
      </a>
    </>
  );

  return (
    <FichaLayout aside={aside}>
      <ChapterHeader
        title="Esencial"
        description={`Lo primero que ve ${saleMode === 'venta' ? 'un comprador' : 'quien visita el proyecto'}. Con este capítulo completo el sitio ya se puede publicar; todo lo demás suma, pero no bloquea.`}
        actions={<span />}
      />

      <form onSubmit={e => { e.preventDefault(); ficha.save(); }} className="flex flex-col gap-7">
        <SectionRow title="Identidad" description="Nombre y ubicación tal como aparecen en el sitio y al compartir el link." first>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-gray-700">Nombre del proyecto</span>
            <input value={project.name} onChange={e => setProject({ ...project, name: e.target.value })} required className={`${fieldClass} text-[15px]`} />
          </label>
          <div className="grid gap-3.5 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-gray-700">Ciudad o zona</span>
              <input value={project.location ?? ''} onChange={e => setProject({ ...project, location: e.target.value })} placeholder="Ej: Punta del Este, Uruguay" className={fieldClass} />
            </label>
            <div className="flex flex-col gap-1.5 min-w-0">
              <span className="text-xs font-medium text-gray-700">Dirección pública</span>
              <div className="flex items-stretch min-h-[44px] rounded-[10px] border border-gray-300 bg-white overflow-hidden">
                <span className="flex-1 min-w-0 px-3 flex items-center font-mono text-xs text-gray-700 bg-gray-100 truncate" title={displayUrl}>{displayUrl}</span>
                <button type="button" onClick={handleCopyLink} className="px-3.5 border-l border-gray-300 text-[13px] font-semibold text-gray-900 hover:bg-gray-50 shrink-0">
                  {copied ? 'Copiado' : 'Copiar'}
                </button>
              </div>
            </div>
          </div>
        </SectionRow>

        <SectionRow
          title="Portada"
          description="Una imagen fuerte y una frase. Es lo único que se ve antes de hacer scroll."
          badge={!project.masterplan_image ? <Pill tone="warn">Requerido para publicar</Pill> : undefined}
        >
          <ImageUploader
            label="Imagen principal"
            value={project.masterplan_image ?? ''}
            onChange={url => setProject({ ...project, masterplan_image: url })}
            folder="masterplan"
          />
          <label className="flex flex-col gap-1.5">
            <span className="flex items-baseline justify-between gap-3">
              <span className="text-xs font-medium text-gray-700">Bajada de portada</span>
              <span className={`text-xs ${(project.tagline ?? '').length > 90 ? 'text-red-600' : 'text-gray-500'}`}>{(project.tagline ?? '').length} / 90</span>
            </span>
            <textarea
              value={project.tagline ?? ''}
              onChange={e => setProject({ ...project, tagline: e.target.value })}
              placeholder="Ej: 3 dormitorios frente al mar en Punta del Este"
              maxLength={140}
              rows={2}
              className={`${fieldClass} py-3 leading-relaxed resize-y text-[15px]`}
            />
            <span className="text-xs text-gray-500">Se resalta en la vista en vivo mientras escribís.</span>
          </label>
        </SectionRow>

        <SectionRow title="Tipo de proyecto" description="Define qué se pide después: pisos, unidades, lotes o nada.">
          <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(150px, 100%), 1fr))' }}>
            {FORM_ORDER.map(key => {
              const on = key === currentType;
              return (
                <div key={key} aria-current={on ? 'true' : undefined}
                  className={`flex flex-col gap-0.5 min-h-[58px] px-3 py-2.5 rounded-xl ${on ? 'border-[1.5px] border-brand-700 bg-brand-50' : 'border border-gray-200 bg-white opacity-60'}`}>
                  <span className="text-[13px] font-semibold text-gray-900">{PROJECT_STRUCTURES[key].label}</span>
                  <span className="text-[11px] text-gray-600">{FORM_HINTS[key]}</span>
                </div>
              );
            })}
          </div>
          <p className="m-0 text-xs text-gray-600">
            La forma se elige al crear el proyecto y queda fija: de ella depende toda la estructura ({buildings.length} {buildings.length === 1 ? buildingLabel.toLowerCase() : pluralize(buildingLabel.toLowerCase())} cargad{typeConfig.buildingLabelGender === 'f' ? 'a' : 'o'}{buildings.length === 1 ? '' : 's'}). Para otra forma, creá un proyecto nuevo.
          </p>
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-[13px] text-gray-700">Modalidad</span>
            <div role="radiogroup" aria-label="Modalidad" className="inline-flex p-[3px] rounded-[10px] bg-[#EAE7E0]">
              {(Object.keys(PROJECT_SALE_MODES) as ProjectSaleMode[]).map(m => {
                const allowed = structure?.allowedSaleModes.includes(m) ?? true;
                const on = m === saleMode;
                return (
                  <button key={m} type="button" role="radio" aria-checked={on} disabled={!allowed || switchingMode}
                    onClick={() => changeSaleMode(m)}
                    title={allowed ? PROJECT_SALE_MODES[m].description : `Un ${structure?.label.toLowerCase()} no se vende por unidades.`}
                    className={`min-h-[38px] px-3.5 rounded-lg text-[13px] disabled:opacity-40 ${on ? 'bg-white font-semibold text-gray-900 shadow-[0_1px_2px_rgba(23,25,26,0.06)]' : 'text-gray-600 hover:text-gray-900'}`}>
                    {PROJECT_SALE_MODES[m].label}
                  </button>
                );
              })}
            </div>
            {switchingMode && <span className="text-xs text-gray-600">Cambiando…</span>}
          </div>
        </SectionRow>

        <SectionRow title="Cifras clave" description="Las que salen de las unidades se calculan solas. No hay que cargarlas dos veces.">
          <div className="grid rounded-2xl border border-gray-200 bg-white overflow-hidden" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(150px, 100%), 1fr))' }}>
            <div className="px-4 py-4 flex flex-col gap-1">
              <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-500">{pluralize(unitLabel)}</span>
              <span className="font-display text-[28px] leading-none font-semibold text-gray-900">{unitPrices.total || '—'}</span>
              <span className="text-[11px] text-gray-500">↻ Automático</span>
            </div>
            <div className="px-4 py-4 flex flex-col gap-1 border-t sm:border-t-0 sm:border-l border-gray-200">
              <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-500">Desde</span>
              <span className="font-display text-[28px] leading-none font-semibold text-gray-900">{smallest ? <>{Math.round(smallest.total_area as number)} m²</> : '—'}</span>
              <span className="text-[11px] text-gray-500">{smallest ? `↻ ${smallest.model_name ? `De ${smallest.model_name}` : 'De las unidades'}` : 'Sin superficies cargadas'}</span>
            </div>
            <label className={`px-4 py-4 flex flex-col gap-1 border-t sm:border-t-0 sm:border-l border-gray-200 ${delivery ? '' : 'bg-amber-50'}`}>
              <span className={`text-[11px] font-semibold uppercase tracking-[0.08em] ${delivery ? 'text-gray-500' : 'text-amber-800'}`}>Entrega</span>
              <input
                value={delivery}
                onChange={e => setDelivery(e.target.value)}
                placeholder="Mes / año"
                maxLength={80}
                className="font-display text-[22px] leading-tight font-semibold text-gray-900 bg-transparent outline-none border-b border-gray-300 focus:border-brand-700 placeholder:text-gray-400 min-w-0"
              />
              <span className={`text-[11px] ${delivery ? 'text-gray-500' : 'text-amber-800'}`}>{delivery ? 'Se muestra en el sitio' : 'Sin cargar todavía'}</span>
            </label>
          </div>
          {slides.length === 0 && (
            <p className="m-0 text-xs text-gray-600">
              Todavía no hay {aerialLabelPlural.toLowerCase()}: se cargan en <Link href="/admin/proyecto/galeria" className="font-semibold underline underline-offset-2">Galería</Link>.
            </p>
          )}
        </SectionRow>
      </form>

      <ChapterFooter />
      <UnsavedBar dirty={ficha.dirty} saving={ficha.saving} onSave={() => ficha.save()} onDiscard={ficha.discard} />
    </FichaLayout>
  );
}
