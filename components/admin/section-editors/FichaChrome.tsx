'use client';

import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { TransitionLink as Link } from '@/components/ui/TransitionUtils';
import { PageHeader } from '@/components/admin/panel-ui';

// Navegación entre los 7 capítulos de la ficha (/admin/proyecto/*), con
// la forma del diseño: pestañas cuando un capítulo agrupa dos pantallas
// (Inmersivo = Recorrido 360° + Modelo BIM) y un pie "← anterior ·
// Siguiente →". Las rutas viejas /ubicacion y /amenities redirigen a Entorno.

export const FICHA_CHAPTERS: { title: string; pages: { label: string; href: string }[] }[] = [
  { title: 'Esencial', pages: [{ label: 'Esencial', href: '/admin/proyecto' }] },
  { title: 'Relato', pages: [{ label: 'Relato', href: '/admin/proyecto/relato' }] },
  { title: 'Galería', pages: [{ label: 'Galería', href: '/admin/proyecto/galeria' }] },
  { title: 'Entorno', pages: [{ label: 'Entorno', href: '/admin/proyecto/entorno' }] },
  { title: 'Obra', pages: [{ label: 'Avance de obra', href: '/admin/proyecto/avance' }] },
  { title: 'Inmersivo', pages: [{ label: 'Recorrido 360° · espacios comunes', href: '/admin/proyecto/recorrido' }, { label: 'Modelo BIM', href: '/admin/proyecto/bim' }] },
  { title: 'Equipo', pages: [{ label: 'Equipo', href: '/admin/proyecto/equipo' }] },
];
const CHAPTERS = FICHA_CHAPTERS;

function chapterIndexOf(pathname: string) {
  return CHAPTERS.findIndex(c => c.pages.some(p => p.href === pathname));
}

/** Pestañas del capítulo (si tiene más de una pantalla). */
export function ChapterTabs({ current }: { current: string }) {
  const chapter = CHAPTERS.find(c => c.pages.some(p => p.href === current));
  if (!chapter || chapter.pages.length < 2) return null;
  return (
    <nav aria-label={chapter.title} className="inline-flex flex-wrap p-[3px] rounded-[10px] bg-[#EAE7E0]">
      {chapter.pages.map(p => {
        const on = p.href === current;
        return (
          <Link key={p.href} href={p.href} aria-current={on ? 'page' : undefined}
            className={`min-h-[38px] px-3.5 flex items-center rounded-lg text-[13px] ${on ? 'bg-white font-semibold text-gray-900 shadow-[0_1px_2px_rgba(23,25,26,0.06)]' : 'text-gray-600 hover:text-gray-900'}`}>
            {p.label}
          </Link>
        );
      })}
    </nav>
  );
}

/** "Capítulo 2 de 4 · Ficha" para el eyebrow del PageHeader. */
export function useChapterEyebrow(): string {
  const pathname = usePathname();
  const i = chapterIndexOf(pathname);
  return i < 0 ? 'Ficha' : `Capítulo ${i + 1} de ${CHAPTERS.length} · Ficha`;
}

/** Pie: volver al capítulo anterior y botón oscuro "Siguiente · <capítulo>". */
export function ChapterFooter() {
  const pathname = usePathname();
  const i = chapterIndexOf(pathname);
  if (i < 0) return null;
  const prev = CHAPTERS[i - 1];
  const next = CHAPTERS[i + 1];
  return (
    <div className="flex items-center justify-between gap-4 flex-wrap pt-7 border-t border-gray-200">
      {prev ? (
        <Link href={prev.pages[0].href} className="min-h-[44px] flex items-center text-sm font-medium text-gray-700 hover:text-gray-900">← {prev.title}</Link>
      ) : <span />}
      {next && (
        <Link href={next.pages[0].href} className="min-h-[48px] px-5 flex items-center gap-3 rounded-xl bg-gray-900 text-white hover:bg-black">
          <span className="flex flex-col leading-tight">
            <span className="text-[11px] text-[#C9C6BE]">Siguiente</span>
            <span className="text-sm font-semibold">{next.title}</span>
          </span>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
        </Link>
      )}
    </div>
  );
}

/** Tira con los 7 capítulos (el actual resaltado) — para moverse entre ellos sin volver al menú. */
export function ChapterStrip() {
  const pathname = usePathname();
  const current = chapterIndexOf(pathname);
  return (
    <nav aria-label="Capítulos de la ficha" className="flex gap-1.5 overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 sm:flex-wrap pb-1 sm:pb-0">
      {CHAPTERS.map((c, i) => {
        const on = i === current;
        return (
          <Link key={c.title} href={c.pages[0].href} aria-current={on ? 'page' : undefined}
            className={`shrink-0 min-h-[36px] px-3 flex items-center gap-2 rounded-full text-[13px] border transition-colors ${
              on ? 'bg-gray-900 border-gray-900 text-white font-semibold' : 'bg-white border-gray-200 text-gray-700 hover:border-gray-300'
            }`}>
            <span className={`text-[11px] ${on ? 'text-white/70' : 'text-gray-400'}`}>{i + 1}</span>{c.title}
          </Link>
        );
      })}
    </nav>
  );
}

/** Encabezado de una pantalla de la ficha: eyebrow del capítulo, título, bajada, pestañas y la tira de capítulos. */
export function ChapterHeader({ title, description, actions }: { title: string; description: string; actions?: ReactNode }) {
  const pathname = usePathname();
  const eyebrow = useChapterEyebrow();
  return (
    <div className="flex flex-col gap-5">
      <ChapterStrip />
      <PageHeader
        eyebrow={eyebrow}
        title={title}
        description={description}
        actions={actions ?? <ChapterTabs current={pathname} />}
      />
    </div>
  );
}
