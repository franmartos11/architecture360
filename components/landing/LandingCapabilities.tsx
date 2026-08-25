import Image from 'next/image';
import { Orbit, Map, LayoutGrid } from 'lucide-react';
import Reveal from '@/components/ui/Reveal';

const CELLS = [
  {
    icon: Orbit,
    title: 'Recorridos 360°',
    copy: 'Paseá cada ambiente como si estuvieras ahí, con orientación solar real según la hora del día.',
    image: '/tours/sample-pano-2.png',
    alt: 'Recorrido virtual 360° de un ambiente',
  },
  {
    icon: Map,
    title: 'Masterplan interactivo',
    copy: 'Mostrá el proyecto completo y dejá que quien lo mire recorra cada unidad desde el plano.',
    image: '/aerial/view-1.png',
    alt: 'Vista aérea interactiva del proyecto',
  },
  {
    icon: LayoutGrid,
    title: 'Plantas y unidades',
    copy: 'Planos 2D y 3D con precios, superficies y disponibilidad actualizada.',
    image: '/floorplans/floor-1-render.png',
    alt: 'Plano de planta con unidades disponibles',
  },
];

export default function LandingCapabilities() {
  return (
    <section id="producto" className="py-20 md:py-28 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        <Reveal>
          <span className="text-xs font-medium uppercase tracking-[0.18em] text-brand-400">Qué podés cargar</span>
          <h2 className="font-display mt-3 text-3xl md:text-4xl font-bold tracking-tight text-white max-w-xl">
            Todo tu proyecto, en un solo lugar.
          </h2>
        </Reveal>

        <div className="mt-10 grid md:grid-cols-2 gap-5">
          <Reveal delay={0.05} className="md:row-span-2">
            <Cell cell={CELLS[0]} large />
          </Reveal>
          <Reveal delay={0.1}>
            <Cell cell={CELLS[1]} />
          </Reveal>
          <Reveal delay={0.15}>
            <Cell cell={CELLS[2]} />
          </Reveal>
        </div>
      </div>
    </section>
  );
}

function Cell({ cell, large = false }: { cell: (typeof CELLS)[number]; large?: boolean }) {
  const Icon = cell.icon;
  return (
    <div className="h-full rounded-2xl border border-white/10 bg-white/[0.03] overflow-hidden flex flex-col">
      <div className={`relative ${large ? 'aspect-[4/3]' : 'aspect-[16/10]'}`}>
        <Image src={cell.image} alt={cell.alt} fill className="object-cover" />
      </div>
      <div className="p-6 flex flex-col gap-2">
        <Icon className="w-5 h-5 text-brand-400" strokeWidth={1.5} />
        <h3 className="font-display text-lg font-semibold text-white">{cell.title}</h3>
        <p className="text-sm text-white/55 leading-relaxed">{cell.copy}</p>
      </div>
    </div>
  );
}
