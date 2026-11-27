import Reveal from '@/components/ui/Reveal';
import { resolveWebTemplateKey } from '@/lib/web-templates';
import type { SectionProps } from './types';
import { Container, SectionHeading } from './ui';
import { crearT } from '@/lib/i18n/t';

export default function QualitiesSection({ project, locale = 'es' }: SectionProps) {
  const t = crearT(locale);
  const items = (project.themeConfig?.qualitiesItems ?? []).filter(
    q => q.category.trim() && q.detail.trim()
  );
  if (items.length === 0) return null;

  const template = resolveWebTemplateKey(project.themeConfig?.webTemplate);

  if (template === 'comercial') {
    return (
      <section id="calidades" className="py-[calc(var(--theme-spacing)/1.5)] bg-[var(--theme-bg)] border-t border-[var(--theme-border)]">
        <Container>
          <SectionHeading
            eyebrow={t('sitio.calidades.memoriaTecnica')}
            title={t('sitio.calidades.tituloComercial')}
            className="mb-10"
          />
          <Reveal delay={0.06} className="rounded-[var(--theme-radius)] bg-[var(--theme-surface)] border border-[var(--theme-border)] divide-y md:divide-y-0 md:grid md:grid-cols-2 md:gap-x-8 p-6 sm:p-8 shadow-sm">
            {items.map((item, i) => (
              <div
                key={`${item.category}-${i}`}
                className="py-4 md:border-b md:border-[var(--theme-border)] flex items-start gap-3.5"
              >
                <span aria-hidden="true" className="mt-0.5 w-6 h-6 shrink-0 rounded-full bg-[var(--theme-accent)]/15 text-[var(--theme-accent)] text-xs font-bold flex items-center justify-center">
                  ✓
                </span>
                <div className="min-w-0">
                  <span className="block text-sm font-bold text-[var(--theme-text)]">{item.category}</span>
                  <p className="m-0 mt-1 text-sm leading-relaxed text-[var(--theme-text-muted)]">{item.detail}</p>
                </div>
              </div>
            ))}
          </Reveal>
        </Container>
      </section>
    );
  }

  if (template === 'editorial') {
    return (
      <section id="calidades" className="py-[var(--theme-spacing)] bg-[var(--theme-bg-alt)] text-[var(--theme-text-on-dark)]">
        <Container>
          <SectionHeading
            onDark
            eyebrow={t('sitio.calidades.materialidad')}
            title={t('sitio.calidades.tituloEditorial')}
            muted={t('sitio.calidades.tituloEditorialAtenuado')}
            className="mb-12"
          />
          <Reveal delay={0.06} className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3 border-t border-[var(--theme-border-on-dark)] pt-8">
            {items.map((item, i) => (
              <div key={`${item.category}-${i}`} className="flex flex-col gap-2">
                <span className="text-[11px] font-mono uppercase tracking-[0.12em] text-[var(--theme-accent)]">
                  {String(i + 1).padStart(2, '0')} · {item.category}
                </span>
                <p className="m-0 text-sm sm:text-base leading-relaxed text-[var(--theme-text-on-dark-muted)]">
                  {item.detail}
                </p>
              </div>
            ))}
          </Reveal>
        </Container>
      </section>
    );
  }

  return (
    <section id="calidades" className="py-[var(--theme-spacing)] bg-[var(--theme-bg)] border-t border-[var(--theme-border)]">
      <Container>
        <SectionHeading
          eyebrow={t('sitio.calidades.especificaciones')}
          title={t('sitio.calidades.titulo')}
          muted={t('sitio.calidades.tituloAtenuado')}
        />
        <Reveal delay={0.08} className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item, i) => (
            <div
              key={`${item.category}-${i}`}
              className="p-6 rounded-[var(--theme-radius)] bg-[var(--theme-surface)] border border-[var(--theme-border)] flex flex-col gap-2"
            >
              <span className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--theme-accent)]">
                {item.category}
              </span>
              <p className="m-0 text-sm sm:text-base leading-relaxed text-[var(--theme-text)]">
                {item.detail}
              </p>
            </div>
          ))}
        </Reveal>
      </Container>
    </section>
  );
}
