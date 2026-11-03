import dynamic from 'next/dynamic';
import Reveal from '@/components/ui/Reveal';
import type { SectionProps } from './types';
import { Container, Pill, SectionHeading } from './ui';

// Swiper (carrusel + CSS + módulos) pesa bastante y esta sección está
// debajo del fold — se carga solo cuando el bundle del cliente la
// necesita, en vez de sumarse al JS inicial que bloquea el hero.
const PointsOfInterestCarousel = dynamic(() => import('@/components/SwiperCarousels').then(m => m.PointsOfInterestCarousel), {
  loading: () => <div className="w-full h-[420px] rounded-[var(--theme-radius)] bg-[var(--theme-border)] animate-pulse" />,
});

export default function LocationSection({ project, basePath }: SectionProps) {
  if (!project.pointsOfInterest.some(p => p.image)) return null;

  // "Salta, Argentina" → "Salta" para el título; la dirección completa va abajo.
  const city = project.location?.split(',')[0]?.trim();

  return (
    <section id="ubicacion" className="py-[calc(var(--theme-spacing)/2)] bg-[var(--theme-bg)]">
      <Container>
        <Reveal>
          <SectionHeading eyebrow="Ubicación">
            <div className="flex flex-col gap-8">
              <h2 className="m-0 font-[family-name:var(--theme-font-heading)] text-[clamp(30px,3.6vw,52px)] leading-[1.1] font-medium tracking-[-0.03em] text-[var(--theme-text)] text-balance">
                {city ? <>Todo cerca, en {city}.</> : <>Todo cerca.</>}{' '}
                <span className="text-[var(--theme-text-muted)]">Mirá qué hay alrededor.</span>
              </h2>
              <PointsOfInterestCarousel pointsOfInterest={project.pointsOfInterest} />
              <div>
                <Pill href={`${basePath}/ubicacion`} variant="ghost" arrow>Descubrir la zona</Pill>
              </div>
            </div>
          </SectionHeading>
        </Reveal>
      </Container>
    </section>
  );
}
