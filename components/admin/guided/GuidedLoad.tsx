'use client';

import { m } from 'framer-motion';
import { useContentIn } from '@/components/ui/Loaded';
import { Suspense, useCallback } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { PageSkeleton, SkeletonCard, SkeletonForm } from '@/components/ui/Skeleton';
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

// Mismo marco que la carga guiada real (fondo beige, márgenes negativos del
// shell) para que no salte al llegar el flujo.
function GuidedSkeleton() {
  return (
    <div className="carga-guiada min-h-[calc(100vh-1px)] flex flex-col bg-[#F5F3EE] -m-6 md:-m-8 px-4 py-8 sm:px-10 sm:py-10">
      <PageSkeleton>
        <SkeletonCard lines={4} />
        <div className="rounded-2xl border border-gray-200 bg-white p-5 sm:p-6"><SkeletonForm rows={4} /></div>
      </PageSkeleton>
    </div>
  );
}

export default function GuidedLoad({ project }: { project: GuidedProject }) {
  return (
    <Suspense fallback={<GuidedSkeleton />}>
      <GuidedLoadInner project={project} />
    </Suspense>
  );
}

function GuidedLoadInner({ project }: { project: GuidedProject }) {
  const contentIn = useContentIn();
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

  if (loading) return <GuidedSkeleton />;
  if (error || !tree) return <div className="p-6"><ErrorState message={error ?? 'No se pudo cargar el proyecto'} onRetry={reload} /></div>;

  const props: FlowProps = { project, tree, setTree, reload, step, goTo };
  return (
    // El shell del panel envuelve cada pantalla en p-6/md:p-8; la carga
    // guiada lo anula (márgenes negativos) para ocupar todo el área de
    // contenido como en el diseño. `carga-guiada` aplica la paleta y las
    // tipografías del diseño (ver globals.css).
    <m.div {...contentIn} className="carga-guiada min-h-[calc(100vh-1px)] flex flex-col bg-[#F5F3EE] -m-6 md:-m-8">
      {project.projectType === 'edificio' && <EdificioFlow {...props} />}
      {project.projectType === 'duplex' && <DuplexFlow {...props} />}
      {project.projectType === 'casa' && <CasaFlow {...props} />}
      {project.projectType === 'loteo' && <LoteoFlow {...props} />}
      {project.projectType === 'unico' && <UnicoFlow {...props} />}
    </m.div>
  );
}
