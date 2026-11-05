'use client';

import { useState, useEffect, useRef, startTransition } from 'react';
import { Reorder, useDragControls } from 'framer-motion';
import { GripVertical, ChevronUp, ChevronDown, ExternalLink, Eye, EyeOff } from 'lucide-react';
import { TransitionLink as Link } from '@/components/ui/TransitionUtils';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import ErrorState from '@/components/ui/ErrorState';
import { useToast } from '@/components/ui/ToastProvider';
import { useActiveProjectId, withActiveProject } from '@/lib/active-project-context';
import SectionPreviewFrame from '@/components/admin/SectionPreviewFrame';
import { useProjectTypeConfig } from '@/lib/project-type-context';
import { usePublishState } from '@/lib/publish-state-context';
import { resolveSectionList, sectionEditHref, sectionHint, computeEmptySectionKeys, type SectionKey } from '@/lib/project-sections';
import { SECTION_COMPONENTS } from '@/components/project-landing/registry';
import { SECTION_EDITORS } from '@/components/admin/section-editors/registry';
import PortadaEditor from '@/components/admin/section-editors/PortadaEditor';
import { resolveTheme } from '@/lib/resolve-theme';
import { ALL_FONT_CLASSNAMES } from '@/lib/fonts';
import type { Project, CustomFont } from '@/types';

interface SectionRow {
  key: SectionKey;
  label: string;
  enabled: boolean;
  available: boolean;
  unavailableReason?: string;
}

type Status = 'ok' | 'empty' | 'hidden' | 'locked';
type Filter = 'all' | 'pending' | 'hidden' | 'locked';
type Selected = 'portada' | SectionKey;

const STATUS_DOT: Record<Status, string> = {
  ok: 'bg-brand-700', empty: 'bg-[#E0B060]', hidden: 'bg-gray-300', locked: 'bg-gray-200',
};

// Centro de control de la landing, unificado en una sola pantalla: la
// lista de la izquierda es el orden real de la página (arrastrar
// reordena, el ojo prende/apaga) y el panel de la derecha edita el
// contenido de lo que esté seleccionado — mismos editores autocontenidos
// de components/admin/section-editors/*, ya no en un drawer aparte. Antes
// esto vivía partido en dos pantallas (/admin/sitio para el contenido,
// /admin/sitio/secciones para orden/visibilidad); ver lib/project-sections.ts.
export default function AdminSitioPage() {
  const typeConfig = useProjectTypeConfig();
  const publishState = usePublishState();
  const [project, setProject] = useState<Project | null>(null);
  const [sections, setSections] = useState<SectionRow[] | null>(null);
  const [emptyKeys, setEmptyKeys] = useState<Set<SectionKey>>(new Set());
  const [ownerFonts, setOwnerFonts] = useState<CustomFont[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  const [selected, setSelected] = useState<Selected>('portada');
  const toast = useToast();
  const activeProjectId = useActiveProjectId();
  const sectionsRef = useRef<SectionRow[] | null>(null);
  useEffect(() => { sectionsRef.current = sections; }, [sections]);

  const load = () => {
    startTransition(() => { setLoading(true); setLoadError(false); });
    Promise.all([
      fetch(withActiveProject('/api/admin/project/preview', activeProjectId)).then(res => res.json()),
      fetch('/api/admin/fonts').then(res => res.json()),
    ])
      .then(([data, fontsData]) => {
        if (!data.project) throw new Error('sin proyecto');
        setProject(data.project);
        setSections(resolveSectionList(data.project.sectionConfig, typeConfig));
        setEmptyKeys(computeEmptySectionKeys(data.project));
        setOwnerFonts((fontsData.fonts ?? []).map((f: { id: string; name: string; file_url: string; format: string }) => ({
          id: f.id, name: f.name, fileUrl: f.file_url, format: f.format,
        })));
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        setLoadError(true);
        setLoading(false);
      });
  };

  useEffect(load, [activeProjectId, typeConfig]);

  const persist = async (next: SectionRow[]) => {
    setSections(next);
    setSaving(true);
    const res = await fetch(withActiveProject('/api/admin/project', activeProjectId), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sectionConfig: next.map(({ key, enabled }) => ({ key, enabled })) }),
    });
    setSaving(false);
    if (!res.ok) toast('No se pudo guardar el cambio.', 'error');
  };

  const toggleSection = (key: SectionKey) => {
    if (!sections) return;
    persist(sections.map(s => (s.key === key ? { ...s, enabled: !s.enabled } : s)));
  };

  const moveSection = (index: number, direction: -1 | 1) => {
    if (!sections) return;
    const target = index + direction;
    if (target < 0 || target >= sections.length) return;
    const next = [...sections];
    [next[index], next[target]] = [next[target], next[index]];
    persist(next);
  };

  // Reorder.Group dispara onReorder en cada paso del arrastre — reordenar
  // localmente da el feedback visual fluido, guardar recién se hace una
  // vez, al soltar, para no mandar un PATCH por cada micro-paso.
  const handleDragEnd = () => { if (sectionsRef.current) persist(sectionsRef.current); };

  if (loading) return <LoadingSpinner text="Cargando el sitio..." tone="light" />;
  if (loadError || !project || !sections) return <ErrorState message="No se pudo cargar el sitio." onRetry={load} />;

  const theme = resolveTheme(project.themeConfig, ownerFonts);

  const statusOf = (s: SectionRow): Status => {
    if (!s.available) return 'locked';
    if (!s.enabled) return 'hidden';
    if (emptyKeys.has(s.key)) return 'empty';
    return 'ok';
  };
  const statuses = new Map(sections.map(s => [s.key, statusOf(s)]));
  const counts = {
    all: sections.length,
    pending: sections.filter(s => statuses.get(s.key) === 'empty').length,
    hidden: sections.filter(s => statuses.get(s.key) === 'hidden').length,
    locked: sections.filter(s => statuses.get(s.key) === 'locked').length,
  };
  const okCount = sections.filter(s => statuses.get(s.key) === 'ok').length;
  const publishable = sections.length - counts.locked;

  // Arrastrar solo tiene sentido reordenando la lista COMPLETA — filtrada,
  // los vecinos visuales no son vecinos reales, así que el handle de
  // arrastre se deshabilita (los botones ↑↓ siguen andando: operan sobre
  // el índice real, no el filtrado).
  const filteredSections = filter === 'all' ? sections : sections.filter(s => {
    const st = statuses.get(s.key);
    return (filter === 'pending' && st === 'empty') || (filter === 'hidden' && st === 'hidden') || (filter === 'locked' && st === 'locked');
  });

  const navOrder: Selected[] = ['portada', ...sections.map(s => s.key)];
  const selIndex = navOrder.indexOf(selected);
  const goStep = (dir: 1 | -1) => setSelected(navOrder[Math.min(navOrder.length - 1, Math.max(0, selIndex + dir))]);

  const selRow = selected === 'portada' ? null : sections.find(s => s.key === selected) ?? null;
  const selStatus = selRow ? statuses.get(selRow.key)! : 'ok';
  const panelTitle = selected === 'portada' ? 'Portada' : selRow?.label ?? '';
  const panelMeta = selected === 'portada'
    ? 'Fija — siempre es la primera sección'
    : selRow
    ? `Sección ${sections.indexOf(selRow) + 1} de ${sections.length} · ${selStatus === 'hidden' ? 'oculta del sitio' : selStatus === 'locked' ? 'no disponible' : 'visible en el sitio'}`
    : '';

  const selectedSectionComponent = selRow && selStatus !== 'locked' ? SECTION_COMPONENTS[selRow.key] : null;

  return (
    // Tres columnas del diseño ("Sitio · Secciones"): la lista de secciones
    // (orden real de la página), la vista de cómo se lee lo seleccionado y
    // el panel para editarlo. En xl+ cada columna ocupa el alto visible y
    // scrollea POR DENTRO (antes el panel sticky quedaba fuera de vista con
    // listas largas); debajo de xl se apilan con scroll de página. -m-6
    // md:-m-8 anula el padding del shell para que las columnas lleguen a
    // los bordes como en el diseño.
    <div className="-m-6 md:-m-8 flex flex-col xl:flex-row xl:h-screen bg-[#F5F3EE]">
      {/* ── Lista ─────────────────────────────────────────────── */}
      <section aria-label="Secciones" className="xl:w-[320px] shrink-0 px-4 sm:px-6 py-8 flex flex-col gap-4 xl:overflow-y-auto border-b xl:border-b-0 xl:border-r border-gray-200">
        <div className="flex flex-col gap-2">
          <p className="m-0 text-[11px] font-semibold uppercase tracking-[0.1em] text-gray-500">Sitio web</p>
          <h1 className="m-0 text-[36px] leading-[1.05] font-semibold text-gray-900">Secciones</h1>
          <p className="m-0 text-[13px] leading-relaxed text-gray-600">
            Este es el orden real de la página. Arrastrá para reordenar, tocá el ojo para mostrar u ocultar, y editá cada una en el panel.
          </p>
        </div>

        <div className="flex items-center gap-3 px-4 py-3 rounded-[14px] border border-gray-200 bg-white">
          <span className="font-display text-[22px] font-semibold text-gray-900">{okCount}/{publishable}</span>
          <span className="flex-1 text-xs leading-snug text-gray-600">secciones con contenido</span>
          {counts.pending > 0 && (
            <button type="button" onClick={() => setFilter(filter === 'pending' ? 'all' : 'pending')}
              className="shrink-0 text-[11px] font-semibold px-2.5 py-1 rounded-full bg-amber-100 text-amber-800 hover:bg-amber-200">
              {counts.pending} vacía{counts.pending === 1 ? '' : 's'}
            </button>
          )}
        </div>

        <div className="flex items-center gap-1 flex-wrap">
          {([
            ['all', `Todas ${counts.all}`],
            ['pending', `Vacías ${counts.pending}`],
            ['hidden', `Ocultas ${counts.hidden}`],
            ['locked', `No disponibles ${counts.locked}`],
          ] as [Filter, string][]).filter(([key]) => key === 'all' || counts[key] > 0).map(([key, label]) => (
            <button key={key} type="button" onClick={() => setFilter(key)} aria-pressed={filter === key}
              className={`min-h-[32px] px-2.5 rounded-lg text-xs transition-colors ${filter === key ? 'bg-[#EAE7E0] font-semibold text-gray-900' : 'text-gray-600 hover:text-gray-900'}`}>
              {label}
            </button>
          ))}
        </div>

        {filter === 'all' && (
          <button
            type="button"
            onClick={() => setSelected('portada')}
            className={`w-full flex items-center gap-3 min-h-[52px] px-3.5 rounded-xl text-left bg-white transition-colors ${
              selected === 'portada' ? 'border-[1.5px] border-gray-900' : 'border border-gray-200 hover:border-gray-300'
            }`}
          >
            <span className="w-4 shrink-0" />
            <span className="w-2 h-2 rounded-full shrink-0 bg-gray-900" />
            <span className="flex-1 min-w-0 flex flex-col">
              <span className="text-sm font-semibold text-gray-900">Portada</span>
              <span className="text-[11px] text-gray-500 truncate">Fija · nombre, bajada y foto</span>
            </span>
          </button>
        )}

        {filteredSections.length === 0 ? (
          <div className="py-8 flex flex-col items-center gap-2 text-center">
            <p className="m-0 text-sm font-medium text-gray-900">No hay secciones en este filtro</p>
            <button type="button" onClick={() => setFilter('all')} className="min-h-[40px] text-sm font-semibold text-gray-900 underline underline-offset-2">
              Ver todas las secciones
            </button>
          </div>
        ) : (
          <Reorder.Group as="ul" axis="y" values={filteredSections} onReorder={next => { if (filter === 'all') setSections(next); }} className="flex flex-col gap-2 m-0 p-0 list-none">
            {filteredSections.map(s => {
              const i = sections.indexOf(s);
              return (
                <SectionRowItem
                  key={s.key}
                  section={s}
                  status={statuses.get(s.key)!}
                  isSelected={selected === s.key}
                  saving={saving}
                  isFirst={i === 0}
                  isLast={i === sections.length - 1}
                  draggableEnabled={filter === 'all'}
                  onSelect={() => setSelected(s.key)}
                  onToggle={() => toggleSection(s.key)}
                  onMoveUp={() => moveSection(i, -1)}
                  onMoveDown={() => moveSection(i, 1)}
                  onDragEnd={handleDragEnd}
                />
              );
            })}
          </Reorder.Group>
        )}
      </section>

      {/* ── Vista ─────────────────────────────────────────────── */}
      <section aria-label="Vista previa" className="flex-1 min-w-0 px-4 sm:px-8 py-8 bg-[#EFECE6] flex flex-col gap-4 xl:overflow-y-auto">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <span className="text-[13px] font-semibold text-gray-900">Así se ve · {panelTitle}</span>
          <a href={publishState.siteHref} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 min-h-[36px] text-[13px] font-semibold text-gray-900 underline underline-offset-2">
            {publishState.published ? 'Abrir en tamaño real' : 'Vista previa (borrador)'} <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
          </a>
        </div>
        <div className="rounded-2xl overflow-hidden bg-white shadow-[0_1px_2px_rgba(23,25,26,0.06),0_16px_40px_-16px_rgba(23,25,26,0.22)]">
          {selected === 'portada' ? (
            <div className="relative aspect-[16/10] flex items-end p-6"
              style={project.masterplanImage ? undefined : { background: 'repeating-linear-gradient(135deg, #3D4741 0 14px, #39433D 14px 28px)' }}>
              {project.masterplanImage && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={project.masterplanImage} alt="" className="absolute inset-0 w-full h-full object-cover" />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" aria-hidden="true" />
              <div className="relative flex flex-col gap-1 text-white">
                {project.location && <span className="text-[10px] font-semibold uppercase tracking-[0.14em] opacity-90">{project.location}</span>}
                <span className="font-display text-[28px] leading-tight font-semibold tracking-[-0.02em]">{project.name}</span>
                {project.tagline && <span className="text-[13px] opacity-90">{project.tagline}</span>}
              </div>
            </div>
          ) : selectedSectionComponent ? (
            <SectionPreviewFrame height={520} scale={0.45}>
              <div className={ALL_FONT_CLASSNAMES} style={theme.cssVars as React.CSSProperties}>
                {(() => { const C = selectedSectionComponent; return <C project={project} typeConfig={typeConfig} basePath={`/proyecto/${project.slug}`} />; })()}
              </div>
            </SectionPreviewFrame>
          ) : (
            <div className="aspect-[16/10] flex items-center justify-center p-8 text-center text-[13px] text-gray-600">
              Esta sección no aplica a este proyecto, así que no se muestra en el sitio.
            </div>
          )}
        </div>
        {selStatus === 'empty' && (
          <p className="m-0 text-xs text-amber-800">Está vacía: no aparece en el sitio hasta que le cargues contenido.</p>
        )}
      </section>

      {/* ── Panel de edición ──────────────────────────────────── */}
      <aside aria-label="Editar sección" className="xl:w-[360px] shrink-0 bg-gray-50 border-t xl:border-t-0 xl:border-l border-gray-200 flex flex-col xl:h-full">
        <div className="shrink-0 px-6 pt-8 pb-4">
          <p className="m-0 text-xs text-gray-600">{panelMeta}</p>
          <p className="m-0 mt-1 font-display text-[24px] leading-tight font-semibold tracking-[-0.02em] text-gray-900">{panelTitle}</p>
        </div>

        <div className="xl:flex-1 xl:min-h-0 xl:overflow-y-auto">
          {selected === 'portada' ? (
            <PortadaEditor onSaved={load} />
          ) : selRow ? (
            <SectionPanelBody row={selRow} status={selStatus} typeConfig={typeConfig} onSaved={load} />
          ) : null}
        </div>

        <div className="shrink-0 px-6 py-4 border-t border-gray-200 flex items-center gap-2">
          <button
            type="button"
            onClick={() => goStep(-1)}
            disabled={selIndex <= 0}
            aria-label="Sección anterior"
            className="w-11 h-11 flex items-center justify-center border border-gray-300 bg-white rounded-[10px] text-gray-900 hover:border-gray-400 disabled:opacity-30"
          >
            ←
          </button>
          <button
            type="button"
            onClick={() => goStep(1)}
            disabled={selIndex >= navOrder.length - 1}
            className="flex-1 min-h-[44px] px-4 bg-gray-900 text-white rounded-[10px] text-sm font-semibold hover:bg-black disabled:opacity-30"
          >
            Siguiente sección →
          </button>
        </div>
      </aside>
    </div>
  );
}

// Los editores de components/admin/section-editors/* tienen dos linajes
// distintos: algunos (About/Portada/Masterplan/Calculator/Process) se
// auto-paddean (`p-6`) porque nacieron para vivir en un drawer/panel;
// otros (BeforeAfter/Team/Amenities/Location) NO — nacieron para vivir
// dentro de una página propia que ya trae su padding alrededor (ver sus
// otros usos: /admin/proyecto/amenities, /admin/proyecto/ubicacion,
// /admin/settings). Acá no hay ninguna página alrededor, así que a esos
// hay que darles el padding nosotros — sin tocar el componente compartido
// y arriesgar duplicar el padding en su página propia.
const EDITOR_NEEDS_PADDING: Partial<Record<SectionKey, true>> = {
  before_after: true, team: true, amenities: true, location: true, progress: true,
};

function SectionPanelBody({
  row, status, typeConfig, onSaved,
}: {
  row: SectionRow;
  status: Status;
  typeConfig: ReturnType<typeof useProjectTypeConfig>;
  onSaved: () => void;
}) {
  if (status === 'locked') {
    return (
      <div className="px-6 pb-6">
        <div className="p-4 bg-white border border-gray-200 rounded-[14px] flex flex-col gap-2.5">
          <p className="m-0 text-sm font-semibold text-gray-900">Esta sección todavía no aplica</p>
          <p className="m-0 text-xs text-gray-600 leading-relaxed">{row.unavailableReason ?? sectionHint(row.key, typeConfig)}</p>
          <Link
            href="/admin/settings"
            className="self-start inline-flex items-center min-h-[36px] px-3 border border-gray-300 rounded-lg bg-white text-xs font-semibold text-gray-900 hover:border-gray-400"
          >
            Cambiar modo de venta →
          </Link>
        </div>
      </div>
    );
  }

  const Editor = SECTION_EDITORS[row.key];
  const href = sectionEditHref(row.key, typeConfig.hasFloorStep);

  return Editor ? (
    <div className={EDITOR_NEEDS_PADDING[row.key] ? 'px-6 pb-6' : ''}>
      <Editor onSaved={onSaved} />
    </div>
  ) : (
    <div className="px-6 pb-6">
      <div className="p-4 bg-white border border-gray-200 rounded-[14px] flex flex-col gap-2.5">
        <p className="m-0 text-[13px] font-semibold text-gray-900">Contenido</p>
        <p className="m-0 text-xs text-gray-600 leading-relaxed">{sectionHint(row.key, typeConfig)}</p>
        {href && (
          <Link href={href} className="self-start min-h-[32px] inline-flex items-center text-[13px] font-semibold text-gray-900 underline underline-offset-2">
            Ir a editar →
          </Link>
        )}
      </div>
    </div>
  );
}

const STATUS_SUB: Record<Status, string> = {
  ok: 'Con contenido',
  empty: 'Vacía · no se muestra',
  hidden: 'Oculta',
  locked: 'No disponible',
};

function SectionRowItem({
  section: s, status, isSelected, saving, isFirst, isLast, draggableEnabled,
  onSelect, onToggle, onMoveUp, onMoveDown, onDragEnd,
}: {
  section: SectionRow;
  status: Status;
  isSelected: boolean;
  saving: boolean;
  isFirst: boolean;
  isLast: boolean;
  draggableEnabled: boolean;
  onSelect: () => void;
  onToggle: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDragEnd: () => void;
}) {
  const dragControls = useDragControls();
  const isLocked = status === 'locked';
  const muted = status === 'hidden' || isLocked;

  return (
    <Reorder.Item
      value={s}
      dragListener={false}
      dragControls={dragControls}
      onDragEnd={onDragEnd}
      onClick={onSelect}
      className={`group flex items-center gap-2 min-h-[52px] pl-1.5 pr-1.5 rounded-xl bg-white cursor-pointer transition-colors ${
        isSelected ? 'border-[1.5px] border-gray-900' : 'border border-gray-200 hover:border-gray-300'
      }`}
      whileDrag={{ boxShadow: '0 10px 28px rgba(23,25,26,0.14)', zIndex: 10, position: 'relative' }}
    >
      <button
        type="button"
        onPointerDown={e => { if (draggableEnabled && !isLocked) dragControls.start(e); }}
        onClick={e => e.stopPropagation()}
        disabled={!draggableEnabled || isLocked}
        aria-label={`Arrastrar para reordenar ${s.label}`}
        className={`shrink-0 w-7 h-9 flex items-center justify-center rounded text-gray-400 hover:text-gray-700 touch-none ${
          draggableEnabled && !isLocked ? 'cursor-grab active:cursor-grabbing' : 'opacity-30 cursor-not-allowed'
        }`}
      >
        <GripVertical className="w-4 h-4" />
      </button>

      <span aria-hidden="true" className={`w-2 h-2 rounded-full shrink-0 ${STATUS_DOT[status]}`} />

      <span className="flex-1 min-w-0 flex flex-col">
        <span className={`text-sm font-semibold truncate ${muted ? 'text-gray-500' : 'text-gray-900'}`}>{s.label}</span>
        <span className={`text-[11px] truncate ${status === 'empty' ? 'text-amber-800' : 'text-gray-500'}`}>{STATUS_SUB[status]}</span>
      </span>

      <span className="shrink-0 flex xl:hidden xl:group-hover:flex xl:group-focus-within:flex flex-col">
        <button
          type="button"
          onClick={e => { e.stopPropagation(); onMoveUp(); }}
          disabled={isFirst || saving}
          aria-label={`Subir ${s.label}`}
          className="w-7 h-5 flex items-center justify-center rounded text-gray-500 hover:text-gray-900 disabled:opacity-25"
        >
          <ChevronUp className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={e => { e.stopPropagation(); onMoveDown(); }}
          disabled={isLast || saving}
          aria-label={`Bajar ${s.label}`}
          className="w-7 h-5 flex items-center justify-center rounded text-gray-500 hover:text-gray-900 disabled:opacity-25"
        >
          <ChevronDown className="w-3.5 h-3.5" />
        </button>
      </span>

      <button
        type="button"
        onClick={e => { e.stopPropagation(); if (!isLocked) onToggle(); }}
        disabled={saving || isLocked}
        title={isLocked ? 'No disponible' : status === 'hidden' ? 'Mostrar en el sitio' : 'Ocultar del sitio'}
        aria-label={`${status === 'hidden' ? 'Mostrar' : 'Ocultar'} ${s.label}`}
        className={`shrink-0 w-10 h-10 flex items-center justify-center rounded-lg transition-colors ${
          isLocked ? 'opacity-30 text-gray-500' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
        }`}
      >
        {status === 'hidden' || isLocked ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </button>
    </Reorder.Item>
  );
}
