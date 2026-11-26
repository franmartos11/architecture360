'use client';

import { useState, useEffect, type CSSProperties } from 'react';
import Dialog from '@/components/ui/Dialog';
import ProjectHero from '@/components/project-landing/ProjectHero';
import { SECTION_COMPONENTS } from '@/components/project-landing/registry';
import { resolveSectionList, type SectionKey } from '@/lib/project-sections';
import { buildTemplateSectionConfig, getWebTemplate, WEB_TEMPLATES } from '@/lib/web-templates';
import { withPreviewSampleData } from '@/lib/preview-sample-project';
import { ALL_FONT_CLASSNAMES } from '@/lib/fonts';
import { formatPrice, pluralize } from '@/lib/units';
import { progressHeadline, showsConstructionProgress } from '@/lib/construction-progress-view';
import { projectHasContent } from '@/lib/project-content';
import type { Project, WebTemplateKey } from '@/types';
import type { ProjectTypeConfig } from '@/lib/project-types';

interface WebTemplatePreviewModalProps {
  open: boolean;
  initialTemplate: WebTemplateKey;
  activeTemplate: WebTemplateKey;
  project: Project;
  typeConfig: ProjectTypeConfig;
  themeCssVars: CSSProperties;
  emptyKeys: Set<SectionKey>;
  saving: boolean;
  onClose: () => void;
  onApply: (key: WebTemplateKey) => void;
}

/**
 * Vista previa comparativa de las 3 webs predefinidas usando los datos reales
 * del proyecto (portada, tipografías, paleta y secciones en el orden que
 * define cada plantilla) antes de aplicarla.
 */
export default function WebTemplatePreviewModal({
  open,
  initialTemplate,
  activeTemplate,
  project,
  typeConfig,
  themeCssVars,
  emptyKeys,
  saving,
  onClose,
  onApply,
}: WebTemplatePreviewModalProps) {
  const [tab, setTab] = useState<WebTemplateKey>(initialTemplate);
  const [includeHidden, setIncludeHidden] = useState(true);

  useEffect(() => {
    if (open) setTab(initialTemplate);
  }, [open, initialTemplate]);

  const tpl = getWebTemplate(tab);
  const sectionConfig = buildTemplateSectionConfig(tab);
  const resolved = resolveSectionList(sectionConfig, typeConfig);
  const availableSections = resolved.filter(s => s.available);
  const enabledSections = availableSections.filter(s => s.enabled);
  const hiddenSections = availableSections.filter(s => !s.enabled);

  // Completa con datos de muestra los bloques aún no cargados para poder ver
  // todos los componentes de la plantilla (incluidos los ocultos por defecto).
  const { project: sampleFilled, usedSample } = withPreviewSampleData(project, typeConfig);
  const previewProject: Project = {
    ...sampleFilled,
    themeConfig: { ...(sampleFilled.themeConfig ?? {}), webTemplate: tab },
  };
  const visibleInPreview = includeHidden ? availableSections : enabledSections;
  const previewOrder = visibleInPreview.map(s => s.key);
  const content = projectHasContent(previewProject);

  const cheapestAvailable = typeConfig.showPrice
    ? previewProject.units
        .filter(u => u.status === 'available' && typeof u.price === 'number' && u.price > 0)
        .reduce<typeof previewProject.units[number] | null>((min, u) => (!min || u.price! < min.price!) ? u : min, null)
    : null;
  const academicLine = [previewProject.academicInstitution, previewProject.academicYear].filter(Boolean).join(' · ');
  const heroMetaLine = typeConfig.saleMode === 'showcase'
    ? (academicLine || previewProject.location)
    : [
        previewProject.location,
        previewProject.units.length > 1 ? `${previewProject.units.length} ${pluralize(typeConfig.unitLabel).toLowerCase()}` : null,
        cheapestAvailable ? `Desde ${formatPrice(cheapestAvailable.price!, cheapestAvailable.currency)}` : null,
      ].filter(Boolean).join(' · ');

  const availableCount = previewProject.units.filter(u => u.status === 'available').length;
  const heroBadge = typeConfig.saleMode === 'showcase'
    ? (academicLine || undefined)
    : availableCount > 0
      ? `${availableCount} ${availableCount === 1 ? typeConfig.unitLabel.toLowerCase() + ' disponible' : pluralize(typeConfig.unitLabel).toLowerCase() + ' disponibles'}`
      : undefined;
  const progressText = showsConstructionProgress(previewProject.constructionProgress, previewOrder)
    ? progressHeadline(previewProject.constructionProgress)
    : null;
  const heroImage = previewProject.masterplanImage
    || previewProject.aerialSlides[0]?.imageUrl
    || 'https://images.unsplash.com/photo-1497366216548-37526070297c?ixlib=rb-4.0.3&auto=format&fit=crop&w=1920&q=80';

  const isCurrent = tab === activeTemplate;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="xl"
      title="Previsualizar web predefinida"
      description="Compará portada y disposición de secciones con los datos de tu proyecto antes de aplicarla."
      footer={(
        <div className="flex items-center justify-between gap-3 w-full flex-wrap">
          <span className="text-xs text-gray-500">
            Al aplicar podés seguir prendiendo, apagando y moviendo secciones abajo.
          </span>
          <div className="flex items-center gap-2 ml-auto">
            <button
              type="button"
              onClick={onClose}
              className="h-9 px-3.5 rounded-lg border border-gray-200 text-xs font-medium text-gray-700 hover:border-gray-300"
            >
              Cerrar
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => onApply(tab)}
              className="h-9 px-4 rounded-lg bg-gray-900 text-white text-xs font-semibold hover:bg-black disabled:opacity-50 transition-colors"
            >
              {saving ? 'Aplicando…' : isCurrent ? `Reaplicar orden de ${tpl.label}` : `Usar web ${tpl.label}`}
            </button>
          </div>
        </div>
      )}
    >
      <div className="space-y-4">
        {/* Selector de pestañas de las 3 webs */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2" role="tablist" aria-label="Plantillas de web">
          {WEB_TEMPLATES.map(item => {
            const on = tab === item.key;
            const current = activeTemplate === item.key;
            return (
              <button
                key={item.key}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => setTab(item.key)}
                className={`p-3 rounded-xl border text-left transition-colors flex items-start justify-between gap-2 ${
                  on
                    ? 'border-gray-900 bg-gray-900 text-white'
                    : 'border-gray-200 bg-white text-gray-800 hover:border-gray-300'
                }`}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-semibold">{item.label}</span>
                    {current && (
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${on ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-700'}`}>
                        Activa
                      </span>
                    )}
                  </div>
                  <p className={`m-0 text-[11px] mt-0.5 ${on ? 'text-white/75' : 'text-gray-500'}`}>
                    {item.tagline}
                  </p>
                </div>
              </button>
            );
          })}
        </div>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_260px] items-start">
          {/* Viewport scrolleable escalado con componentes reales */}
          <div className="rounded-xl border border-gray-200 bg-[#EFECE6] overflow-hidden">
            <div className="px-3 py-2 border-b border-gray-200 bg-white flex items-center justify-between gap-2 flex-wrap text-[11px] text-gray-500">
              <div className="flex items-center gap-2 min-w-0">
                <span className="font-mono truncate">/proyecto/{project.slug} · {tpl.label}</span>
                {usedSample && (
                  <span className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 text-[10px] shrink-0">
                    Con datos de muestra
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => setIncludeHidden(v => !v)}
                className="text-[11px] font-medium text-gray-700 hover:text-gray-900 underline underline-offset-2 shrink-0"
              >
                {includeHidden ? `Mostrando todos (${availableSections.length})` : `Solo activos (${enabledSections.length})`}
              </button>
            </div>
            <div className="h-[420px] sm:h-[470px] overflow-y-auto overflow-x-hidden bg-white">
              <div
                key={tab}
                data-web-template={tab}
                className={`atrium-reset pointer-events-none select-none origin-top-left ${ALL_FONT_CLASSNAMES}`}
                style={{
                  ...themeCssVars,
                  transform: 'scale(0.55)',
                  width: `${100 / 0.55}%`,
                }}
              >
                <div className="text-[var(--theme-text)] bg-[var(--theme-bg)]">
                  <ProjectHero
                    variant={tab}
                    previewCompact
                    badge={heroBadge}
                    name={previewProject.name}
                    image={heroImage}
                    tagline={previewProject.tagline || (typeConfig.saleMode === 'venta' ? 'Encontrá tu lugar' : undefined)}
                    meta={heroMetaLine || undefined}
                    primary={typeConfig.saleMode === 'venta' && content.units
                      ? { href: '#unidades', label: 'Ver disponibilidad' }
                      : content.facade
                        ? { href: '#masterplan', label: typeConfig.hasUnitStep ? 'Ver masterplan' : 'Ver vista frontal' }
                        : undefined}
                    secondary={content.tour ? { href: '#tour', label: 'Tour 360°' } : undefined}
                    progress={progressText ? { href: '#avance', text: progressText } : undefined}
                    briefUrl={previewProject.briefPdfUrl}
                  />
                  {visibleInPreview.map(s => {
                    const Comp = SECTION_COMPONENTS[s.key];
                    return (
                      <div key={s.key} className={!s.enabled ? 'relative opacity-75' : undefined}>
                        {!s.enabled && (
                          <div className="px-6 py-2 bg-black/5 border-y border-dashed border-gray-400/50 text-xs font-semibold uppercase tracking-[0.08em] text-gray-700">
                            {s.label} · oculto por defecto en {tpl.label} (podés prenderlo después)
                          </div>
                        )}
                        <Comp
                          project={previewProject}
                          typeConfig={typeConfig}
                          basePath={`/proyecto/${previewProject.slug}`}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Resumen de orden y componentes de la plantilla */}
          <aside className="rounded-xl border border-gray-200 bg-gray-50 p-4 space-y-4">
            <div>
              <p className="m-0 text-sm font-semibold text-gray-900">Web {tpl.label}</p>
              <p className="m-0 text-xs text-gray-600 mt-1 leading-relaxed">{tpl.description}</p>
            </div>

            <div className="space-y-1.5">
              <p className="m-0 text-[11px] font-semibold uppercase tracking-[0.06em] text-gray-500">
                Encendidas al inicio ({enabledSections.length})
              </p>
              <ol className="m-0 pl-4 space-y-1 text-xs text-gray-800">
                {enabledSections.map(s => (
                  <li key={s.key} className="leading-snug">
                    <span>{s.label}</span>
                    {emptyKeys.has(s.key) && (
                      <span className="ml-1 text-[10px] text-amber-700">(vacía)</span>
                    )}
                  </li>
                ))}
              </ol>
            </div>

            {hiddenSections.length > 0 && (
              <div className="space-y-1.5 pt-2 border-t border-gray-200">
                <p className="m-0 text-[11px] font-semibold uppercase tracking-[0.06em] text-gray-400">
                  Ocultas al inicio ({hiddenSections.length})
                </p>
                <div className="flex flex-wrap gap-1">
                  {hiddenSections.map(s => (
                    <span key={s.key} className="px-2 py-0.5 rounded-md bg-white border border-gray-200 text-[10.5px] text-gray-500">
                      {s.label}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </aside>
        </div>
      </div>
    </Dialog>
  );
}
