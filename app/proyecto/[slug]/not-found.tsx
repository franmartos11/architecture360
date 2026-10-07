'use client';

import { useProjectBasePath } from '@/lib/project-base-path-context';

// 404 dentro del sitio de un proyecto que existe (un edificio, piso o
// unidad que ya no está, un link viejo). Conserva el tema del proyecto y
// devuelve a su home. Un slug de proyecto inexistente lo resuelve el
// notFound() del layout y cae en el 404 global, porque acá no hay proyecto.
export default function ProjectNotFound() {
  const basePath = useProjectBasePath();

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-6 py-24 bg-[var(--theme-bg)]">
      <div className="flex flex-col items-center gap-4 text-center max-w-md">
        <h1 className="font-[family-name:var(--theme-font-heading)] text-2xl text-[var(--theme-text)]">
          No encontramos esta página
        </h1>
        <p className="text-[var(--theme-text-muted)]">
          Puede que el link esté desactualizado o que esa parte del proyecto ya no esté publicada.
        </p>
        <a
          href={basePath || '/'}
          className="mt-2 min-h-11 px-5 inline-flex items-center rounded-[var(--theme-radius)] bg-[var(--theme-accent)] text-[var(--theme-text-on-accent)] font-medium hover:opacity-90 transition-opacity"
        >
          Ir al inicio del proyecto
        </a>
      </div>
    </div>
  );
}
