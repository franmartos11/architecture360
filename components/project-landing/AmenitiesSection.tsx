import Image from 'next/image';
import Reveal from '@/components/ui/Reveal';
import { TransitionLink as Link } from '@/components/ui/TransitionUtils';
import { shimmerDataUrl } from '@/lib/imagePlaceholder';
import { resolveWebTemplateKey } from '@/lib/web-templates';
import type { SectionProps } from './types';
import { ArrowIcon, Container, SectionHeading } from './ui';

export default function AmenitiesSection({ project, basePath }: SectionProps) {
  // Una tarjeta necesita una foto — sin eso no hay nada que mostrar.
  const cards = project.amenities.filter(a => a.images.length > 0);
  if (cards.length === 0) return null;
  const template = resolveWebTemplateKey(project.themeConfig?.webTemplate);

  if (template === 'comercial') {
    return (
      <section id="amenities" className="py-[calc(var(--theme-spacing)/2)] bg-[var(--theme-bg)] border-t border-[var(--theme-border)]">
        <Container>
          <Reveal>
            <SectionHeading eyebrow="Amenities" title="Espacios comunes incluidos" className="mb-10" />
          </Reveal>
          <div className="grid gap-4 md:grid-cols-2">
            {cards.map((a, i) => (
              <Reveal key={a.id} delay={Math.min(i, 3) * 0.05}>
                <Link
                  href={`${basePath}/amenities`}
                  className="tpl-card group flex flex-col sm:flex-row overflow-hidden rounded-[var(--theme-radius)] bg-[var(--theme-surface)] border border-[var(--theme-border)] hover:border-[var(--theme-accent)] no-underline text-[var(--theme-text)] shadow-sm"
                >
                  <div className="relative h-48 sm:h-auto sm:w-48 shrink-0 bg-[var(--theme-border)] overflow-hidden">
                    <Image
                      src={a.images[0]}
                      alt={a.name}
                      fill
                      sizes="(min-width: 640px) 220px, 100vw"
                      placeholder="blur"
                      blurDataURL={shimmerDataUrl()}
                      className="object-cover transition-transform duration-700 group-hover:scale-105"
                    />
                  </div>
                  <div className="p-5 flex flex-col justify-between gap-3 flex-1 min-w-0">
                    <div className="space-y-1.5">
                      {a.location && (
                        <span className="inline-block text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--theme-accent)]">
                          {a.location}
                        </span>
                      )}
                      <h3 className="m-0 font-[family-name:var(--theme-font-heading)] text-xl font-bold tracking-[-0.015em]">
                        {a.name}
                      </h3>
                      {a.description && (
                        <p className="m-0 text-sm text-[var(--theme-text-muted)] line-clamp-2">{a.description}</p>
                      )}
                    </div>
                    <span className="inline-flex items-center gap-2 text-xs font-semibold text-[var(--theme-text)]">
                      Ver detalle <ArrowIcon />
                    </span>
                  </div>
                </Link>
              </Reveal>
            ))}
          </div>
        </Container>
      </section>
    );
  }

  if (template === 'editorial') {
    return (
      <section id="amenities" className="py-[var(--theme-spacing)] bg-[var(--theme-bg)] border-t border-[var(--theme-border)]">
        <Container>
          <Reveal>
            <SectionHeading eyebrow="Amenities" title="Programa de uso común" className="mb-10" />
          </Reveal>
          <div className="grid gap-6 md:grid-cols-12">
            {cards.map((a, i) => (
              <Reveal key={a.id} delay={Math.min(i, 3) * 0.06} className={i === 0 ? 'md:col-span-12' : 'md:col-span-4'}>
                <Link href={`${basePath}/amenities`} className="group block no-underline text-[var(--theme-text)]">
                  <div className={`ed-curtain relative overflow-hidden rounded-[var(--theme-radius)] bg-[var(--theme-border)] ${i === 0 ? 'aspect-[16/9] sm:aspect-[21/9]' : 'aspect-[4/3]'}`}>
                    <Image
                      src={a.images[0]}
                      alt={a.name}
                      fill
                      sizes={i === 0 ? '100vw' : '(min-width: 768px) 33vw, 100vw'}
                      placeholder="blur"
                      blurDataURL={shimmerDataUrl()}
                      className="object-cover transition-transform duration-700 group-hover:scale-[1.03]"
                    />
                  </div>
                  <div className="mt-3 pt-3 border-t border-[var(--theme-border)] flex items-baseline justify-between gap-4">
                    <div>
                      <h3 className="m-0 font-[family-name:var(--theme-font-heading)] text-xl font-medium">{a.name}</h3>
                      {a.description && <p className="m-0 mt-1 text-sm text-[var(--theme-text-muted)] line-clamp-2">{a.description}</p>}
                    </div>
                    {a.location && <span className="shrink-0 text-xs uppercase tracking-[0.08em] text-[var(--theme-text-muted)]">{a.location}</span>}
                  </div>
                </Link>
              </Reveal>
            ))}
          </div>
        </Container>
      </section>
    );
  }

  return (
    <section id="amenities" className="py-[calc(var(--theme-spacing)/2)] bg-[var(--theme-bg)]">
      <Container>
        <Reveal>
          <SectionHeading eyebrow="Amenities" title="Espacios para disfrutar," muted="relajarte y conectar." className="mb-12" />
        </Reveal>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-5">
          {cards.map((a, i) => (
            <Reveal key={a.id} delay={Math.min(i, 3) * 0.06}>
              <Link href={`${basePath}/amenities`} className="group flex flex-col gap-4 no-underline text-[var(--theme-text)]">
                <div className="relative h-[300px] sm:h-[340px] rounded-[var(--theme-radius)] overflow-hidden bg-[var(--theme-border)]">
                  <Image
                    src={a.images[0]}
                    alt={a.name}
                    fill
                    sizes="(min-width: 1360px) 340px, (min-width: 640px) 50vw, 100vw"
                    placeholder="blur"
                    blurDataURL={shimmerDataUrl()}
                    className="object-cover transition-transform duration-[1100ms] ease-[cubic-bezier(.2,.7,.2,1)] group-hover:scale-[1.07]"
                  />
                  {a.location && (
                    <span className="absolute top-3.5 left-3.5 h-7 px-3 rounded-full bg-[var(--theme-surface)]/95 text-[var(--theme-text)] text-xs font-semibold inline-flex items-center max-w-[calc(100%-28px)] truncate">
                      {a.location}
                    </span>
                  )}
                </div>
                <div className="flex flex-col gap-1.5">
                  <h3 className="m-0 font-[family-name:var(--theme-font-heading)] text-[22px] font-semibold tracking-[-0.015em]">{a.name}</h3>
                  {a.description && <p className="m-0 text-sm leading-normal text-[var(--theme-text-muted)] line-clamp-3">{a.description}</p>}
                  <span className="mt-1.5 inline-flex items-center gap-2 text-sm font-semibold">
                    Ver más
                    <span className="transition-transform duration-[450ms] group-hover:translate-x-1"><ArrowIcon /></span>
                  </span>
                </div>
              </Link>
            </Reveal>
          ))}
        </div>
      </Container>
    </section>
  );
}
