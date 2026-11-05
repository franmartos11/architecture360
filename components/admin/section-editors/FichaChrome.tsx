'use client';

import { usePathname } from 'next/navigation';
import { TransitionLink as Link } from '@/components/ui/TransitionUtils';
import { PageHeader } from '@/components/admin/panel-ui';

// Navegación entre las pantallas de la ficha (/admin/proyecto/*), con la
// forma de los capítulos del diseño: pestañas cuando un capítulo agrupa
// dos pantallas (Entorno = Ubicación + Amenidades; Inmersivo = Recorrido
// 360° + Modelo BIM) y un pie "← anterior · Siguiente →". Solo enlaza
// pantallas que existen — no inventa capítulos.

const CHAPTERS: { title: string; pages: { label: string; href: string }[] }[] = [
  { title: 'Esencial', pages: [{ label: 'Esencial', href: '/admin/proyecto' }] },
  { title: 'Entorno', pages: [{ label: 'Ubicación', href: '/admin/proyecto/ubicacion' }, { label: 'Amenidades', href: '/admin/proyecto/amenities' }] },
  { title: 'Obra', pages: [{ label: 'Avance de obra', href: '/admin/proyecto/avance' }] },
  { title: 'Inmersivo', pages: [{ label: 'Recorrido 360° · espacios comunes', href: '/admin/proyecto/recorrido' }, { label: 'Modelo BIM', href: '/admin/proyecto/bim' }] },
];

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

/** Encabezado de una pantalla de la ficha: eyebrow del capítulo, título, bajada y pestañas. */
export function ChapterHeader({ title, description }: { title: string; description: string }) {
  const pathname = usePathname();
  const eyebrow = useChapterEyebrow();
  return (
    <PageHeader
      back={<Link href="/admin/proyecto" className="inline-flex items-center min-h-[28px] hover:text-gray-900">← Ficha del proyecto</Link>}
      eyebrow={eyebrow}
      title={title}
      description={description}
      actions={<ChapterTabs current={pathname} />}
    />
  );
}
