import Image from 'next/image';
import Reveal from '@/components/ui/Reveal';
import { shimmerDataUrl } from '@/lib/imagePlaceholder';
import type { Project } from '@/types';
import type { SectionProps } from './types';
import { resolveWebTemplateKey } from '@/lib/web-templates';
import { Container } from './ui';
import { crearT } from '@/lib/i18n/t';

// Valor de la prop de next/image, no texto (el guardián de i18n mira los placeholder escritos a mano).
const BLUR = 'blur' as const;

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

export default function GallerySection({ project, typeConfig, locale = 'es' }: SectionProps) {
  const images = galleryImages(project);
  if (images.length < GALLERY_MIN) return null;
  const t = crearT(locale);

  const article = typeConfig.unitLabelGender === 'f' ? 'una' : 'un';
  const isSale = typeConfig.saleMode !== 'showcase';
  const template = resolveWebTemplateKey(project.themeConfig?.webTemplate);
  const isEditorial = template === 'editorial';
  const isComercial = template === 'comercial';
  const unidad = typeConfig.unitLabel.toLowerCase();

  return (
    <section className="py-[calc(var(--theme-spacing)/2)] bg-[var(--theme-bg)]">
      <Container>
        <Reveal>
          <h2 className="m-0 mb-12 text-center font-[family-name:var(--theme-font-heading)] text-[clamp(32px,4.4vw,64px)] leading-[1.05] font-medium tracking-[-0.035em] text-[var(--theme-text)] text-balance">
            {isSale
              ? <>{t('sitio.galeria.noEsSolo', { articulo: article, unidad })} <span className="text-[var(--theme-text-muted)]">{t('sitio.galeria.esTuLugar')}</span></>
              : <>{t('sitio.galeria.cadaDecision')} <span className="text-[var(--theme-text-muted)]">{t('sitio.galeria.aLaVista')}</span></>}
          </h2>
        </Reveal>
        {isEditorial ? (
          <Reveal delay={0.1} className="grid gap-4 md:grid-cols-12">
            {images.map((img, i) => (
              <div
                key={img.src}
                className={`ed-curtain group relative overflow-hidden rounded-[var(--theme-radius)] border border-[var(--theme-border)] bg-[var(--theme-surface)] ${
                  i === 0 ? 'md:col-span-7 h-[280px] sm:h-[420px]' : i === 1 ? 'md:col-span-5 h-[280px] sm:h-[420px]' : 'md:col-span-6 h-[220px] sm:h-[300px]'
                }`}
              >
                <Image
                  src={img.src}
                  alt={img.alt}
                  fill
                  sizes={i === 0 ? '(min-width: 768px) 60vw, 100vw' : '(min-width: 768px) 45vw, 100vw'}
                  placeholder={BLUR}
                  blurDataURL={shimmerDataUrl()}
                  className="object-cover transition-transform duration-1000 ease-out motion-safe:group-hover:scale-[1.03]"
                />
              </div>
            ))}
          </Reveal>
        ) : isComercial ? (
          <Reveal delay={0.08} className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
            {images.map(img => (
              <div
                key={img.src}
                className="tpl-card group relative aspect-[4/3] overflow-hidden rounded-[var(--theme-radius)] border border-[var(--theme-border)] bg-[var(--theme-surface)]"
              >
                <Image
                  src={img.src}
                  alt={img.alt}
                  fill
                  sizes="(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw"
                  placeholder={BLUR}
                  blurDataURL={shimmerDataUrl()}
                  className="object-cover transition-transform duration-500 ease-out motion-safe:group-hover:scale-105"
                />
              </div>
            ))}
          </Reveal>
        ) : (
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
                  placeholder={BLUR}
                  blurDataURL={shimmerDataUrl()}
                  className="object-cover"
                />
              </div>
            ))}
          </Reveal>
        )}
        {isSale && (
          <p className="mt-10 mx-auto max-w-[520px] text-center text-[17px] leading-normal font-medium text-[var(--theme-text)]">
            {t(typeConfig.showPrice ? 'sitio.galeria.cadaUnidadConPrecio' : 'sitio.galeria.cadaUnidad', { unidad })} <span className="text-[var(--theme-text-muted)]">{t('sitio.galeria.elegi')}</span>
          </p>
        )}
      </Container>
    </section>
  );
}
