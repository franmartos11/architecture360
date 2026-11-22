'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import { m, useReducedMotion } from 'framer-motion';
import { PILL_SPRING } from '@/lib/motion';

// Indicador que se desliza hasta la opción activa (menú lateral del panel,
// SegmentedTabs) en vez de que el fondo salte de un ítem a otro. Mismo
// mecanismo que components/ui/Segmented.tsx — se mide el ítem activo y se
// anima x/y/ancho/alto, porque framer-motion va con `domAnimation` (sin
// animaciones de layout) — pero en las dos direcciones, así sirve para una
// lista vertical o para un segmentado que envuelve en dos renglones.
//
// Uso:
//   const { ref, box } = useSlidingIndicator<HTMLDivElement>(activeKey);
//   <div ref={ref} data-indicator-root className="relative isolate">
//     <SlidingIndicator box={box} className="rounded-lg bg-white" />
//     <a data-indicator="a">…</a>
//   </div>
//
// El contenedor tiene que ser el `offsetParent` de los ítems (relative) y
// un contexto de apilamiento (`isolate`): el indicador va con z negativo,
// debajo del texto y de cualquier fondo de los ítems (hover, tarjetas).

export interface IndicatorBox {
  x: number;
  y: number;
  w: number;
  h: number;
  /** false en la primera medición: el indicador aparece ya en su lugar. */
  anim: boolean;
}

export function useSlidingIndicator<E extends HTMLElement>(activeKey: string | null, remeasureKey?: unknown) {
  const ref = useRef<E>(null);
  const [box, setBox] = useState<IndicatorBox | null>(null);

  useLayoutEffect(() => {
    const wrap = ref.current;
    if (!wrap) return;
    const measure = () => {
      // Solo los ítems de ESTE contenedor (el menú tiene otro adentro, el de los subítems).
      const el = activeKey == null ? null : Array.from(wrap.querySelectorAll<HTMLElement>('[data-indicator]'))
        .find(n => n.dataset.indicator === activeKey && n.parentElement?.closest('[data-indicator-root]') === wrap);
      // Sin ítem activo o con el contenedor oculto (menú móvil cerrado): sin
      // indicador. Al volver a verse, la primera medición no anima — así
      // abrir el menú no lo hace volar desde arriba a la izquierda.
      if (!el || el.offsetWidth === 0) { setBox(null); return; }
      const x = el.offsetLeft, y = el.offsetTop, w = el.offsetWidth, h = el.offsetHeight;
      setBox(prev => (prev && prev.x === x && prev.y === y && prev.w === w && prev.h === h)
        ? prev
        : { x, y, w, h, anim: !!prev });
    };
    measure();
    // Se observa también a los hijos directos: en el menú, un bloque de
    // subítems que se despliega o se pliega corre a los ítems de abajo sin
    // cambiar el alto del contenedor — así el indicador los sigue cuadro a cuadro.
    const ro = new ResizeObserver(measure);
    ro.observe(wrap);
    for (const child of Array.from(wrap.children)) ro.observe(child);
    return () => ro.disconnect();
  }, [activeKey, remeasureKey]);

  return { ref, box };
}

export function SlidingIndicator({ box, className = '' }: { box: IndicatorBox | null; className?: string }) {
  const reduced = !!useReducedMotion();
  if (!box) return null;
  return (
    <m.span
      aria-hidden="true"
      data-sliding-indicator=""
      className={`pointer-events-none absolute left-0 top-0 -z-10 ${className}`}
      initial={false}
      animate={{ x: box.x, y: box.y, width: box.w, height: box.h }}
      transition={reduced || !box.anim ? { duration: 0 } : PILL_SPRING}
    />
  );
}
