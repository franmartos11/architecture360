'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { TransitionLink as Link } from '@/components/ui/TransitionUtils';
import { PageHeader, Pill } from '@/components/admin/panel-ui';
import { useChapterEyebrow, ChapterFooter } from '@/components/admin/section-editors/FichaChrome';
import { useActiveProjectId, withActiveProject } from '@/lib/active-project-context';
import type { BimModel } from '@/types';

// Capítulo Inmersivo (diseño): pestañas "Recorrido 360° · espacios comunes
// / Modelo BIM / Explorar 3D" y, abajo, tres tarjetas de resumen (modelo
// BIM, Explorar 3D y 360° por unidad). Explorar 3D no es una pantalla de
// este capítulo: son las vistas aéreas con edificios clicables, que viven
// en el capítulo Galería — la pestaña lleva ahí.

const TABS = [
  { label: 'Recorrido 360° · espacios comunes', short: 'Recorrido 360°', href: '/admin/proyecto/recorrido' },
  { label: 'Modelo BIM', href: '/admin/proyecto/bim' },
  { label: 'Explorar 3D', href: '/admin/proyecto/galeria' },
];

const DESCRIPTION = 'Recorrido 360°, modelo BIM y vista 3D en un mismo lugar.';

export function InmersivoHeader() {
  const pathname = usePathname();
  const eyebrow = useChapterEyebrow();
  return (
    <PageHeader
      back={<Link href="/admin/proyecto" className="inline-flex items-center min-h-[36px] hover:text-gray-900">← Ficha del proyecto</Link>}
      eyebrow={eyebrow}
      title="Inmersivo"
      description={DESCRIPTION}
      actions={
        <nav aria-label="Inmersivo" className="inline-flex max-w-full overflow-x-auto p-[3px] rounded-[10px] bg-[#EAE7E0]">
          {TABS.map(t => {
            const on = pathname === t.href;
            return (
              <Link key={t.href} href={t.href} aria-current={on ? 'page' : undefined}
                className={`shrink-0 whitespace-nowrap min-h-[38px] px-3 sm:px-3.5 flex items-center rounded-lg text-[13px] ${on ? 'bg-white font-semibold text-gray-900 shadow-[0_1px_2px_rgba(23,25,26,0.06)]' : 'text-gray-600 hover:text-gray-900'}`}>
                {'short' in t && t.short ? <><span className="sm:hidden">{t.short}</span><span className="hidden sm:inline">{t.label}</span></> : t.label}
              </Link>
            );
          })}
        </nav>
      }
    />
  );
}

interface SummaryData {
  model: BimModel | null;
  slides: number;
  slidesWithHotspots: number;
  units: number;
  unitsWithTour: number;
}

const STATUS_LABEL: Record<string, { text: string; tone: 'green' | 'warn' | 'neutral' }> = {
  ready: { text: 'Activo', tone: 'green' },
  processing: { text: 'Procesando', tone: 'warn' },
  failed: { text: 'Con error', tone: 'warn' },
};

function SummaryCard({ icon, dark, title, text, action }: { icon: React.ReactNode; dark?: boolean; title: string; text: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-4 min-h-[86px] px-4 sm:px-5 py-4 rounded-2xl border border-gray-200 bg-white min-w-0">
      <span aria-hidden className={`w-12 h-12 shrink-0 rounded-xl flex items-center justify-center ${dark ? 'bg-gray-900 text-white' : 'bg-[#EAE7E0] text-gray-900'}`}>{icon}</span>
      <span className="flex-1 min-w-0 flex flex-col gap-0.5">
        <span className="text-sm font-semibold text-gray-900">{title}</span>
        <span className="text-xs text-gray-600 leading-snug">{text}</span>
      </span>
      {action}
    </div>
  );
}

const icon = (d: string) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>
);

/** Resumen de las tres piezas del capítulo, con datos reales del proyecto. */
export function InmersivoSummary() {
  const projectId = useActiveProjectId();
  const [data, setData] = useState<SummaryData | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch(withActiveProject('/api/admin/bim', projectId)).then(r => (r.ok ? r.json() : { models: [] })).catch(() => ({ models: [] })),
      fetch(withActiveProject('/api/admin/project/immersive-summary', projectId)).then(r => (r.ok ? r.json() : {})).catch(() => ({})) as Promise<Partial<{ slides: number; slidesWithHotspots: number; units: number; unitsWithTour: number }>>,
    ]).then(([bim, counts]) => {
      if (cancelled) return;
      const models: BimModel[] = Array.isArray(bim?.models) ? bim.models : [];
      setData({
        model: models[0] ?? null,
        slides: counts.slides ?? 0,
        slidesWithHotspots: counts.slidesWithHotspots ?? 0,
        units: counts.units ?? 0,
        unitsWithTour: counts.unitsWithTour ?? 0,
      });
    });
    return () => { cancelled = true; };
  }, [projectId]);

  if (!data) return null;
  const status = data.model ? STATUS_LABEL[data.model.status] ?? STATUS_LABEL.processing : null;
  const link = 'min-h-[40px] flex items-center text-[13px] font-semibold text-gray-900 underline underline-offset-2 shrink-0';

  return (
    <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(280px, 100%), 1fr))' }}>
      <SummaryCard
        dark
        icon={icon('M12 3 3 8l9 5 9-5zM3 8v8l9 5 9-5V8')}
        title="Modelo BIM"
        text={data.model ? `${data.model.title}${data.model.sourceFormat ? ` · ${data.model.sourceFormat.toUpperCase()}` : ''}` : 'Todavía no hay modelo cargado'}
        action={status ? <Pill tone={status.tone}>{status.text}</Pill> : <Link href="/admin/proyecto/bim" className={link}>Cargar</Link>}
      />
      <SummaryCard
        icon={icon('M4 4h16v16H4zM9 4v16')}
        title="Explorar 3D"
        text={data.slides > 0
          ? `Vista aérea con edificios clicables · ${data.slidesWithHotspots} de ${data.slides} vista${data.slides === 1 ? '' : 's'}`
          : 'Sin vistas aéreas todavía'}
        action={<Link href="/admin/proyecto/galeria" className={link}>{data.slides > 0 ? 'Editar' : 'Agregar'}</Link>}
      />
      <SummaryCard
        icon={icon('M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3 12h18')}
        title="360° por unidad"
        text={data.units > 0 ? `${data.unitsWithTour} de ${data.units} unidades tienen recorrido` : 'Sin unidades cargadas'}
        action={data.units > 0 ? <Link href="/admin/inventory" className={link}>Ver</Link> : undefined}
      />
    </div>
  );
}

export { ChapterFooter };
