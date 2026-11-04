'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';
import { resolveSectionList, computeEmptySectionKeys, type SectionKey } from '@/lib/project-sections';
import { withActiveProject } from '@/lib/active-project-context';
import { getPublishReadiness, type ReadinessItem } from '@/lib/publish-readiness';
import { getProjectHref, getProjectPreviewHref } from '@/lib/project-url';
import { getProjectTypeConfig } from '@/lib/project-types';

export interface MissingSection {
  key: SectionKey;
  label: string;
}

interface PublishState {
  published: boolean;
  /** Lo obligatorio para publicar (lib/publish-readiness), con su estado. */
  requiredItems: ReadinessItem[];
  /** Labels de lo obligatorio que falta — vacío = se puede publicar. */
  missingRequired: string[];
  canPublish: boolean;
  /** Secciones de la landing habilitadas pero vacías — recomendado, no bloquea. */
  missingSections: MissingSection[];
  loading: boolean;
  /** A dónde lleva "Ver sitio": el link público, o la vista previa si es borrador. */
  siteHref: string;
  refresh: () => void;
  setPublished: (next: boolean) => Promise<{ ok: boolean; error?: string }>;
}

const PublishStateContext = createContext<PublishState | null>(null);

// Un solo lugar para "¿el sitio está en línea y qué le falta?". Antes cada
// pantalla tenía su criterio (el aviso de secciones vacías del sidebar, el
// checklist de /admin/proyecto, el toggle de Configuración) y ninguno decía
// si el sitio estaba publicado: se podía completar todo, ver desaparecer el
// aviso y seguir con el sitio en borrador, dando 404.
//
// Se vuelve a pedir al navegar entre pantallas del panel y al volver a la
// pestaña, para que lo que se cargó en otra pantalla (un lote, la vista
// aérea) se refleje sin recargar.
export function PublishStateProvider({
  projectId,
  slug,
  initialPublished,
  projectType,
  saleMode,
  children,
}: {
  projectId: string;
  slug: string;
  initialPublished: boolean;
  projectType: string;
  saleMode: string;
  children?: React.ReactNode;
}) {
  // Memoizado por los strings: un objeto nuevo en cada render dispararía el
  // fetch de abajo en loop.
  const typeConfig = useMemo(() => getProjectTypeConfig(projectType, saleMode), [projectType, saleMode]);
  const pathname = usePathname();
  const [published, setPublishedState] = useState(initialPublished);
  const [requiredItems, setRequiredItems] = useState<ReadinessItem[]>([]);
  const [missingSections, setMissingSections] = useState<MissingSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  const refresh = useCallback(() => setTick(t => t + 1), []);

  useEffect(() => {
    let cancelled = false;
    fetch(withActiveProject('/api/admin/project/preview', projectId))
      .then(res => res.json())
      .then(data => {
        if (cancelled || !data.project) return;
        setRequiredItems(getPublishReadiness(data.project, typeConfig).items);
        const emptyKeys = computeEmptySectionKeys(data.project);
        setMissingSections(
          resolveSectionList(data.project.sectionConfig, typeConfig)
            .filter(s => s.enabled && s.available && emptyKeys.has(s.key))
            .map(s => ({ key: s.key, label: s.label }))
        );
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [projectId, typeConfig, pathname, tick]);

  useEffect(() => {
    const onFocus = () => refresh();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [refresh]);

  const setPublished = useCallback(async (next: boolean) => {
    const res = await fetch(withActiveProject('/api/admin/project', projectId), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ published: next }),
    });
    if (res.ok) {
      setPublishedState(next);
      return { ok: true };
    }
    const data = await res.json().catch(() => ({}));
    // 422: el server encontró algo que falta y acá no lo sabíamos (se
    // borró en otra pestaña) — refrescar para que la lista lo muestre.
    if (res.status === 422) refresh();
    return { ok: false, error: data.error ?? 'No se pudo cambiar la visibilidad del proyecto.' };
  }, [projectId, refresh]);

  const value = useMemo<PublishState>(() => {
    const missingRequired = requiredItems.filter(i => !i.ok).map(i => i.label);
    return {
      published,
      requiredItems,
      missingRequired,
      // Mientras carga no se sabe: no bloquear de antemano (el server valida igual).
      canPublish: missingRequired.length === 0,
      missingSections,
      loading,
      siteHref: published ? getProjectHref(slug) : getProjectPreviewHref(slug),
      refresh,
      setPublished,
    };
  }, [published, requiredItems, missingSections, loading, slug, refresh, setPublished]);

  return <PublishStateContext.Provider value={value}>{children}</PublishStateContext.Provider>;
}

export function usePublishState(): PublishState {
  const ctx = useContext(PublishStateContext);
  if (!ctx) throw new Error('usePublishState fuera de PublishStateProvider');
  return ctx;
}
