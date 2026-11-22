import Image from 'next/image';
import Reveal from '@/components/ui/Reveal';
import HomeContactForm from '@/components/HomeContactForm';
import type { SectionProps } from './types';

// ['planos', 'precios', 'financiación'] → "planos, precios y financiación".
function joinEs(items: (string | false)[]): string {
  const list = items.filter(Boolean) as string[];
  return list.length < 2 ? list.join('') : `${list.slice(0, -1).join(', ')} y ${list.at(-1)}`;
}

export default function ContactSection({ project, typeConfig }: SectionProps) {
  if (!typeConfig.showLeads) return null;

  // De fondo, la última vista aérea (distinta de la del hero cuando hay varias).
  const bg = project.aerialSlides.at(-1)?.imageUrl || project.masterplanImage;

  return (
    <section id="contacto" className="px-4 sm:px-6 py-[calc(var(--theme-spacing)/2)] bg-[var(--theme-bg)]">
      <div className="max-w-[1360px] mx-auto rounded-[calc(var(--theme-radius)*1.6)] overflow-hidden relative bg-[var(--theme-bg-alt)]">
        {bg && <Image src={bg} alt="" aria-hidden="true" fill sizes="(min-width: 1360px) 1360px, 100vw" className="object-cover" />}
        <div className="absolute inset-0 bg-[var(--theme-bg-alt)]/75" aria-hidden="true" />
        <div className="relative p-5 sm:p-10 lg:p-14 flex flex-wrap gap-10 lg:gap-12 items-end text-[var(--theme-text-on-dark)]">
          <Reveal className="flex-[1_1_380px] flex flex-col gap-5">
            <h2 className="m-0 font-[family-name:var(--theme-font-heading)] text-[clamp(36px,5.2vw,76px)] leading-none font-medium tracking-[-0.04em] text-balance">
              Encontrá tu lugar. <span className="text-[var(--theme-text-on-dark-muted)]">Te ayudamos a elegirlo.</span>
            </h2>
            <p className="m-0 text-base text-[var(--theme-text-on-dark-muted)]">
              Completá el formulario y te contactamos con {joinEs(['planos', typeConfig.showPrice && 'precios', typeConfig.showCalculator && 'financiación'])}.
            </p>
            {project.briefPdfUrl && (
              <a
                href={project.briefPdfUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="self-start inline-flex items-center gap-2 h-12 px-[22px] rounded-full border border-[var(--theme-text-on-dark)]/30 text-sm sm:text-[15px] font-semibold text-[var(--theme-text-on-dark)] no-underline transition-colors hover:bg-[var(--theme-text-on-dark)]/10 focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-[var(--theme-accent)]"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M12 4v11m0 0l-4.5-4.5M12 15l4.5-4.5M5 19h14" />
                </svg>
                Descargar brief
              </a>
            )}
          </Reveal>
          <Reveal delay={0.12} className="flex-[1_1_380px] min-w-0 bg-[var(--theme-surface)] text-[var(--theme-text)] rounded-[calc(var(--theme-radius)*1.2)] p-5 sm:p-7">
            <HomeContactForm projectSlug={project.slug} projectName={project.name} briefUrl={project.briefPdfUrl} />
          </Reveal>
        </div>
      </div>
    </section>
  );
}
