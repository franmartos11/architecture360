import { Skeleton, SkeletonCard, SkeletonForm, PageSkeleton } from '@/components/ui/Skeleton';

// Composiciones de skeleton que se repiten en varias pantallas del panel.
// Las piezas base viven en components/ui/Skeleton; acá solo se arman las
// formas propias del admin (capítulos de la ficha, planos) para que la
// pantalla real entre en su lugar sin salto.

/**
 * Capítulo de la ficha (/admin/proyecto/*): cabecera + tarjetas de formulario,
 * con la misma grilla que `FichaLayout`. Con `aside` reproduce además la
 * columna beige de "Vista en vivo".
 */
export function FichaSkeleton({ aside = false, rows = 4 }: { aside?: boolean; rows?: number }) {
  const body = (
    <PageSkeleton className="gap-7">
      <SkeletonCard lines={1} />
      <div className="rounded-2xl border border-gray-200 bg-white p-5 sm:p-6">
        <SkeletonForm rows={rows} />
      </div>
    </PageSkeleton>
  );
  if (!aside) return <div className="max-w-[1080px] mx-auto">{body}</div>;
  return (
    <div className="-m-6 md:-m-8 flex flex-wrap items-stretch min-h-screen">
      <div className="flex-[999_1_600px] min-w-0 px-4 py-8 sm:px-10 sm:py-10">
        <div className="max-w-[760px] mx-auto">{body}</div>
      </div>
      <div aria-hidden="true" className="flex-[1_1_340px] lg:max-w-[400px] min-w-0 px-4 py-8 sm:px-6 bg-[#EFECE6] border-t lg:border-t-0 lg:border-l border-gray-200">
        <div className="flex flex-col gap-4">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="aspect-[4/3] w-full rounded-2xl" />
          <Skeleton className="h-3 w-3/4" />
        </div>
      </div>
    </div>
  );
}

/** Zona de un plano (imagen con sus polígonos): rectángulo con la proporción de la planta. */
export function PlanSkeleton({ className = '' }: { className?: string }) {
  return (
    <div role="status" aria-label="Cargando" className={`flex flex-col gap-3 ${className}`}>
      <div aria-hidden="true" className="flex gap-2"><Skeleton className="h-9 w-28 rounded-lg" /><Skeleton className="h-9 w-28 rounded-lg" /></div>
      <Skeleton className="aspect-[4/3] w-full rounded-2xl" />
    </div>
  );
}

/** Editor de sección (formulario dentro del panel del sitio): `rows` filas de campo. */
export function EditorSkeleton({ rows = 4, padded = true }: { rows?: number; padded?: boolean }) {
  return (
    <div role="status" aria-label="Cargando" className={padded ? 'p-6' : ''}>
      <SkeletonForm rows={rows} />
    </div>
  );
}
