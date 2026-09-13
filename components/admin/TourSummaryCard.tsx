import { TransitionLink as Link } from '@/components/ui/TransitionUtils';
import type { TourData } from '@/types';
import { getTourStats } from '@/lib/tour-stats';

interface TourSummaryCardProps {
  tourData: TourData | null | undefined;
  href: string;
}

// Resumen de solo lectura del recorrido 360° de un depto, para paneles
// angostos (ver UnitsEditor) — el editor completo (TourEditor) necesita
// bastante más ancho que un panel lateral para su layout de 3 columnas,
// así que acá solo mostramos el estado y mandamos a la página completa
// (mismo patrón que la tarjeta de "Ambientes del depto" a continuación).
export default function TourSummaryCard({ tourData, href }: TourSummaryCardProps) {
  const { nodeCount, totalLinks, orphanCount, hasStart } = getTourStats(tourData);

  if (nodeCount === 0) {
    return (
      <Link
        href={href}
        className="flex items-center justify-between gap-3 rounded-xl border border-dashed border-gray-300 bg-gray-50/60 px-3.5 py-2.5 hover:border-gray-400 hover:bg-gray-50 transition-colors"
      >
        <span className="text-[11.5px] font-medium text-gray-500">Todavía no armaste el recorrido</span>
        <span className="text-[11px] font-medium text-brand-600 shrink-0">Abrir →</span>
      </Link>
    );
  }

  const isComplete = orphanCount === 0 && hasStart;

  return (
    <Link
      href={href}
      className="flex flex-col gap-2 rounded-xl border border-gray-200 bg-gray-50/60 px-3.5 py-2.5 hover:border-gray-300 hover:bg-gray-50 transition-colors"
    >
      <div className="flex items-center justify-between gap-3">
        <span className="text-[11.5px] font-medium text-gray-900">
          {nodeCount} ambiente{nodeCount === 1 ? '' : 's'} · {totalLinks} conexion{totalLinks === 1 ? '' : 'es'}
        </span>
        <span className="text-[11px] font-medium text-brand-600 shrink-0">Abrir →</span>
      </div>
      {!isComplete && (
        <div className="flex flex-wrap gap-1.5">
          {orphanCount > 0 && (
            <span className="inline-flex items-center gap-1.5 h-5 px-2 rounded-md text-[10px] font-medium bg-amber-50 text-amber-700">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
              {orphanCount} sin salidas
            </span>
          )}
          {!hasStart && (
            <span className="inline-flex items-center gap-1.5 h-5 px-2 rounded-md text-[10px] font-medium bg-amber-50 text-amber-700">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
              Falta el ambiente de inicio
            </span>
          )}
        </div>
      )}
    </Link>
  );
}
