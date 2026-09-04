'use client';

import { useState, useEffect } from 'react';
import { TransitionLink as Link } from '@/components/ui/TransitionUtils';

interface Trend {
  tag: string;
  count: number;
}

// Mismo patrón de fetch-on-mount que PeopleSuggestions — hashtags de los
// posts de la última semana, contados en /api/posts/trending-tags.
export default function TrendingTags() {
  const [trends, setTrends] = useState<Trend[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/posts/trending-tags')
      .then(res => res.json())
      .then(data => {
        setTrends(data.tags ?? []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading || trends.length === 0) return null;

  // Calcado del mockup Feed.dc.html — valores arbitrarios en vez de
  // tokens trevo-*, a propósito: es el look específico de ese diseño,
  // scopeado a este componente. Antes las filas no llevaban a ningún
  // lado (cursor-default, sin href) — ahora llevan a /etiqueta/[tag].
  return (
    <div className="bg-white rounded-2xl p-[17px]" style={{ border: '1px solid rgba(28,25,23,0.07)' }}>
      <h3 className="font-semibold text-[13.5px] text-[#1c1a17]">En tendencia</h3>
      <div className="flex flex-col mt-2.5">
        {trends.map((t, i) => (
          <Link
            key={t.tag}
            href={`/etiqueta/${encodeURIComponent(t.tag)}`}
            className="flex items-center gap-2.5 py-2 px-2 -mx-2 rounded-[9px] hover:bg-[#faf9f6] transition-colors"
          >
            <span className="font-semibold text-[13px] text-[rgba(28,25,23,0.24)] w-3.5">{String(i + 1).padStart(2, '0')}</span>
            <div className="min-w-0">
              <p className="font-medium text-[12.5px] text-[#1c1a17] truncate">#{t.tag}</p>
              <p className="text-[10.5px] text-[rgba(28,25,23,0.42)] mt-px">{t.count} publicaciones</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
