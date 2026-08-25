import Image from 'next/image';
import Reveal from '@/components/ui/Reveal';

export default function LandingCommunity() {
  return (
    <section id="comunidad" className="py-20 md:py-28 px-4 sm:px-6 lg:px-8 bg-white/[0.02] border-y border-white/10">
      <div className="max-w-7xl mx-auto grid md:grid-cols-2 gap-12 items-center">
        <Reveal className="relative rounded-2xl overflow-hidden border border-white/10 order-2 md:order-1">
          <Image
            src="/units/interior-1.jpg"
            alt="Interior de una unidad publicada en el feed de Atrium"
            width={1024}
            height={1024}
            className="w-full h-auto aspect-[4/3] object-cover"
          />
        </Reveal>

        <Reveal delay={0.05} className="order-1 md:order-2">
          <h2 className="font-display text-3xl md:text-4xl font-bold tracking-tight text-white max-w-md">
            Compartí tu trabajo con otros arquitectos.
          </h2>
          <p className="mt-4 text-white/60 leading-relaxed max-w-md">
            Publicá avances, seguí a otros estudios y estudiantes, y sumate a las conversaciones del gremio dentro de la plataforma.
          </p>
        </Reveal>
      </div>
    </section>
  );
}
