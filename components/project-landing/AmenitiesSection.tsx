import Image from 'next/image';
import Reveal from '@/components/ui/Reveal';
import { TransitionLink as Link } from '@/components/ui/TransitionUtils';
import { shimmerDataUrl } from '@/lib/imagePlaceholder';
import type { SectionProps } from './types';
import { ArrowIcon, Container, SectionHeading } from './ui';

export default function AmenitiesSection({ project, basePath }: SectionProps) {
  // Una tarjeta necesita una foto — sin eso no hay nada que mostrar.
  const cards = project.amenities.filter(a => a.images.length > 0);
  if (cards.length === 0) return null;

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
