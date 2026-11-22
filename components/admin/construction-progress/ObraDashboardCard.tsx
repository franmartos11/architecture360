import { TransitionLink as Link } from '@/components/ui/TransitionUtils';
import { daysAgoLabel, obraSummary } from '@/lib/construction-progress-editor';
import type { ConstructionProgress } from '@/types';

// Tarjeta "Obra" del dashboard del panel: cuánto hace de la última entrada
// de la bitácora y un atajo a cargar la del mes. El avance de obra vende
// cuando se ve vivo; una bitácora que se cortó hace tres meses dice lo
// contrario, y esto es el recordatorio. El enlace lleva ?nueva=1 para que
// el editor abra directo la carga rápida (en el celular, un toque menos).

const NEW_ENTRY_HREF = '/admin/proyecto/avance?nueva=1';

export default function ObraDashboardCard({ progress, today }: {
  progress: ConstructionProgress | null;
  /** yyyy-mm-dd local. */
  today: string;
}) {
  const s = obraSummary(progress, today);

  if (s.empty) {
    return (
      <section className="rounded-2xl border border-gray-200 bg-white px-5 sm:px-[22px] py-5 flex gap-4 items-center flex-wrap">
        <span className="flex-[1_1_200px] min-w-0 flex flex-col gap-0.5">
          <span className="text-sm font-semibold text-gray-900">Obra</span>
          <span className="text-xs text-gray-600">Todavía no hay entradas. Una por mes, con fotos, alcanza para mostrar que avanza.</span>
        </span>
        <Link href={NEW_ENTRY_HREF} className="min-h-[40px] flex items-center text-[13px] font-semibold text-gray-900 underline underline-offset-2">
          Cargar la primera
        </Link>
      </section>
    );
  }

  const warn = s.stale;
  return (
    <section className={`rounded-2xl border px-5 sm:px-[22px] py-5 flex gap-4 items-center flex-wrap ${warn ? 'border-[#F0DDB8] bg-amber-50' : 'border-gray-200 bg-white'}`}>
      {s.percent != null && (
        <span className={`font-display text-[32px] font-semibold ${warn ? 'text-[#6B4510]' : 'text-gray-900'}`}>{s.percent}%</span>
      )}
      <span className="flex-[1_1_180px] min-w-0 flex flex-col gap-0.5">
        <span className={`text-sm font-semibold ${warn ? 'text-[#4A300B]' : 'text-gray-900'}`}>Obra</span>
        <span className={`text-xs ${warn ? 'text-[#6B4510]' : 'text-gray-600'}`}>
          Última entrada {daysAgoLabel(s.days ?? 0)}
        </span>
      </span>
      <Link href={s.hasThisMonth ? '/admin/proyecto/avance' : NEW_ENTRY_HREF}
        className={`min-h-[40px] flex items-center text-[13px] font-semibold underline underline-offset-2 ${warn ? 'text-[#6B4510]' : 'text-gray-900'}`}>
        {s.hasThisMonth ? 'Ver la bitácora' : 'Cargar la de este mes'}
      </Link>
    </section>
  );
}
