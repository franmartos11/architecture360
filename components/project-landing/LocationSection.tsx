import dynamic from 'next/dynamic';
import Image from 'next/image';
import Reveal from '@/components/ui/Reveal';
import { shimmerDataUrl } from '@/lib/imagePlaceholder';
import { resolveWebTemplateKey } from '@/lib/web-templates';
import type { SectionProps } from './types';
import { Container, Pill, SectionHeading } from './ui';
import { crearT } from '@/lib/i18n/t';
import { poiCategoryLabel } from '@/lib/poiCategories';

// Valor de la prop de next/image, no texto (el guardián de i18n mira los placeholder escritos a mano).
const BLUR = 'blur' as const;

// Swiper (carrusel + CSS + módulos) pesa bastante y esta sección está
// debajo del fold — se carga solo cuando el bundle del cliente la
// necesita, en vez de sumarse al JS inicial que bloquea el hero.
const PointsOfInterestCarousel = dynamic(() => import('@/components/SwiperCarousels').then(m => m.PointsOfInterestCarousel), {
  loading: () => <div className="w-full h-[420px] rounded-[var(--theme-radius)] bg-[var(--theme-border)] animate-pulse" />,
});

export default function LocationSection({ project, basePath, locale = 'es' }: SectionProps) {
  if (!project.pointsOfInterest.some(p => p.image)) return null;
  const t = crearT(locale);
  // En castellano queda la categoría tal cual (como siempre); en otro idioma, su etiqueta.
  const categoria = (c: (typeof project.pointsOfInterest)[number]['category']) => (locale === 'es' ? c : poiCategoryLabel(c, locale));

  // "Salta, Argentina" → "Salta" para el título; la dirección completa va abajo.
  const city = project.location?.split(',')[0]?.trim();
  const template = resolveWebTemplateKey(project.themeConfig?.webTemplate);
  const poisWithImages = project.pointsOfInterest.filter(p => p.image);

  if (template === 'comercial') {
    return (
      <section id="ubicacion" className="py-[calc(var(--theme-spacing)/1.5)] bg-[var(--theme-bg)] border-t border-[var(--theme-border)]">
        <Container>
          <div className="flex flex-wrap items-end justify-between gap-6 mb-10">
            <div className="space-y-2">
              <span className="block text-xs font-semibold uppercase tracking-[0.08em] text-[var(--theme-accent)]">
                {t('sitio.ubicacion.entorno')}
              </span>
              <h2 className="m-0 font-[family-name:var(--theme-font-heading)] text-[clamp(30px,3.8vw,48px)] leading-[1.06] font-bold tracking-[-0.03em] text-[var(--theme-text)]">
                {city ? t('sitio.ubicacion.viviConectado', { ciudad: city }) : t('sitio.ubicacion.puntosClave')}
              </h2>
            </div>
            <Pill href={`${basePath}/ubicacion`} arrow>{t('sitio.ubicacion.verMapa')}</Pill>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {poisWithImages.slice(0, 6).map((p, i) => (
              <Reveal key={p.id} delay={Math.min(i, 3) * 0.05} className="tpl-card overflow-hidden rounded-[var(--theme-radius)] bg-[var(--theme-surface)] border border-[var(--theme-border)] shadow-sm">
                <div className="relative h-44 bg-[var(--theme-border)]">
                  <Image src={p.image!} alt={p.name} fill sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw" placeholder={BLUR} blurDataURL={shimmerDataUrl()} className="object-cover" />
                  {(p.distanceLabel || p.walkMinutes) && (
                    <span className="absolute bottom-3 left-3 px-2.5 py-1 rounded-full bg-[var(--theme-surface)]/95 text-[var(--theme-text)] text-xs font-semibold">
                      {p.distanceLabel || t('sitio.ubicacion.minCaminando', { min: p.walkMinutes ?? 0 })}
                    </span>
                  )}
                </div>
                <div className="p-4">
                  <span className="block text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--theme-accent)]">{categoria(p.category)}</span>
                  <h3 className="m-0 mt-1 font-[family-name:var(--theme-font-heading)] text-lg font-bold text-[var(--theme-text)]">{p.name}</h3>
                </div>
              </Reveal>
            ))}
          </div>
        </Container>
      </section>
    );
  }

  if (template === 'editorial') {
    return (
      <section id="ubicacion" className="py-[var(--theme-spacing)] bg-[var(--theme-bg)] border-t border-[var(--theme-border)]">
        <Container className="grid gap-10 lg:grid-cols-[minmax(0,0.45fr)_minmax(0,0.55fr)] items-start">
          <div className="space-y-4">
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--theme-text-muted)]">{t('sitio.ubicacion.contextoUrbano')}</span>
            <h2 className="m-0 font-[family-name:var(--theme-font-heading)] text-[clamp(30px,3.8vw,48px)] leading-[1.06] font-medium tracking-[-0.03em] text-[var(--theme-text)]">
              {city ? t('sitio.ubicacion.ciudadYEntorno', { ciudad: city }) : t('sitio.ubicacion.entornoDelProyecto')}
            </h2>
            <Pill href={`${basePath}/ubicacion`} variant="ghost" arrow>{t('sitio.ubicacion.explorarMapa')}</Pill>
          </div>
          <div className="divide-y divide-[var(--theme-border)] border-y border-[var(--theme-border)]">
            {poisWithImages.slice(0, 6).map(p => (
              <div key={p.id} className="py-4 flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <span className="block font-medium text-base text-[var(--theme-text)] truncate">{p.name}</span>
                  <span className="text-xs uppercase tracking-[0.06em] text-[var(--theme-text-muted)]">{categoria(p.category)}</span>
                </div>
                <span className="text-sm font-medium text-[var(--theme-accent)] shrink-0">
                  {p.distanceLabel || (p.walkMinutes ? t('sitio.ubicacion.min', { min: p.walkMinutes }) : '')}
                </span>
              </div>
            ))}
          </div>
        </Container>
      </section>
    );
  }

  return (
    <section id="ubicacion" className="py-[calc(var(--theme-spacing)/2)] bg-[var(--theme-bg)]">
      <Container>
        <Reveal>
          <SectionHeading eyebrow={t('nav.ubicacion')}>
            <div className="flex flex-col gap-8">
              <h2 className="m-0 font-[family-name:var(--theme-font-heading)] text-[clamp(30px,3.6vw,52px)] leading-[1.1] font-medium tracking-[-0.03em] text-[var(--theme-text)] text-balance">
                {city ? t('sitio.ubicacion.todoCercaEn', { ciudad: city }) : t('sitio.ubicacion.todoCerca')}{' '}
                <span className="text-[var(--theme-text-muted)]">{t('sitio.ubicacion.miraAlrededor')}</span>
              </h2>
              <PointsOfInterestCarousel pointsOfInterest={project.pointsOfInterest} />
              <div>
                <Pill href={`${basePath}/ubicacion`} variant="ghost" arrow>{t('sitio.ubicacion.descubrirZona')}</Pill>
              </div>
            </div>
          </SectionHeading>
        </Reveal>
      </Container>
    </section>
  );
}
