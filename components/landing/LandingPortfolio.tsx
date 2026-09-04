import Image from 'next/image';
import Reveal from '@/components/ui/Reveal';

export default function LandingPortfolio() {
  return (
    <section id="portfolio" className="py-14 md:py-16 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto grid md:grid-cols-2 gap-3.5">
        <Reveal className="border border-white/10 rounded-[18px] overflow-hidden bg-white/[0.03] flex flex-col">
          <div className="p-7 pb-5.5 flex flex-col gap-3">
            <span className="text-[11.5px] font-medium uppercase tracking-[0.16em] text-brand-300">Portfolio</span>
            <h2 className="font-display text-2xl md:text-[30px] leading-tight tracking-tight font-bold text-white">
              Tu perfil, como tu currículum.
            </h2>
            <p className="text-[15px] leading-relaxed text-white/58">
              Subí tus proyectos, sumá experiencia y formación, y compartí un solo link con todo tu trabajo. Sirve
              igual para un estudio con años de obra que para tu primer proyecto de la facultad.
            </p>
          </div>
          <Image
            src="/units/gallery-3.png"
            alt="Uno de los proyectos publicados en un perfil de Atrium"
            width={1024}
            height={1024}
            className="w-full flex-1 min-h-[220px] object-cover"
          />
        </Reveal>

        <div id="comunidad">
          <Reveal delay={0.05} className="border border-white/10 rounded-[18px] overflow-hidden bg-white/[0.03] flex flex-col">
            <div className="p-7 pb-5.5 flex flex-col gap-3">
              <span className="text-[11.5px] font-medium uppercase tracking-[0.16em] text-brand-300">Comunidad</span>
              <h2 className="font-display text-2xl md:text-[30px] leading-tight tracking-tight font-bold text-white">
                Compartí tu obra con otros arquitectos.
              </h2>
              <p className="text-[15px] leading-relaxed text-white/58">
                Publicá avances, seguí a otros estudios y estudiantes, y sumate a las conversaciones del gremio sin
                salir de la plataforma.
              </p>
            </div>
            <Image
              src="/units/interior-1.jpg"
              alt="Interior de una unidad publicada en el feed de Atrium"
              width={1024}
              height={1024}
              className="w-full flex-1 min-h-[220px] object-cover"
            />
          </Reveal>
        </div>
      </div>
    </section>
  );
}
