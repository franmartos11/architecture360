'use client';

import { useEffect, useState } from 'react';
import { useActiveProjectId, withActiveProject } from '@/lib/active-project-context';
import { useToast } from '@/components/ui/ToastProvider';
import type { ThemeConfig } from '@/types';

/**
 * Lee `theme_config` del proyecto activo y expone un `savePatch(updates)` que
 * relee o fusiona sobre el objeto actual para nunca pisar colores, fuentes ni
 * otros bloques guardados dentro de `theme_config`.
 */
export function useThemeSectionEditor() {
  const activeProjectId = useActiveProjectId();
  const toast = useToast();
  const [themeConfig, setThemeConfig] = useState<ThemeConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch(withActiveProject('/api/admin/project', activeProjectId))
      .then(res => res.json())
      .then(data => {
        setThemeConfig((data.project?.theme_config as ThemeConfig | null) ?? {});
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [activeProjectId]);

  const savePatch = async (updates: Partial<ThemeConfig>, extra?: Record<string, unknown>): Promise<boolean> => {
    setSaving(true);
    let base: ThemeConfig = themeConfig ?? {};
    try {
      const freshRes = await fetch(withActiveProject('/api/admin/project', activeProjectId));
      if (freshRes.ok) {
        const freshData = await freshRes.json();
        base = (freshData.project?.theme_config as ThemeConfig | null) ?? base;
      }
    } catch {
      // Fallback to loaded copy
    }
    const nextTheme: ThemeConfig = { ...base, ...updates };
    const res = await fetch(withActiveProject('/api/admin/project', activeProjectId), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ themeConfig: nextTheme, ...extra }),
    });
    setSaving(false);
    if (res.ok) {
      setThemeConfig(nextTheme);
      toast('Guardado.');
      return true;
    }
    toast('Error al guardar.', 'error');
    return false;
  };

  return { themeConfig, loading, saving, savePatch };
}
