'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import { m as motion, useReducedMotion } from 'framer-motion';
import { PILL_SPRING } from '@/lib/motion';

// Selector segmentado con un indicador blanco que se desliza a la opción
// elegida (en vez de saltar). Se mide cada opción y se anima x/ancho: el
// proyecto carga framer-motion con `domAnimation`, sin animaciones de layout.
export interface SegmentedOption<T extends string> {
  value: T;
  label: React.ReactNode;
  /** Texto chico debajo (ej. la cantidad). */
  sub?: React.ReactNode;
}

export default function Segmented<T extends string>({ options, value, onChange, ariaLabel, role = 'group', size = 'md', className = '' }: {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (v: T) => void;
  ariaLabel: string;
  /** 'tablist' para pestañas (aria-selected); 'group' para botones (aria-pressed). */
  role?: 'group' | 'tablist';
  /** md: 36 px de alto; lg: 40 px; tall: 48 px (con `sub`). */
  size?: 'md' | 'lg' | 'tall';
  className?: string;
}) {
  const reduced = !!useReducedMotion();
  const wrapRef = useRef<HTMLDivElement>(null);
  // `anim`: la primera medición no se anima — el indicador aparece ya en
  // su lugar; de ahí en más, se desliza.
  const [pill, setPill] = useState<{ x: number; w: number; anim: boolean } | null>(null);

  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const measure = () => {
      const el = wrap.querySelector<HTMLElement>(`[data-seg="${CSS.escape(value)}"]`);
      if (el) setPill(prev => ({ x: el.offsetLeft, w: el.offsetWidth, anim: !!prev }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [value, options.length]);

  const instant = reduced || !pill?.anim;
  const h = size === 'tall' ? 'h-12' : size === 'lg' ? 'h-10' : 'h-9';

  return (
    <div ref={wrapRef} role={role} aria-label={ariaLabel} className={`relative flex p-[3px] rounded-[14px] bg-gray-100 ${className}`}>
      {pill && (
        <motion.span
          aria-hidden="true"
          className="absolute top-[3px] bottom-[3px] left-0 rounded-[11px] bg-white shadow-[0_1px_3px_rgba(17,24,39,0.14)]"
          initial={false}
          animate={{ x: pill.x, width: pill.w }}
          transition={instant ? { duration: 0 } : PILL_SPRING}
        />
      )}
      {options.map(o => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            data-seg={o.value}
            onClick={() => onChange(o.value)}
            {...(role === 'tablist' ? { role: 'tab', 'aria-selected': on } : { 'aria-pressed': on })}
            className={`relative z-[1] flex-1 min-w-0 ${h} flex flex-col items-center justify-center gap-px rounded-[11px] text-[14px] transition-[color,transform] duration-200 active:scale-[0.97] ${
              on ? 'font-bold text-gray-900' : 'font-semibold text-gray-500'
            }`}
          >
            <span className="leading-tight truncate max-w-full px-1">{o.label}</span>
            {o.sub != null && <span className="text-[11px] font-medium leading-none text-[#5B6472]">{o.sub}</span>}
          </button>
        );
      })}
    </div>
  );
}
