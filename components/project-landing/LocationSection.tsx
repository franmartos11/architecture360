import dynamic from 'next/dynamic';
import Reveal from '@/components/ui/Reveal';
import type { SectionProps } from './types';

// Swiper (carrusel + CSS + módulos) pesa bastante y esta sección está
// debajo del fold — se carga solo cuando el bundle del cliente la
// necesita, en vez de sumarse al JS inicial que bloquea el hero.
const PointsOfInterestCarousel = dynamic(() => import('@/components/SwiperCarousels').then(m => m.PointsOfInterestCarousel), {
  loading: () => <div className="w-full max-w-6xl mx-auto h-[400px] rounded-xl bg-gray-100 animate-pulse" />,
});

export default function LocationSection({ project, basePath }: SectionProps) {
  if (!project.pointsOfInterest.some(p => p.image)) return null;

  return (
    <section className="py-[var(--theme-spacing)] bg-[var(--theme-bg-alt)]">
      <Reveal className="max-w-6xl mx-auto px-4 md:px-6 mb-12 flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
        <h2 className="font-[family-name:var(--theme-font-heading)] text-3xl md:text-4xl font-light text-[var(--theme-text-on-dark)] max-w-lg leading-tight">
          UBICACIÓN
        </h2>
        <a
          href={`${basePath}/ubicacion`}
          className="px-6 py-3 border border-[var(--theme-text-on-dark)] text-[var(--theme-text-on-dark)] hover:bg-[var(--theme-text-on-dark)] hover:text-[var(--theme-bg-alt)] transition-colors duration-300 tracking-wider text-sm whitespace-nowrap w-full md:w-auto text-center"
        >
          DESCUBRIR LA ZONA
        </a>
      </Reveal>

      <PointsOfInterestCarousel pointsOfInterest={project.pointsOfInterest} />
    </section>
  );
}
