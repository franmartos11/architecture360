'use client';

import { useEffect, useState } from 'react';
import { resolveSectionList, computeEmptySectionKeys, type SectionKey } from '@/lib/project-sections';
import type { ProjectTypeConfig } from '@/lib/project-types';

export interface MissingSection {
  key: SectionKey;
  label: string;
}

// Qué secciones de la landing pública están habilitadas y disponibles
// para este tipo de proyecto pero todavía no tienen contenido cargado —
// mismo criterio que ya usa /admin/sitio, para poder avisarle al admin
// ANTES de que comparta el link, en vez de que se entere por un cliente
// que vio una página vacía.
export function useProjectCompleteness(typeConfig: ProjectTypeConfig) {
  const [missing, setMissing] = useState<MissingSection[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch('/api/admin/project/preview')
      .then(res => res.json())
      .then(data => {
        if (cancelled || !data.project) return;
        const emptyKeys = computeEmptySectionKeys(data.project);
        const list = resolveSectionList(data.project.sectionConfig, typeConfig)
          .filter(s => s.enabled && s.available && emptyKeys.has(s.key))
          .map(s => ({ key: s.key, label: s.label }));
        setMissing(list);
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typeConfig.saleMode, typeConfig.buildingLabel, typeConfig.unitLabel]);

  return { missing, loading };
}
