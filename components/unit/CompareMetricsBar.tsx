'use client';

import type { Unit } from '@/types';

interface CompareMetricsBarProps {
  unitA: Unit;
  unitB: Unit;
}

interface Metric {
  label: string;
  a: number;
  b: number;
  suffix: string;
  decimals: number;
}

export default function CompareMetricsBar({ unitA, unitB }: CompareMetricsBarProps) {
  const metrics: Metric[] = [
    { label: 'Total', a: unitA.totalArea, b: unitB.totalArea, suffix: 'm²', decimals: 1 },
    { label: 'Interior', a: unitA.innerArea, b: unitB.innerArea, suffix: 'm²', decimals: 1 },
    {
      label: 'Exterior',
      a: (unitA.balconyArea ?? 0) + (unitA.externalArea ?? 0),
      b: (unitB.balconyArea ?? 0) + (unitB.externalArea ?? 0),
      suffix: 'm²',
      decimals: 1,
    },
    { label: 'Ambientes', a: unitA.bedrooms, b: unitB.bedrooms, suffix: '', decimals: 0 },
    { label: 'Baños', a: unitA.bathrooms, b: unitB.bathrooms, suffix: '', decimals: 0 },
  ];

  return (
    <div className="bg-white border-t border-gray-200 px-4 py-4 overflow-x-auto relative z-20 shadow-[0_-4px_16px_rgba(0,0,0,0.06)]">
      <div className="flex items-center justify-between min-w-[500px] max-w-4xl mx-auto gap-4">
        {metrics.map((m, idx) => {
          const diff = m.b - m.a;
          const showDelta = Math.abs(diff) > 0.001;
          const aWon = m.a > m.b;
          const bWon = m.b > m.a;

          return (
            <div key={m.label} className={`flex flex-col items-center flex-1 ${idx !== metrics.length - 1 ? 'border-r border-gray-100' : ''}`}>
              <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2.5">{m.label}</p>

              <div className="flex items-center justify-center gap-4 w-full px-2">
                {/* Unit A Value */}
                <span className={`text-[13px] md:text-[15px] font-semibold transition-colors ${aWon ? 'text-blue-600' : 'text-gray-400'}`}>
                  {m.a.toFixed(m.decimals)}<span className="text-[10px] ml-0.5 opacity-70">{m.suffix}</span>
                </span>

                {/* Delta / Separator */}
                <div className="flex flex-col items-center justify-center min-w-[48px]">
                  {showDelta ? (
                    <span
                      className={`inline-flex items-center justify-center text-[9px] font-bold px-1.5 py-0.5 rounded-md whitespace-nowrap ${
                        diff > 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-blue-50 text-blue-700'
                      }`}
                    >
                      {diff > 0 ? '+' : ''}{diff.toFixed(m.decimals)}
                    </span>
                  ) : (
                    <span className="w-1 h-1 rounded-full bg-gray-200" />
                  )}
                </div>

                {/* Unit B Value */}
                <span className={`text-[13px] md:text-[15px] font-semibold transition-colors ${bWon ? 'text-emerald-600' : 'text-gray-400'}`}>
                  {m.b.toFixed(m.decimals)}<span className="text-[10px] ml-0.5 opacity-70">{m.suffix}</span>
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
