import Image from 'next/image';
import Reveal from '@/components/ui/Reveal';
import type { SectionProps } from './types';

// Equipo — créditos confirmados, más allá del dueño del proyecto.
export default function TeamSection({ project }: SectionProps) {
  if (project.collaborators.length === 0) return null;

  return (
    <section className="py-[var(--theme-spacing)] bg-[var(--theme-bg)]">
      <Reveal className="max-w-6xl mx-auto px-4 md:px-6 mb-12">
        <h2 className="font-[family-name:var(--theme-font-heading)] text-3xl font-light text-[var(--theme-text)] leading-tight">Equipo</h2>
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
