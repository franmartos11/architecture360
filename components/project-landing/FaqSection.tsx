import Reveal from '@/components/ui/Reveal';
import { resolveWebTemplateKey } from '@/lib/web-templates';
import type { SectionProps } from './types';
import { Container, SectionHeading } from './ui';
import { crearT } from '@/lib/i18n/t';

export default function FaqSection({ project, locale = 'es' }: SectionProps) {
  const t = crearT(locale);
  const items = (project.themeConfig?.faqItems ?? []).filter(
    f => f.question.trim() && f.answer.trim()
  );
  if (items.length === 0) return null;

  const template = resolveWebTemplateKey(project.themeConfig?.webTemplate);

  if (template === 'comercial') {
    return (
      <section id="faq" className="py-[calc(var(--theme-spacing)/1.5)] bg-[var(--theme-bg)] border-t border-[var(--theme-border)]">
        <Container>
          <SectionHeading
            eyebrow={t('sitio.faq.respuestasRapidas')}
            title={t('sitio.faq.titulo')}
            muted={t('sitio.faq.tituloAtenuado')}
            className="mb-10"
          />
          <Reveal delay={0.06} className="grid gap-4 md:grid-cols-2">
            {items.map((item, i) => (
              <div
                key={`${item.question}-${i}`}
                className="p-6 rounded-[var(--theme-radius)] bg-[var(--theme-surface)] border border-[var(--theme-border)] shadow-sm flex flex-col gap-2"
              >
                <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--theme-accent)]">
                  {t('sitio.faq.consulta', { n: String(i + 1).padStart(2, '0') })}
                </span>
                <h3 className="m-0 font-[family-name:var(--theme-font-heading)] text-lg font-bold text-[var(--theme-text)]">
                  {item.question}
                </h3>
                <p className="m-0 text-sm leading-relaxed text-[var(--theme-text-muted)] whitespace-pre-line">
                  {item.answer}
                </p>
              </div>
            ))}
          </Reveal>
        </Container>
      </section>
    );
  }

  if (template === 'editorial') {
    return (
      <section id="faq" className="py-[var(--theme-spacing)] bg-[var(--theme-bg)] border-t border-[var(--theme-border)]">
        <Container>
          <SectionHeading
            eyebrow={t('sitio.faq.informacion')}
            title={t('sitio.faq.tituloEditorial')}
            className="mb-10"
          />
          <Reveal delay={0.06} className="divide-y divide-[var(--theme-border)] border-y border-[var(--theme-border)]">
            {items.map((item, i) => (
              <div key={`${item.question}-${i}`} className="py-6 grid gap-3 md:grid-cols-[minmax(0,0.45fr)_minmax(0,0.55fr)] md:gap-8">
                <div className="flex items-baseline gap-3">
                  <span className="text-xs font-mono text-[var(--theme-text-muted)]">{String(i + 1).padStart(2, '0')}</span>
                  <h3 className="m-0 font-[family-name:var(--theme-font-heading)] text-xl font-medium text-[var(--theme-text)]">
                    {item.question}
                  </h3>
                </div>
                <p className="m-0 text-sm sm:text-base leading-relaxed text-[var(--theme-text-muted)] whitespace-pre-line">
                  {item.answer}
                </p>
              </div>
            ))}
          </Reveal>
        </Container>
      </section>
    );
  }

  return (
    <section id="faq" className="py-[var(--theme-spacing)] bg-[var(--theme-bg)] border-t border-[var(--theme-border)]">
      <Container>
        <SectionHeading
          eyebrow={t('sitio.faq.dudasFrecuentes')}
          title={t('sitio.faq.titulo')}
          muted={t('sitio.faq.tituloAtenuado')}
        >
          <Reveal delay={0.08} className="mt-8 flex flex-col gap-3">
            {items.map((item, i) => (
              <details
                key={`${item.question}-${i}`}
                className="group rounded-[var(--theme-radius)] bg-[var(--theme-surface)] border border-[var(--theme-border)] overflow-hidden"
              >
                <summary className="px-6 py-4 cursor-pointer list-none flex items-center justify-between gap-4 font-semibold text-base text-[var(--theme-text)] select-none">
                  <span>{item.question}</span>
                  <span
                    aria-hidden="true"
                    className="shrink-0 w-7 h-7 rounded-full border border-[var(--theme-border)] flex items-center justify-center text-sm text-[var(--theme-text-muted)] transition-transform duration-200 group-open:rotate-45"
                  >
                    +
                  </span>
                </summary>
                <div className="px-6 pb-5 pt-1 text-sm sm:text-base leading-relaxed text-[var(--theme-text-muted)] whitespace-pre-line">
                  {item.answer}
                </div>
              </details>
            ))}
          </Reveal>
        </SectionHeading>
      </Container>
    </section>
  );
}
