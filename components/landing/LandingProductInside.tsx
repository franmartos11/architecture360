import Reveal from '@/components/ui/Reveal';

const CARDS = [
  {
    path: '/admin/inventario',
    placeholder: 'Captura del panel comercial (inventario)',
    title: 'Panel comercial',
    copy: 'Unidades, precios en lote y leads en un embudo.',
  },
  {
    path: '/admin/recorrido',
    placeholder: 'Captura del editor de recorrido 360',
    title: 'Editor de recorridos',
    copy: 'Subís panorámicas, las conectás y calibrás el norte.',
  },
  {
    path: '/proyecto/tu-obra',
    placeholder: 'Captura del sitio publicado del proyecto',
    title: 'Sitio publicado',
    copy: 'Con el tema y la tipografía que elegís para el proyecto.',
  },
];

export default function LandingProductInside() {
  return (
    <section className="border-y border-white/10 bg-white/[0.02]">
      <div className="max-w-7xl mx-auto py-14 md:py-16 px-4 sm:px-6 lg:px-8 flex flex-col gap-7">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h2 className="font-display text-2xl md:text-[34px] font-bold tracking-tight text-white">
            El producto por dentro.
          </h2>
          <p className="text-[15px] text-white/50 max-w-md leading-relaxed">
            El panel donde cargás todo, el editor de recorridos y el sitio que reciben tus clientes.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-3.5">
          {CARDS.map((card, i) => (
            <Reveal key={card.path} delay={i * 0.06} className="border border-white/10 rounded-[14px] overflow-hidden bg-[#111010]">
              <div className="h-[30px] flex items-center gap-1.5 px-3 border-b border-white/10">
                <span className="w-2 h-2 rounded-full bg-white/[0.18]" />
                <span className="w-2 h-2 rounded-full bg-white/[0.18]" />
                <span className="w-2 h-2 rounded-full bg-white/[0.18]" />
                <span className="ml-2 font-mono text-[10.5px] text-white/40">{card.path}</span>
              </div>
              <div className="h-[210px] flex items-center justify-center bg-gradient-to-br from-white/[0.04] to-transparent">
                <span className="font-mono text-[11px] text-white/30 text-center px-6">{card.placeholder}</span>
              </div>
              <div className="p-4 flex flex-col gap-1">
                <h3 className="font-display text-base font-bold text-white">{card.title}</h3>
                <p className="text-[13.5px] leading-relaxed text-white/50">{card.copy}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
