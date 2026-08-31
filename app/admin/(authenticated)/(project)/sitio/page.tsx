'use client';

import { useState, useEffect, startTransition } from 'react';
import { ExternalLink } from 'lucide-react';
import { TransitionLink as Link } from '@/components/ui/TransitionUtils';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import ErrorState from '@/components/ui/ErrorState';
import { Card, CardHeader } from '@/components/ui/Card';
import SectionPreviewFrame from '@/components/admin/SectionPreviewFrame';
import EditDrawer from '@/components/admin/EditDrawer';
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

// Centro de control de la landing — antes, editar el sitio significaba
// saber de memoria que "Amenidades" vive en /admin/proyecto/amenities,
// "Ubicación" en /admin/proyecto/ubicacion, etc. Acá se ve toda la
// composición de la página en un solo lugar, con una vista previa en
// vivo de cada sección (el MISMO componente que usa el sitio público,
// con los datos reales — no una maqueta aparte) y un link directo a
// dónde se edita. No duplica el toggle de mostrar/ocultar ni el
// reordenamiento: eso sigue viviendo en "Secciones", acá solo se linkea.
export default function AdminSitioPage() {
  const typeConfig = useProjectTypeConfig();
  const [project, setProject] = useState<Project | null>(null);
  const [sections, setSections] = useState<SectionRow[] | null>(null);
  const [emptyKeys, setEmptyKeys] = useState<Set<SectionKey>>(new Set());
  const [ownerFonts, setOwnerFonts] = useState<CustomFont[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [editingSection, setEditingSection] = useState<SectionKey | null>(null);
  const [editingPortada, setEditingPortada] = useState(false);

  const load = () => {
    startTransition(() => {
      setLoading(true);
      setLoadError(false);
    });
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

  if (loading) return <LoadingSpinner text="Cargando el sitio..." tone="light" />;
  if (loadError || !project || !sections) return <ErrorState message="No se pudo cargar el sitio." onRetry={load} />;

  const theme = resolveTheme(project.themeConfig, ownerFonts);

  return (
    <div className="space-y-6">
      {theme.fontFaceCss && <style dangerouslySetInnerHTML={{ __html: theme.fontFaceCss }} />}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 tracking-tight">Sitio web</h2>
          <p className="text-sm text-gray-500 mt-1">
            La composición de la landing de {project.name}, en el orden real. La mayoría de las secciones se editan ahí mismo, sin salir de esta
            pantalla — al guardar, la vista previa de abajo se actualiza al toque.
          </p>
        </div>
        <a
          href={getProjectHref(project.slug)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors whitespace-nowrap"
        >
          <ExternalLink className="w-4 h-4" />
          Ver sitio público
        </a>
      </div>

      <Card>
        <CardHeader>
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Portada</h3>
            <p className="text-sm text-gray-500">Nombre, bajada, ubicación y foto de fondo del hero.</p>
          </div>
          <button
            type="button"
            onClick={() => setEditingPortada(true)}
            className="text-sm font-medium text-brand-600 hover:text-brand-700 whitespace-nowrap shrink-0"
          >
            Editar
          </button>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Secciones</h3>
            <p className="text-sm text-gray-500">En el orden real de la página — para reordenarlas o apagarlas, andá a &quot;Secciones&quot;.</p>
          </div>
          <Link href="/admin/sitio/secciones" className="text-sm font-medium text-brand-600 hover:text-brand-700 whitespace-nowrap shrink-0">
            Reordenar / mostrar-ocultar →
          </Link>
        </CardHeader>
        <ul className="divide-y divide-gray-100">
          {sections.map((s, i) => {
            const href = sectionEditHref(s.key, typeConfig.hasFloorStep);
            const isEmpty = s.available && s.enabled && emptyKeys.has(s.key);
            const showPreview = s.available && s.enabled && !isEmpty;
            const SectionComponent = SECTION_COMPONENTS[s.key];
            const hasInlineEditor = s.key in SECTION_EDITORS;

            return (
              <li key={s.key} className={`px-6 py-5 ${!s.available ? 'opacity-50' : ''}`}>
                <div className="flex items-center gap-4 mb-3">
                  <span className="w-6 text-sm text-gray-300 font-mono shrink-0 text-right">{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className={`font-medium ${s.enabled && s.available ? 'text-gray-900' : 'text-gray-400'}`}>{s.label}</p>
                      {!s.enabled && s.available && (
                        <span className="text-xs font-medium text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">oculta</span>
                      )}
                      {!s.available && (
                        <span className="text-xs font-medium text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{s.unavailableReason}</span>
                      )}
                      {isEmpty && (
                        <span className="text-xs font-medium text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">vacía — nada para mostrar todavía</span>
                      )}
                    </div>
                    <p className="text-sm text-gray-500 mt-0.5">{sectionHint(s.key, typeConfig)}</p>
                  </div>
                  {hasInlineEditor ? (
                    <button
                      type="button"
                      onClick={() => setEditingSection(s.key)}
                      className="text-sm font-medium text-brand-600 hover:text-brand-700 whitespace-nowrap shrink-0"
                    >
                      Editar
                    </button>
                  ) : href && (
                    <Link href={href} className="text-sm font-medium text-brand-600 hover:text-brand-700 whitespace-nowrap shrink-0">
                      Editar →
                    </Link>
                  )}
                </div>

                {showPreview && (
                  <div className={`pl-10 ${ALL_FONT_CLASSNAMES}`} style={theme.cssVars as React.CSSProperties}>
                    <SectionPreviewFrame>
                      <SectionComponent project={project} typeConfig={typeConfig} basePath={`/proyecto/${project.slug}`} />
                    </SectionPreviewFrame>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </Card>

      <EditDrawer open={editingPortada} onClose={() => setEditingPortada(false)} title="Portada">
        <PortadaEditor onSaved={load} />
      </EditDrawer>

      <EditDrawer
        open={editingSection !== null}
        onClose={() => setEditingSection(null)}
        title={editingSection ? sections.find(s => s.key === editingSection)?.label ?? '' : ''}
      >
        {editingSection && (() => {
          const Editor = SECTION_EDITORS[editingSection];
          return Editor ? <Editor onSaved={load} /> : null;
        })()}
      </EditDrawer>
    </div>
  );
}
