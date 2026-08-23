import Reveal from '@/components/ui/Reveal';
import HomeContactForm from '@/components/HomeContactForm';
import type { SectionProps } from './types';

export default function ContactSection({ project, typeConfig }: SectionProps) {
  if (!typeConfig.showLeads) return null;

  return (
    <section className="py-[var(--theme-spacing)] bg-[var(--theme-bg-accent)] relative overflow-hidden">
      <div className="max-w-6xl mx-auto px-4 md:px-6 grid grid-cols-1 md:grid-cols-2 gap-12 md:gap-16 items-center">
        <Reveal>
          <h2 className="font-[family-name:var(--theme-font-heading)] text-4xl sm:text-5xl md:text-6xl font-thin text-[var(--theme-text-on-dark)] leading-tight mb-6 text-center md:text-left">
            Contactanos
          </h2>
        </Reveal>

        <Reveal delay={0.15} className="bg-[var(--theme-text-on-dark)]/5 backdrop-blur-sm p-6 md:p-8 rounded-[var(--theme-radius)] border border-[var(--theme-border-on-dark)]">
          <div className="text-[var(--theme-text-on-dark)] mb-6 md:mb-8 font-light text-center md:text-left">Completa el formulario para obtener más información.</div>
          <HomeContactForm projectSlug={project.slug} />
        </Reveal>
      </div>
    </section>
  );
}
