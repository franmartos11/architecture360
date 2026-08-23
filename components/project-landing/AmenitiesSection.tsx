import Image from 'next/image';
import Reveal from '@/components/ui/Reveal';
import { TransitionLink as Link } from '@/components/ui/TransitionUtils';
import { shimmerDataUrl } from '@/lib/imagePlaceholder';
import type { SectionProps } from './types';

export default function AmenitiesSection({ project }: SectionProps) {
  // Una fila necesita una foto — sin eso no hay nada que mostrar al lado
  // del texto (mismo criterio que usaba el carrusel anterior).
  const rows = project.amenities.filter(a => a.images.length > 0);
  if (rows.length === 0) return null;

  return (
    <section className="py-[var(--theme-spacing)] bg-[var(--theme-bg)]">
      <Reveal className="max-w-7xl mx-auto px-4 md:px-6 mb-12">
        <div className="flex flex-col gap-2">
          <h2 className="font-[family-name:var(--theme-font-heading)] text-3xl font-medium text-[var(--theme-text)]">
            AMENIDADES
          </h2>
          <p className="text-[var(--theme-text-muted)] font-light">
            Espacios exclusivos para disfrutar, relajarte y conectar.
          </p>
        </div>
      </Reveal>

      <div className="max-w-7xl mx-auto px-4 md:px-6 flex flex-col gap-16 md:gap-20">
        {rows.map((a, i) => (
          <Reveal
            key={a.id}
            className={`flex flex-col md:flex-row gap-8 md:gap-12 items-center ${i % 2 === 1 ? 'md:flex-row-reverse' : ''}`}
          >
            <div className="relative w-full md:w-1/2 h-[280px] sm:h-[380px] md:h-[440px] rounded-[var(--theme-radius)] overflow-hidden shrink-0">
              <Image
                src={a.images[0]}
                alt={a.name}
                fill
                sizes="(min-width: 768px) 50vw, 100vw"
                placeholder="blur"
                blurDataURL={shimmerDataUrl()}
                className="object-cover"
              />
            </div>
            <div className="w-full md:w-1/2 space-y-4">
              <h3 className="font-[family-name:var(--theme-font-heading)] text-2xl sm:text-3xl font-medium text-[var(--theme-text)]">
                {a.name}
              </h3>
              {a.description && (
                <p className="text-[var(--theme-text-muted)] font-light leading-relaxed">{a.description}</p>
              )}
              <Link
                href={`/proyecto/${project.slug}/amenities`}
                className="inline-block px-6 py-3 border border-[var(--theme-text)] text-[var(--theme-text)] hover:bg-[var(--theme-text)] hover:text-[var(--theme-bg)] transition-colors duration-300 tracking-wider text-sm"
              >
                VER MÁS
              </Link>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
