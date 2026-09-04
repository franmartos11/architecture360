import Image from 'next/image';
import { TransitionLink as Link } from '@/components/ui/TransitionUtils';
import Reveal from '@/components/ui/Reveal';

const PROJECTS = [
  {
    image: '/aerial/view-2.png',
    alt: 'Proyecto residencial publicado en Atrium',
    metric: '48 unidades',
    type: 'Multifamiliar · Ciudad, provincia',
  },
  {
    image: '/units/gallery-1.png',
    alt: 'Interior de una unidad de un proyecto publicado',
    metric: '12 tours',
    type: 'Vivienda unifamiliar · Ciudad, provincia',
  },
  {
    image: '/floorplans/floor-1-render.png',
    alt: 'Planta de un proyecto publicado en Atrium',
    metric: '6 plantas',
    type: 'Loteo · Ciudad, provincia',
  },
];

export default function LandingFeaturedProjects() {
  return (
    <section className="border-t border-white/10 bg-white/[0.02]">
      <div className="max-w-7xl mx-auto py-14 md:py-16 px-4 sm:px-6 lg:px-8 flex flex-col gap-6.5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h2 className="font-display text-2xl md:text-[34px] font-bold tracking-tight text-white">
            Proyectos hechos con Atrium.
          </h2>
          <Link href="#registro" className="text-sm text-white/60 hover:text-white transition-colors">
            Ver todos los proyectos →
          </Link>
        </div>

        <div className="grid md:grid-cols-3 gap-3.5">
          {PROJECTS.map((project, i) => (
            <Reveal key={project.image + i} delay={i * 0.06}>
              <Link
                href="#registro"
                className="block border border-white/10 hover:border-brand-300/45 rounded-2xl overflow-hidden bg-stone-950 transition-colors"
              >
                <Image
                  src={project.image}
                  alt={project.alt}
                  width={800}
                  height={600}
                  className="w-full aspect-[4/3] object-cover"
                />
                <div className="p-4.5 flex flex-col gap-2">
                  <div className="flex items-baseline justify-between gap-3">
                    <h3 className="font-display text-[17px] font-bold text-white">Nombre del proyecto</h3>
                    <span className="font-mono text-[11px] text-brand-300">{project.metric}</span>
                  </div>
                  <p className="text-[13.5px] text-white/50">{project.type}</p>
                </div>
              </Link>
            </Reveal>
          ))}
        </div>

        <p className="font-mono text-[11.5px] text-white/30">
          Reemplazar por tres proyectos reales en producción (nombre, tipo, ubicación y una métrica).
        </p>
      </div>
    </section>
  );
}
