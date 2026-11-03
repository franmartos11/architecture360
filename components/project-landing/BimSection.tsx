import Image from 'next/image';
import Reveal from '@/components/ui/Reveal';
import { TransitionLink as Link } from '@/components/ui/TransitionUtils';
import { shimmerDataUrl } from '@/lib/imagePlaceholder';
import { bimModelHref } from '@/lib/bim';
import type { SectionProps } from './types';
import { ArrowIcon, Container, SectionHeading } from './ui';

export default function BimSection({ project }: SectionProps) {
  if (project.bimModels.length === 0) return null;

  return (
    // Solo en pantallas anchas: en mobile el modelo no carga bien (ver
    // BimMobileGate), así que la sección no se ofrece.
    <section id="bim" className="hidden wide:block py-[calc(var(--theme-spacing)/2)] bg-[var(--theme-bg)]">
      <Container>
        <Reveal>
          <SectionHeading eyebrow="Modelo BIM" title="Cada pieza," muted="en detalle." className="mb-12" />
        </Reveal>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {project.bimModels.map((m, i) => (
            <Reveal key={m.id} delay={Math.min(i, 3) * 0.06}>
              <Link href={bimModelHref(m.id)} className="group flex flex-col gap-4 no-underline text-[var(--theme-text)]">
                <div className="relative aspect-[4/3] rounded-[var(--theme-radius)] overflow-hidden bg-[var(--theme-border)]">
                  {m.coverImage && (
                    <Image
                      src={m.coverImage} alt={m.title} fill
                      sizes="(min-width: 1024px) 33vw, 50vw"
                      placeholder="blur" blurDataURL={shimmerDataUrl()}
                      className="object-cover transition-transform duration-[1100ms] ease-[cubic-bezier(.2,.7,.2,1)] group-hover:scale-[1.06]"
                    />
                  )}
                </div>
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <h3 className="m-0 font-[family-name:var(--theme-font-heading)] text-xl font-semibold tracking-[-0.015em] truncate">{m.title}</h3>
                    {m.description && <p className="m-0 mt-1 text-sm text-[var(--theme-text-muted)] line-clamp-2">{m.description}</p>}
                  </div>
                  <span className="shrink-0 w-9 h-9 rounded-full bg-[var(--theme-text)] text-[var(--theme-bg)] flex items-center justify-center transition-transform duration-[450ms] group-hover:translate-x-1"><ArrowIcon /></span>
                </div>
              </Link>
            </Reveal>
          ))}
        </div>
      </Container>
    </section>
  );
}
