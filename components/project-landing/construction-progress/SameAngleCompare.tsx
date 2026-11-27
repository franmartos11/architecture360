'use client';

import BeforeAfterSlider from '@/components/BeforeAfterSlider';
import type { CompareEnd, sameAngleComparison } from '@/lib/construction-progress-view';
import { constructionMonth, formatUpdateDate } from '@/lib/construction-progress';
import { useLocale, useT } from '@/lib/i18n/client';
import type { ConstructionProgress } from '@/types';

type Comparison = NonNullable<ReturnType<typeof sameAngleComparison>>;

/**
 * Primera contra última foto desde el mismo lugar. Va justo debajo del
 * resumen y antes de la historia: el resumen dice "72%" y esto lo prueba
 * de un vistazo, sin tener que recorrer las entradas. La historia cuenta
 * el medio; acá solo están las dos puntas, así que no se repite.
 */
export default function SameAngleCompare({ progress, comparison }: { progress: ConstructionProgress; comparison: Comparison }) {
  const { angle, months, before, after } = comparison;
  const t = useT();
  const { locale } = useLocale();
  // "ago 2025 · Mes 2 de obra" en el idioma de la página (la etiqueta de lib viene en castellano).
  const endLabel = (end: CompareEnd) => {
    const month = constructionMonth(progress, end.update.date);
    return [formatUpdateDate(end.update.date, locale), month ? t('sitio.avance.mesDeObra', { n: month }) : null].filter(Boolean).join(' · ');
  };
  return (
    <div className="mt-16 grid gap-6 lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)] lg:gap-12 lg:items-center">
      <div className="flex flex-col gap-2">
        <p className="m-0 font-[family-name:var(--theme-font-heading)] text-[clamp(24px,2.4vw,34px)] leading-[1.1] font-medium tracking-[-0.02em] text-balance">
          {months > 0 ? t('sitio.avance.mismoLugarDespues', { count: months }) : t('sitio.avance.mismoLugar')}
        </p>
        <p className="m-0 text-[15px] text-[var(--theme-text-muted)]">
          {t('sitio.avance.vistaArrastra', { angulo: angle.toLowerCase() })}
        </p>
      </div>
      <BeforeAfterSlider
        label=""
        beforeImage={before.image}
        afterImage={after.image}
        beforeLabel={endLabel(before)}
        afterLabel={endLabel(after)}
        sizes="(min-width: 1024px) 60vw, 100vw"
      />
    </div>
  );
}
