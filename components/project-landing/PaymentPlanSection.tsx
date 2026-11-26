import Reveal from '@/components/ui/Reveal';
import { resolveWebTemplateKey } from '@/lib/web-templates';
import type { SectionProps } from './types';
import { Container, SectionHeading } from './ui';

export default function PaymentPlanSection({ project }: SectionProps) {
  const items = (project.themeConfig?.paymentPlanItems ?? []).filter(
    step => step.label.trim() && step.value.trim()
  );
  if (items.length === 0) return null;

  const template = resolveWebTemplateKey(project.themeConfig?.webTemplate);
  const note = project.themeConfig?.paymentPlanNote?.trim();

  return (
    <section id="pagos" className="py-[var(--theme-spacing)] bg-[var(--theme-bg)] border-t border-[var(--theme-border)]">
      <Container>
        <SectionHeading
          eyebrow="Financiación"
          title="Esquema de compra"
          muted={template === 'editorial' ? undefined : 'claro y flexible'}
        />
        <Reveal delay={0.08}>
          {template === 'editorial' ? (
            <ol className="mt-10 m-0 p-0 list-none grid gap-6 sm:grid-cols-2 lg:grid-cols-4 border-t border-[var(--theme-border)] pt-6">
              {items.map((step, i) => (
                <li key={`${step.label}-${i}`} className="flex flex-col gap-2">
                  <span className="text-[11px] font-mono text-[var(--theme-text-muted)]">
                    {String(i + 1).padStart(2, '0')} · {step.label}
                  </span>
                  <span className="font-[family-name:var(--theme-font-heading)] text-3xl sm:text-4xl font-medium tracking-[-0.03em] text-[var(--theme-text)]">
                    {step.value}
                  </span>
                  {step.note && <p className="m-0 text-sm text-[var(--theme-text-muted)] leading-relaxed">{step.note}</p>}
                </li>
              ))}
            </ol>
          ) : (
            <ol className="mt-10 m-0 p-0 list-none grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {items.map((step, i) => (
                <li
                  key={`${step.label}-${i}`}
                  className={`p-6 rounded-[var(--theme-radius)] border flex flex-col gap-2 ${
                    template === 'comercial'
                      ? 'tpl-card bg-[var(--theme-surface)] border-[var(--theme-border)] shadow-sm'
                      : 'bg-[var(--theme-surface)]/70 border-[var(--theme-border)]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--theme-accent)]">
                      {step.label}
                    </span>
                    <span className="w-6 h-6 rounded-full border border-[var(--theme-border)] text-[11px] font-semibold flex items-center justify-center text-[var(--theme-text-muted)] tabular-nums">
                      {i + 1}
                    </span>
                  </div>
                  <span className="font-[family-name:var(--theme-font-heading)] text-[clamp(28px,3.2vw,40px)] leading-tight font-bold tracking-[-0.025em] text-[var(--theme-text)]">
                    {step.value}
                  </span>
                  {step.note && (
                    <p className="m-0 text-sm leading-relaxed text-[var(--theme-text-muted)]">{step.note}</p>
                  )}
                </li>
              ))}
            </ol>
          )}
          {note && (
            <p className="mt-6 text-sm text-[var(--theme-text-muted)] max-w-2xl leading-relaxed">
              {note}
            </p>
          )}
        </Reveal>
      </Container>
    </section>
  );
}
