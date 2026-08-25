import Image from 'next/image';
import Reveal from '@/components/ui/Reveal';

export default function LandingPortfolio() {
  return (
    <section id="portfolio" className="py-20 md:py-28 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto grid md:grid-cols-2 gap-12 items-center">
        <Reveal>
          <h2 className="font-display text-3xl md:text-4xl font-bold tracking-tight text-white max-w-md">
            Tu perfil, como tu currículum.
          </h2>
          <p className="mt-4 text-white/60 leading-relaxed max-w-md">
            Subí tus proyectos, sumá tu experiencia y formación, y compartí un solo link con todo tu trabajo. Sirve igual para un estudio con años de obras que para tu primer proyecto de la facultad.
          </p>
        </Reveal>

        <Reveal delay={0.05} className="relative rounded-2xl overflow-hidden border border-white/10">
          <Image
            src="/units/gallery-3.png"
            alt="Uno de los proyectos publicados en un perfil de Atrium"
            width={1024}
            height={1024}
            className="w-full h-auto aspect-[4/3] object-cover"
          />
        </Reveal>
      </div>
    </section>
  );
}
