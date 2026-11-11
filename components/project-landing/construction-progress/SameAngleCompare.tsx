'use client';

import BeforeAfterSlider from '@/components/BeforeAfterSlider';
import type { sameAngleComparison } from '@/lib/construction-progress-view';

type Comparison = NonNullable<ReturnType<typeof sameAngleComparison>>;

/**
 * Primera contra última foto desde el mismo lugar. Va justo debajo del
 * resumen y antes de la historia: el resumen dice "72%" y esto lo prueba
 * de un vistazo, sin tener que recorrer las entradas. La historia cuenta
 * el medio; acá solo están las dos puntas, así que no se repite.
 */
export default function SameAngleCompare({ comparison }: { comparison: Comparison }) {
  const { angle, months, before, after } = comparison;
  return (
    <div className="mt-16 grid gap-6 lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)] lg:gap-12 lg:items-center">
      <div className="flex flex-col gap-2">
        <p className="m-0 font-[family-name:var(--theme-font-heading)] text-[clamp(24px,2.4vw,34px)] leading-[1.1] font-medium tracking-[-0.02em] text-balance">
          {months > 0 ? `El mismo lugar, ${months === 1 ? 'un mes' : `${months} meses`} después.` : 'El mismo lugar, antes y ahora.'}
        </p>
        <p className="m-0 text-[15px] text-[var(--theme-text-muted)]">
          Vista {angle.toLowerCase()} · arrastrá para comparar
        </p>
      </div>
      <BeforeAfterSlider
        label=""
        beforeImage={before.image}
        afterImage={after.image}
        beforeLabel={before.label}
        afterLabel={after.label}
        sizes="(min-width: 1024px) 60vw, 100vw"
      />
    </div>
  );
}
