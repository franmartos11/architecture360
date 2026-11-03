import Image from 'next/image';
import Reveal from '@/components/ui/Reveal';
import { shimmerDataUrl } from '@/lib/imagePlaceholder';
import type { Project } from '@/types';
import type { SectionProps } from './types';
import { Container } from './ui';

// No hay una galería propia que cargar: se arma con las fotos que el
// proyecto ya tiene (vistas aéreas, portadas de edificios, amenities) para
// no sumarle otra carga al admin. Con menos de 3 la tira de chevrones
// queda pobre, así que no se muestra.
export const GALLERY_MIN = 3;
const GALLERY_MAX = 4;

export function galleryImages(project: Pick<Project, 'aerialSlides' | 'buildings' | 'amenities' | 'masterplanImage'>): { src: string; alt: string }[] {
  const out: { src: string; alt: string }[] = [];
  const seen = new Set<string>();
  const add = (src: string | undefined, alt: string) => {
    if (!src || seen.has(src) || out.length >= GALLERY_MAX) return;
    seen.add(src);
    out.push({ src, alt });
  };
  // La primera vista aérea suele ser la misma foto del hero — va al final.
  project.aerialSlides.slice(1).forEach(s => add(s.imageUrl, s.label));
  project.buildings.forEach(b => add(b.coverImage, b.name));
  project.amenities.forEach(a => add(a.images[0], a.name));
  add(project.aerialSlides[0]?.imageUrl, project.aerialSlides[0]?.label ?? '');
  return out;
}

export default function GallerySection({ project, typeConfig }: SectionProps) {
  const images = galleryImages(project);
  if (images.length < GALLERY_MIN) return null;

  const article = typeConfig.unitLabelGender === 'f' ? 'una' : 'un';
  const isSale = typeConfig.saleMode !== 'showcase';

  return (
    <section className="py-[calc(var(--theme-spacing)/2)] bg-[var(--theme-bg)]">
      <Container>
        <Reveal>
          <h2 className="m-0 mb-12 text-center font-[family-name:var(--theme-font-heading)] text-[clamp(32px,4.4vw,64px)] leading-[1.05] font-medium tracking-[-0.035em] text-[var(--theme-text)] text-balance">
            {isSale
              ? <>No es solo {article} {typeConfig.unitLabel.toLowerCase()}. <span className="text-[var(--theme-text-muted)]">Es tu lugar.</span></>
              : <>Cada decisión, <span className="text-[var(--theme-text-muted)]">a la vista.</span></>}
          </h2>
        </Reveal>
        <Reveal delay={0.1} className="flex justify-center">
          {images.map((img, i) => (
            <div
              key={img.src}
              className="lp-chev relative flex-1 min-w-0 h-[clamp(160px,26vw,380px)] overflow-hidden"
              style={i > 0 ? { marginLeft: '-6%' } : undefined}
            >
              <Image
                src={img.src}
                alt={img.alt}
                fill
                sizes="(min-width: 1360px) 400px, 30vw"
                placeholder="blur"
                blurDataURL={shimmerDataUrl()}
                className="object-cover"
              />
            </div>
          ))}
        </Reveal>
        {isSale && (
          <p className="mt-10 mx-auto max-w-[520px] text-center text-[17px] leading-normal font-medium text-[var(--theme-text)]">
            Cada {typeConfig.unitLabel.toLowerCase()} tiene {typeConfig.showPrice ? 'su ficha, su plano y su precio' : 'su ficha y su plano'}. <span className="text-[var(--theme-text-muted)]">Elegí, compará y consultá sin vueltas.</span>
          </p>
        )}
      </Container>
    </section>
  );
}
