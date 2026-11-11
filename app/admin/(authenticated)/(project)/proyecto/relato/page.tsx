'use client';

import { m } from 'framer-motion';
import { useContentIn } from '@/components/ui/Loaded';
import { useRef } from 'react';
import { FichaSkeleton } from '@/components/admin/PanelSkeletons';
import ErrorState from '@/components/ui/ErrorState';
import { SectionRow } from '@/components/admin/panel-ui';
import { ChapterHeader, ChapterFooter } from '@/components/admin/section-editors/FichaChrome';
import { useFichaProject, UnsavedBar, FichaLayout } from '@/components/admin/section-editors/ficha-data';
import { useProjectTypeConfig } from '@/lib/project-type-context';
import { TransitionLink as Link } from '@/components/ui/TransitionUtils';

// Capítulo 2 — Relato (diseño Ficha · Relato). El sitio público muestra la
// descripción como texto plano partido en párrafos por líneas en blanco
// (AboutSection): por eso la barra de formato solo ofrece lo que se ve
// igual publicado — párrafo nuevo y viñeta — y no negrita/cursiva/enlaces.

export default function RelatoPage() {
  const contentIn = useContentIn();
  const { saleMode } = useProjectTypeConfig();
  const ficha = useFichaProject();
  const { project, setProject } = ficha;
  const textRef = useRef<HTMLTextAreaElement>(null);

  if (ficha.loading) return <FichaSkeleton aside rows={3} />;
  if (ficha.loadError || !project) return <ErrorState message="No se pudo cargar el proyecto." onRetry={ficha.reload} />;

  const text = project.description ?? '';
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  const paragraphs = text.trim().split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
  const showcase = saleMode === 'showcase';

  // Inserta en la posición del cursor y deja el cursor después de lo insertado.
  const insert = (fn: (before: string, after: string) => { value: string; caret: number }) => {
    const el = textRef.current;
    const start = el?.selectionStart ?? text.length;
    const end = el?.selectionEnd ?? text.length;
    const { value, caret } = fn(text.slice(0, start), text.slice(end));
    setProject({ ...project, description: value });
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(caret, caret); });
  };
  const newParagraph = () => insert((b, a) => {
    const lead = b.replace(/\s+$/, '');
    const v = `${lead}\n\n${a.replace(/^\s+/, '')}`;
    return { value: v, caret: lead.length + 2 };
  });
  const bullet = () => insert((b, a) => {
    const atLineStart = b === '' || b.endsWith('\n');
    const prefix = atLineStart ? '• ' : '\n• ';
    return { value: `${b}${prefix}${a}`, caret: b.length + prefix.length };
  });

  const toolBtn = 'min-h-[34px] px-2.5 flex items-center gap-1.5 rounded-lg text-[13px] text-gray-900 hover:bg-gray-100';

  const aside = (
    <>
      <span className="text-[13px] font-semibold text-gray-900">Vista en vivo · Sobre el proyecto</span>
      <div className="rounded-2xl bg-[#F7F4EE] border border-gray-200 shadow-[0_1px_2px_rgba(23,25,26,0.06),0_12px_32px_-12px_rgba(23,25,26,0.18)] px-6 py-7 flex flex-col gap-4">
        <span className="text-[10px] tracking-[0.16em] uppercase text-gray-500">Sobre el proyecto</span>
        {paragraphs.length === 0 ? (
          <span className="text-[13px] leading-relaxed text-gray-500">El texto aparece acá mientras escribís.</span>
        ) : (
          <>
            <span className="font-display text-[22px] leading-[1.12] font-semibold tracking-[-0.02em] text-gray-900 line-clamp-4">{paragraphs[0]}</span>
            {paragraphs.slice(1, 3).map((p, i) => (
              <span key={i} className="text-xs leading-relaxed text-gray-700 whitespace-pre-line line-clamp-5">{p}</span>
            ))}
          </>
        )}
      </div>
      <div className="rounded-xl border border-gray-200 bg-gray-50 p-3.5 text-xs leading-relaxed text-gray-600">
        El texto se edita solo acá. La sección del sitio lo toma de este capítulo; en <Link href="/admin/sitio" className="font-semibold text-gray-900 underline underline-offset-2">Sitio</Link> solo se decide el orden y si se muestra.
      </div>
    </>
  );

  return (
    <m.div {...contentIn}>
    <FichaLayout aside={aside}>
      <ChapterHeader
        title="Relato"
        description={showcase
          ? 'La idea, el lugar, las decisiones. El texto que explica el proyecto en el sitio y en tu portfolio.'
          : 'Por qué este proyecto y no otro. Un texto corto que se lee antes que cualquier dato.'}
        actions={<span />}
      />

      <form onSubmit={e => { e.preventDefault(); ficha.save(); }} className="flex flex-col gap-7">
        <SectionRow
          title={showcase ? 'Memoria del proyecto' : 'Sobre el proyecto'}
          description="Entre 60 y 120 palabras funciona mejor. El primer párrafo se destaca en grande; dejá una línea en blanco entre párrafos."
          first
        >
          <div className="rounded-xl border-[1.5px] border-gray-300 bg-white overflow-hidden focus-within:border-brand-700 focus-within:ring-4 focus-within:ring-brand-500/10">
            <div className="flex items-center gap-1 px-2 py-1.5 border-b border-gray-100 flex-wrap">
              <button type="button" onClick={newParagraph} className={toolBtn} title="Termina el párrafo y empieza otro">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M13 4v16M17 4v16M19 4H9.5a4.5 4.5 0 0 0 0 9H13" /></svg>
                Párrafo nuevo
              </button>
              <button type="button" onClick={bullet} className={toolBtn} title="Agrega una línea con viñeta">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01" /></svg>
                Viñeta
              </button>
            </div>
            <textarea
              ref={textRef}
              aria-label={showcase ? 'Memoria del proyecto' : 'Sobre el proyecto'}
              value={text}
              onChange={e => setProject({ ...project, description: e.target.value })}
              rows={showcase ? 12 : 8}
              placeholder="Contá qué cambia al vivir acá: materiales, luz, la vida del edificio…"
              className="block w-full px-4 py-3.5 text-[15px] leading-[1.7] text-gray-900 outline-none resize-y border-0 placeholder:text-gray-400"
            />
            <div className="flex justify-between gap-3 px-3.5 py-2 border-t border-gray-100 text-xs">
              <span className={words === 0 ? 'text-gray-500' : words < 60 || words > 120 ? 'text-amber-800' : 'text-brand-800'}>
                {words} palabra{words === 1 ? '' : 's'} · ideal 60–120
              </span>
              <span className={text.length > 600 && !showcase ? 'text-red-600' : 'text-gray-500'}>{text.length}{showcase ? '' : ' / 600'}</span>
            </div>
          </div>
          <p className="m-0 text-xs text-gray-600">El sitio muestra el texto tal cual: sin negritas ni enlaces, respetando párrafos y viñetas.</p>
        </SectionRow>
      </form>

      <ChapterFooter />
      <UnsavedBar dirty={ficha.dirty} saving={ficha.saving} onSave={() => ficha.save()} onDiscard={ficha.discard} />
    </FichaLayout>
    </m.div>
  );
}
