import Reveal from '@/components/ui/Reveal';
import { resolveWebTemplateKey } from '@/lib/web-templates';
import type { SectionProps } from './types';
import { Container, SectionHeading } from './ui';

export default function HighlightsSection({ project }: SectionProps) {
  const items = (project.themeConfig?.highlightsItems ?? []).filter(
    h => h.kicker.trim() && h.title.trim()
  );
  if (items.length === 0) return null;

  const template = resolveWebTemplateKey(project.themeConfig?.webTemplate);

  if (template === 'editorial') {
    return (
      <section id="diferenciales" className="py-[var(--theme-spacing)] bg-[var(--theme-bg)] border-t border-[var(--theme-border)]">
        <Container>
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {items.map((item, i) => (
              <Reveal key={`${item.title}-${i}`} delay={Math.min(i, 3) * 0.05} className="pt-4 border-t border-[var(--theme-border)] flex flex-col gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--theme-accent)]">
                  {item.kicker}
                </span>
                <h3 className="m-0 font-[family-name:var(--theme-font-heading)] text-2xl font-medium tracking-[-0.02em] text-[var(--theme-text)]">
                  {item.title}
                </h3>
                {item.detail && (
                  <p className="m-0 text-sm leading-relaxed text-[var(--theme-text-muted)]">{item.detail}</p>
                )}
              </Reveal>
            ))}
          </div>
        </Container>
      </section>
    );
  }

  return (
    <section id="diferenciales" className="py-[calc(var(--theme-spacing)/1.5)] bg-[var(--theme-bg)]">
      <Container>
        <SectionHeading eyebrow="Diferenciales" title="Puntos clave" muted="del proyecto" className="mb-10" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {items.map((item, i) => (
            <Reveal
              key={`${item.title}-${i}`}
              delay={Math.min(i, 3) * 0.05}
              className={`p-6 rounded-[var(--theme-radius)] border flex flex-col gap-2 ${
                template === 'comercial'
                  ? 'tpl-card bg-[var(--theme-surface)] border-[var(--theme-border)] shadow-sm'
                  : 'bg-[var(--theme-bg-alt)] text-[var(--theme-text-on-dark)] border-[var(--theme-border-on-dark)]'
              }`}
            >
              <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--theme-accent)]">
                {item.kicker}
              </span>
              <h3 className={`m-0 font-[family-name:var(--theme-font-heading)] text-xl font-bold tracking-[-0.015em] ${
                template === 'comercial' ? 'text-[var(--theme-text)]' : 'text-[var(--theme-text-on-dark)]'
              }`}>
                {item.title}
              </h3>
              {item.detail && (
                <p className={`m-0 text-sm leading-relaxed ${
                  template === 'comercial' ? 'text-[var(--theme-text-muted)]' : 'text-[var(--theme-text-on-dark-muted)]'
                }`}>
                  {item.detail}
                </p>
              )}
            </Reveal>
          ))}
        </div>
      </Container>
    </section>
  );
}
