import Image from 'next/image';
import Reveal from '@/components/ui/Reveal';

export default function LandingCapabilities() {
  return (
    <section id="producto" className="py-14 md:py-16 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        <Reveal className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-col gap-2.5">
            <span className="text-[11.5px] font-medium uppercase tracking-[0.16em] text-brand-300">Qué podés cargar</span>
            <h2 className="font-display text-3xl md:text-[40px] font-bold tracking-tight text-white leading-[1.08]">
              Todo tu proyecto, en un solo lugar.
            </h2>
          </div>
          <p className="text-[15px] leading-relaxed text-white/50 max-w-sm">
            Tres piezas, un mismo proyecto: el conjunto desde arriba, cada ambiente por dentro y cada unidad con su
            número.
          </p>
        </Reveal>

        <div className="mt-8 grid md:grid-cols-[1.25fr_1fr] gap-3.5">
          <Reveal delay={0.05} className="md:row-span-2 border border-white/10 bg-white/[0.03] rounded-[18px] overflow-hidden flex flex-col">
            <Image
              src="/tours/sample-pano-2.png"
              alt="Recorrido virtual 360° de un ambiente"
              width={1024}
              height={1024}
              className="w-full flex-1 min-h-0 object-cover"
            />
            <div className="p-6 flex flex-col gap-2.5">
              <div className="flex items-center gap-2.5">
                <span className="w-[18px] h-[18px] rounded-full border-[1.5px] border-brand-300" />
                <h3 className="font-display text-[19px] font-bold text-white">Recorridos 360°</h3>
              </div>
              <p className="text-[14.5px] leading-relaxed text-white/55 max-w-md">
                Paseá cada ambiente como si estuvieras ahí. Las panorámicas se conectan entre sí y la luz sigue la
                orientación solar real según la hora del día.
              </p>
              <div className="flex flex-wrap gap-2 mt-1.5">
                <span className="text-xs text-white/60 border border-white/10 rounded-full px-2.5 py-1.5">
                  Hotspots entre ambientes
                </span>
                <span className="text-xs text-white/60 border border-white/10 rounded-full px-2.5 py-1.5">
                  Hora del día
                </span>
              </div>
            </div>
          </Reveal>

          <Reveal delay={0.1} className="border border-white/10 bg-white/[0.03] rounded-[18px] overflow-hidden">
            <Image
              src="/aerial/view-1.png"
              alt="Vista aérea interactiva del proyecto"
              width={1024}
              height={576}
              className="w-full aspect-video object-cover"
            />
            <div className="p-5.5 flex flex-col gap-2">
              <div className="flex items-center gap-2.5">
                <span className="w-[18px] h-[18px] border-[1.5px] border-brand-300" />
                <h3 className="font-display text-[19px] font-bold text-white">Masterplan interactivo</h3>
              </div>
              <p className="text-[14.5px] leading-relaxed text-white/55">
                Mostrá el conjunto completo y dejá que quien lo mire entre a cada unidad desde el plano.
              </p>
            </div>
          </Reveal>

          <Reveal delay={0.15} className="border border-white/10 bg-white/[0.03] rounded-[18px] overflow-hidden">
            <Image
              src="/floorplans/floor-1-render.png"
              alt="Plano de planta con unidades disponibles"
              width={1024}
              height={576}
              className="w-full aspect-video object-cover"
            />
            <div className="p-5.5 flex flex-col gap-2">
              <div className="flex items-center gap-2.5">
                <span className="w-[18px] h-[18px] border-[1.5px] border-brand-300 rotate-45" />
                <h3 className="font-display text-[19px] font-bold text-white">Plantas y unidades</h3>
              </div>
              <p className="text-[14.5px] leading-relaxed text-white/55">
                Planos 2D y 3D con precio, superficie y disponibilidad actualizada desde el panel.
              </p>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
