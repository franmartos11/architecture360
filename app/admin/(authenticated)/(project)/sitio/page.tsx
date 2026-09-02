'use client';

import { useState, useEffect, useRef, startTransition } from 'react';
import { Reorder, useDragControls } from 'framer-motion';
import { GripVertical, ChevronUp, ChevronDown, ExternalLink, Eye, EyeOff } from 'lucide-react';
import { TransitionLink as Link } from '@/components/ui/TransitionUtils';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import ErrorState from '@/components/ui/ErrorState';
import { Card } from '@/components/ui/Card';
import { useToast } from '@/components/ui/ToastProvider';
import SectionPreviewFrame from '@/components/admin/SectionPreviewFrame';
import { useProjectTypeConfig } from '@/lib/project-type-context';
import { getProjectHref } from '@/lib/project-url';
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
  ok: 'bg-brand-500', empty: 'bg-amber-400', hidden: 'bg-gray-300', locked: 'bg-gray-200',
};

const STATUS_PILL: Partial<Record<Status, [string, string]>> = {
  empty: ['vacía — no se muestra', 'bg-amber-50 border-amber-200 text-amber-700'],
  hidden: ['oculta', 'bg-gray-100 border-gray-200 text-gray-600'],
  locked: ['no disponible', 'bg-gray-50 border-gray-200 text-gray-400'],
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
  const sectionsRef = useRef<SectionRow[] | null>(null);
  useEffect(() => { sectionsRef.current = sections; }, [sections]);

  const load = () => {
    startTransition(() => { setLoading(true); setLoadError(false); });
    Promise.all([
      fetch('/api/admin/project/preview').then(res => res.json()),
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

  useEffect(load, []);

  const persist = async (next: SectionRow[]) => {
    setSections(next);
    setSaving(true);
    const res = await fetch('/api/admin/project', {
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

  return (
    // xl+: el panel de edición no depende del scroll de la página — ambas
    // columnas quedan atadas a la altura visible (100vh menos el padding
    // fijo del shell) y cada una scrollea POR DENTRO. Antes el panel usaba
    // sticky y, con una lista larga, seleccionar una sección de más abajo
    // dejaba el panel scrolleado fuera de vista. Debajo de xl se apila
    // normal (scroll de página), no vale la pena forzar altura fija en mobile.
    <div className="flex flex-col xl:flex-row gap-6 xl:items-stretch xl:h-[calc(100vh-4rem)]">
      {/* ── Lista ─────────────────────────────────────────────── */}
      <div className="flex-1 min-w-0 w-full flex flex-col gap-4 xl:h-full xl:overflow-hidden">
        <div className="shrink-0 flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 tracking-tight">Secciones del sitio</h2>
            <p className="text-sm text-gray-500 mt-1 max-w-xl">
              Este es el orden real de la página. Arrastrá para reordenar, tocá el ojo para mostrar u ocultar, y editá el contenido en el panel de al lado.
            </p>
          </div>
          <a
            href={getProjectHref(project.slug)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors whitespace-nowrap"
          >
            <ExternalLink className="w-4 h-4" /> Ver sitio público
          </a>
        </div>

        <Card className="shrink-0 p-4 flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex flex-col gap-1.5 shrink-0 sm:min-w-[170px]">
            <p className="text-sm font-semibold text-gray-900">{okCount} de {publishable} secciones listas</p>
            <div className="flex gap-1">
              {sections.map(s => (
                <span key={s.key} title={s.label} className={`w-3 h-1.5 rounded-full ${STATUS_DOT[statuses.get(s.key)!]}`} />
              ))}
            </div>
          </div>
          <p className="flex-1 text-xs text-gray-500 leading-relaxed">
            {counts.pending
              ? `Te faltan ${counts.pending} con contenido. Las vacías no aparecen en el sitio hasta que cargues algo.`
              : 'Todas las secciones activas tienen contenido.'}
          </p>
          {counts.pending > 0 && (
            <button
              type="button"
              onClick={() => setFilter('pending')}
              className="shrink-0 h-8 px-3.5 rounded-lg text-xs font-medium bg-amber-50 border border-amber-200 text-amber-800 hover:bg-amber-100 transition-colors whitespace-nowrap"
            >
              Ver las {counts.pending} pendientes →
            </button>
          )}
        </Card>

        <div className="shrink-0 flex items-center gap-1.5 flex-wrap">
          {([
            ['all', `Todas · ${counts.all}`],
            ['pending', `Pendientes · ${counts.pending}`],
            ['hidden', `Ocultas · ${counts.hidden}`],
            ['locked', `No disponibles · ${counts.locked}`],
          ] as [Filter, string][]).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              className={`h-7 px-3 rounded-full text-xs font-medium border transition-colors whitespace-nowrap ${
                filter === key ? 'bg-gray-900 text-white border-gray-900' : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <Card className="flex-1 min-h-0 flex flex-col overflow-hidden">
          {filter === 'all' && (
            <button
              type="button"
              onClick={() => setSelected('portada')}
              className={`shrink-0 w-full flex items-center gap-3 px-4 sm:px-6 py-3.5 text-left border-b border-gray-100 transition-colors ${
                selected === 'portada' ? 'bg-brand-50' : 'bg-white hover:bg-gray-50'
              }`}
            >
              <span className="w-5 shrink-0" />
              <span className="w-4 text-xs text-gray-300 font-mono text-right shrink-0">·</span>
              <span className="flex-1 min-w-0">
                <span className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-gray-900">Portada</span>
                  <span className="shrink-0 text-[10px] font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">fija</span>
                </span>
                <span className="block text-xs text-gray-500 mt-0.5 truncate">Nombre, bajada, ubicación y foto de fondo del hero.</span>
              </span>
              <span className={`shrink-0 text-xs font-medium px-3 py-1.5 rounded-lg ${selected === 'portada' ? 'bg-gray-900 text-white' : 'border border-gray-200 text-gray-700'}`}>
                Editar
              </span>
            </button>
          )}

          <div className="flex-1 min-h-0 overflow-y-auto">
            {filteredSections.length === 0 ? (
              <div className="py-12 flex flex-col items-center gap-2 text-center px-6">
                <p className="text-sm font-medium text-gray-900">No hay secciones en este filtro</p>
                <button type="button" onClick={() => setFilter('all')} className="text-sm font-medium text-brand-600 hover:text-brand-700">
                  Ver todas las secciones
                </button>
              </div>
            ) : (
              <Reorder.Group as="ul" axis="y" values={filteredSections} onReorder={next => { if (filter === 'all') setSections(next); }} className="divide-y divide-gray-100">
                {filteredSections.map(s => {
                  const i = sections.indexOf(s);
                  return (
                    <SectionRowItem
                      key={s.key}
                      section={s}
                      index={i}
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
          </div>
        </Card>
      </div>

      {/* ── Panel de edición ──────────────────────────────────── */}
      <div className="w-full xl:w-[440px] shrink-0 xl:h-full">
        <Card className="flex flex-col xl:h-full">
          <div className="shrink-0 px-6 py-4 border-b border-gray-100">
            <p className="text-base font-semibold text-gray-900">{panelTitle}</p>
            <p className="text-xs text-gray-500 mt-0.5">{panelMeta}</p>
          </div>

          <div className="max-h-[70vh] xl:max-h-none xl:flex-1 xl:min-h-0 overflow-y-auto">
            {selected === 'portada' ? (
              <PortadaEditor onSaved={load} />
            ) : selRow ? (
              <SectionPanelBody
                row={selRow}
                status={selStatus}
                typeConfig={typeConfig}
                project={project}
                theme={theme}
                onSaved={load}
              />
            ) : null}
          </div>

          <div className="shrink-0 px-6 py-3 border-t border-gray-100 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => goStep(-1)}
              disabled={selIndex <= 0}
              aria-label="Sección anterior"
              className="w-9 h-9 flex items-center justify-center border border-gray-200 rounded-lg text-gray-700 hover:border-gray-300 disabled:opacity-30 disabled:hover:border-gray-200 transition-colors"
            >
              ←
            </button>
            <button
              type="button"
              onClick={() => goStep(1)}
              disabled={selIndex >= navOrder.length - 1}
              className="flex-1 h-9 px-4 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-30 disabled:hover:bg-gray-900 transition-colors"
            >
              Siguiente sección →
            </button>
          </div>
        </Card>
      </div>
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
  before_after: true, team: true, amenities: true, location: true,
};

function SectionPanelBody({
  row, status, typeConfig, project, theme, onSaved,
}: {
  row: SectionRow;
  status: Status;
  typeConfig: ReturnType<typeof useProjectTypeConfig>;
  project: Project;
  theme: ReturnType<typeof resolveTheme>;
  onSaved: () => void;
}) {
  if (status === 'locked') {
    return (
      <div className="p-6">
        <div className="p-4 bg-gray-50 border border-gray-200 rounded-xl space-y-2.5">
          <p className="text-sm font-medium text-gray-900">Esta sección todavía no aplica</p>
          <p className="text-xs text-gray-500 leading-relaxed">{row.unavailableReason ?? sectionHint(row.key, typeConfig)}</p>
          <Link
            href="/admin/settings"
            className="inline-flex items-center h-8 px-3 border border-gray-300 rounded-lg bg-white text-xs font-medium text-gray-900 hover:border-gray-400 transition-colors"
          >
            Cambiar modo de venta →
          </Link>
        </div>
      </div>
    );
  }

  const Editor = SECTION_EDITORS[row.key];
  const href = sectionEditHref(row.key, typeConfig.hasFloorStep);
  const SectionComponent = SECTION_COMPONENTS[row.key];

  return (
    <>
      {Editor ? (
        <div className={EDITOR_NEEDS_PADDING[row.key] ? 'p-6' : ''}>
          <Editor onSaved={onSaved} />
        </div>
      ) : (
        <div className="p-6">
          <div className="p-4 bg-brand-50 border border-brand-100 rounded-xl space-y-2.5">
            <p className="text-xs text-gray-600 leading-relaxed">{sectionHint(row.key, typeConfig)}</p>
            {href && (
              <Link
                href={href}
                className="inline-flex items-center h-8 px-3 border border-gray-200 rounded-lg bg-white text-xs font-medium text-gray-900 hover:border-gray-300 transition-colors"
              >
                Ir a editar →
              </Link>
            )}
          </div>
        </div>
      )}

      {/* Fondo distinto (en vez de otra línea divisoria) para separarlo del
          formulario de arriba — la mayoría de los editores YA terminan con
          su propio "pt-4 border-t" antes del botón Guardar, así que una
          segunda línea acá quedaba pegada a esa y se veía como un doble
          borde. */}
      <div className="mt-2 px-6 py-6 bg-gray-50">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2.5">Cómo se ve</p>
        <SectionPreviewFrame>
          <div className={ALL_FONT_CLASSNAMES} style={theme.cssVars as React.CSSProperties}>
            <SectionComponent project={project} typeConfig={typeConfig} basePath={`/proyecto/${project.slug}`} />
          </div>
        </SectionPreviewFrame>
      </div>
    </>
  );
}

function SectionRowItem({
  section: s, index, status, isSelected, saving, isFirst, isLast, draggableEnabled,
  onSelect, onToggle, onMoveUp, onMoveDown, onDragEnd,
}: {
  section: SectionRow;
  index: number;
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
  const pill = STATUS_PILL[status];

  return (
    <Reorder.Item
      value={s}
      dragListener={false}
      dragControls={dragControls}
      onDragEnd={onDragEnd}
      onClick={onSelect}
      className={`flex items-center gap-3 px-4 sm:px-6 py-3.5 cursor-pointer transition-colors ${isSelected ? 'bg-brand-50' : 'bg-white hover:bg-gray-50'}`}
      whileDrag={{ boxShadow: '0 10px 28px rgba(0,0,0,0.14)', zIndex: 10, position: 'relative' }}
    >
      <button
        type="button"
        onPointerDown={e => { if (draggableEnabled && !isLocked) dragControls.start(e); }}
        onClick={e => e.stopPropagation()}
        disabled={!draggableEnabled || isLocked}
        aria-label={`Arrastrar para reordenar ${s.label}`}
        className={`shrink-0 p-1 -ml-1 rounded text-gray-300 hover:text-gray-600 hover:bg-gray-100 touch-none ${
          draggableEnabled && !isLocked ? 'cursor-grab active:cursor-grabbing' : 'opacity-30 cursor-not-allowed'
        }`}
      >
        <GripVertical className="w-4 h-4" />
      </button>

      <span className="w-4 text-xs text-gray-300 font-mono text-right shrink-0">{index + 1}</span>

      <div className="flex-1 min-w-0 flex flex-col gap-0.5">
        <span className="flex items-center gap-2 flex-wrap">
          <span className={`text-sm font-semibold ${status === 'ok' || status === 'empty' ? 'text-gray-900' : 'text-gray-400'}`}>{s.label}</span>
          {pill && <span className={`shrink-0 text-[10px] font-medium border px-2 py-0.5 rounded-full ${pill[1]}`}>{pill[0]}</span>}
        </span>
      </div>

      <div className="shrink-0 flex flex-col -my-1">
        <button
          type="button"
          onClick={e => { e.stopPropagation(); onMoveUp(); }}
          disabled={isFirst || saving}
          aria-label={`Subir ${s.label}`}
          className="p-0.5 rounded text-gray-300 hover:text-gray-600 hover:bg-gray-100 disabled:opacity-25 disabled:hover:bg-transparent transition-colors"
        >
          <ChevronUp className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={e => { e.stopPropagation(); onMoveDown(); }}
          disabled={isLast || saving}
          aria-label={`Bajar ${s.label}`}
          className="p-0.5 rounded text-gray-300 hover:text-gray-600 hover:bg-gray-100 disabled:opacity-25 disabled:hover:bg-transparent transition-colors"
        >
          <ChevronDown className="w-3.5 h-3.5" />
        </button>
      </div>

      <button
        type="button"
        onClick={e => { e.stopPropagation(); if (!isLocked) onToggle(); }}
        disabled={saving || isLocked}
        title={isLocked ? 'No disponible' : status === 'hidden' ? 'Mostrar en el sitio' : 'Ocultar del sitio'}
        aria-label={`${status === 'hidden' ? 'Mostrar' : 'Ocultar'} ${s.label}`}
        className={`shrink-0 w-8 h-8 flex items-center justify-center rounded-lg transition-colors ${
          isLocked ? 'opacity-25 text-gray-400' : status === 'hidden' ? 'bg-gray-100 text-gray-600' : 'text-gray-400 hover:bg-gray-100 hover:text-gray-700'
        }`}
      >
        {status === 'hidden' || isLocked ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </button>

      <span className={`shrink-0 text-xs font-medium px-3 py-1.5 rounded-lg ${isSelected ? 'bg-gray-900 text-white' : isLocked ? 'text-gray-300' : 'border border-gray-200 text-gray-700'}`}>
        Editar
      </span>
    </Reorder.Item>
  );
}
