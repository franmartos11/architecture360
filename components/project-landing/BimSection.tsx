import Image from 'next/image';
import Reveal from '@/components/ui/Reveal';
import { TransitionLink as Link } from '@/components/ui/TransitionUtils';
import { shimmerDataUrl } from '@/lib/imagePlaceholder';
import { bimModelHref } from '@/lib/bim';
import type { SectionProps } from './types';

export default function BimSection({ project }: SectionProps) {
  if (project.bimModels.length === 0) return null;

  return (
    <section className="py-[var(--theme-spacing)] bg-[var(--theme-bg)]">
      <Reveal className="max-w-7xl mx-auto px-4 md:px-6 mb-12">
        <div className="flex flex-col gap-2">
          <h2 className="font-[family-name:var(--theme-font-heading)] text-3xl font-medium text-[var(--theme-text)]">
            MODELO BIM
          </h2>
          <p className="text-[var(--theme-text-muted)] font-light">
            Recorré el proyecto en detalle.
          </p>
        </div>
      </Reveal>

      <div className="max-w-7xl mx-auto px-4 md:px-6 grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {project.bimModels.map((m, i) => (
          <Reveal key={m.id} delay={i * 0.05}>
            <Link
              href={bimModelHref(m.id)}
              className="group flex flex-col rounded-2xl overflow-hidden bg-[var(--theme-bg-alt)] border border-[var(--theme-text)]/10 hover:border-[var(--theme-text)]/30 transition-all hover:-translate-y-1 shadow-sm hover:shadow-md"
            >
              <div className="relative w-full aspect-square sm:aspect-[4/3] overflow-hidden bg-[repeating-linear-gradient(115deg,#e6e3dc_0px,#e6e3dc_18px,#dcd8d0_18px,#dcd8d0_36px)]">
                {m.coverImage && (
                  <Image
                    src={m.coverImage} alt={m.title} fill
                    sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
                    placeholder="blur" blurDataURL={shimmerDataUrl()}
                    className="object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                )}
              </div>
              <div className="p-5 bg-[var(--theme-text)] flex flex-col justify-center min-h-[5rem]">
                <p className="font-[family-name:var(--theme-font-heading)] text-[var(--theme-bg)] font-medium truncate">
                  {m.title}
                </p>
                {m.description && (
                  <p className="text-sm text-[var(--theme-bg)]/70 font-light line-clamp-2 mt-1">{m.description}</p>
                )}
              </div>
            </Link>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
