import Image from 'next/image';
import Reveal from '@/components/ui/Reveal';
import { resolveWebTemplateKey } from '@/lib/web-templates';
import type { SectionProps } from './types';
import { Container, SectionHeading } from './ui';

// Equipo — créditos confirmados, más allá del dueño del proyecto.
export default function TeamSection({ project }: SectionProps) {
  if (project.collaborators.length === 0) return null;
  const template = resolveWebTemplateKey(project.themeConfig?.webTemplate);

  if (template === 'editorial') {
    return (
      <section className="py-[var(--theme-spacing)] bg-[var(--theme-bg)] border-t border-[var(--theme-border)]">
        <Container>
          <SectionHeading eyebrow="Créditos" title="Equipo y autores" className="mb-10" />
          <div className="divide-y divide-[var(--theme-border)] border-y border-[var(--theme-border)]">
            {project.collaborators.map((c, i) => (
              <a
                key={c.handle}
                href={`/portfolio/${c.handle}`}
                className="ed-row group py-4 flex items-center justify-between gap-4 no-underline text-[var(--theme-text)]"
              >
                <div className="flex items-center gap-4 min-w-0">
                  <span className="text-xs font-mono text-[var(--theme-text-muted)]">{String(i + 1).padStart(2, '0')}</span>
                  <span className="font-[family-name:var(--theme-font-heading)] text-xl font-medium truncate group-hover:text-[var(--theme-accent)]">
                    {c.displayName}
                  </span>
                </div>
                {c.contribution && (
                  <span className="text-sm text-[var(--theme-text-muted)] truncate">{c.contribution}</span>
                )}
              </a>
            ))}
          </div>
        </Container>
      </section>
    );
  }

  return (
    <section className="py-[calc(var(--theme-spacing)/2)] bg-[var(--theme-bg)]">
      <Reveal className="max-w-[1360px] mx-auto px-4 sm:px-6 mb-12">
        <SectionHeading eyebrow="Equipo" title="Las personas" muted="detrás del proyecto." />
      </Reveal>
      <div className="max-w-6xl mx-auto px-4 md:px-6 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
        {project.collaborators.map((c, i) => (
          <Reveal key={c.handle} delay={i * 0.05}>
            <a
              href={`/portfolio/${c.handle}`}
              className="group flex items-center gap-4 p-4 rounded-[var(--theme-radius)] bg-[var(--theme-surface)] border border-[var(--theme-border)] hover:shadow-sm transition-all"
            >
              <div className="relative w-12 h-12 rounded-full overflow-hidden shrink-0 bg-[var(--theme-border)] flex items-center justify-center">
                {c.avatarImage ? (
                  <Image src={c.avatarImage} alt={c.displayName} fill sizes="48px" className="object-cover" />
                ) : (
                  <span className="text-[var(--theme-text-muted)] font-medium">{c.displayName.charAt(0).toUpperCase()}</span>
                )}
              </div>
              <div className="min-w-0">
                <p className="font-medium text-[var(--theme-text)] truncate group-hover:underline">{c.displayName}</p>
                {c.contribution && <p className="text-sm text-[var(--theme-text-muted)] truncate">{c.contribution}</p>}
              </div>
            </a>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
