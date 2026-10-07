'use client';

import { useEffect } from 'react';
import { useProjectBasePath } from '@/lib/project-base-path-context';

// Error del sitio público de un proyecto. Vive dentro del layout del
// proyecto, así que conserva su tema y su navegación, y "Volver" lleva a la
// home del proyecto (no a la landing de Atrium, como hacía el error global).
export default function ProjectError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const basePath = useProjectBasePath();

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-6 py-24 bg-[var(--theme-bg)]">
      <div className="flex flex-col items-center gap-4 text-center max-w-md">
        <h1 className="font-[family-name:var(--theme-font-heading)] text-2xl text-[var(--theme-text)]">
          No pudimos cargar esta página
        </h1>
        <p className="text-[var(--theme-text-muted)]">
          Puede ser un problema temporal. Probá de nuevo en unos segundos.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3 mt-2">
          <button
            type="button"
            onClick={reset}
            className="min-h-11 px-5 rounded-[var(--theme-radius)] bg-[var(--theme-accent)] text-[var(--theme-text-on-accent)] font-medium hover:opacity-90 transition-opacity"
          >
            Reintentar
          </button>
          <a
            href={basePath || '/'}
            className="min-h-11 px-5 inline-flex items-center rounded-[var(--theme-radius)] border border-[var(--theme-border)] text-[var(--theme-text)] font-medium hover:bg-[var(--theme-surface)] transition-colors"
          >
            Ir al inicio del proyecto
          </a>
        </div>
      </div>
    </div>
  );
}
