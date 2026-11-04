'use client';

import { Suspense, useCallback } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import ErrorState from '@/components/ui/ErrorState';
import { useGuidedTree, type GuidedProject, type GuidedTree } from './shared';
import EdificioFlow from './EdificioFlow';
import DuplexFlow from './DuplexFlow';
import CasaFlow from './CasaFlow';
import LoteoFlow from './LoteoFlow';
import UnicoFlow from './UnicoFlow';

/** Lo que recibe cada flujo. `step` es 1-based y vive en la URL (?paso=N) para que "atrás" del navegador y recargar funcionen. */
export interface FlowProps {
  project: GuidedProject;
  tree: GuidedTree;
  setTree: (t: GuidedTree) => void;
  reload: () => Promise<void>;
  /** null = el flujo decide (ej. si ya hay estructura arranca en el paso 2). */
  step: number | null;
  goTo: (n: number) => void;
}

export default function GuidedLoad({ project }: { project: GuidedProject }) {
  return (
    <Suspense fallback={<LoadingSpinner text="Cargando..." tone="light" />}>
      <GuidedLoadInner project={project} />
    </Suspense>
  );
}

function GuidedLoadInner({ project }: { project: GuidedProject }) {
  const { tree, setTree, loading, error, reload } = useGuidedTree();
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const raw = Number(searchParams.get('paso'));
  const step = Number.isFinite(raw) && raw >= 1 ? Math.floor(raw) : null;

  const goTo = useCallback((n: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('paso', String(n));
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [router, pathname, searchParams]);

  if (loading) return <LoadingSpinner text="Cargando..." tone="light" />;
  if (error || !tree) return <div className="p-6"><ErrorState message={error ?? 'No se pudo cargar el proyecto'} onRetry={reload} /></div>;

  const props: FlowProps = { project, tree, setTree, reload, step, goTo };
  return (
    // En celular el shell del panel suma su propio p-6 alrededor de cada
    // pantalla; la carga guiada lo anula para usar el ancho completo (con
    // su propio margen de 16px) en vez de quedar con 40px por lado.
    <div className="min-h-full bg-[#f6f5f1] -mx-6 -mt-6 -mb-6 md:mx-0 md:mt-0 md:mb-0">
      {project.projectType === 'edificio' && <EdificioFlow {...props} />}
      {project.projectType === 'duplex' && <DuplexFlow {...props} />}
      {project.projectType === 'casa' && <CasaFlow {...props} />}
      {project.projectType === 'loteo' && <LoteoFlow {...props} />}
      {project.projectType === 'unico' && <UnicoFlow {...props} />}
    </div>
  );
}
