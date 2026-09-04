import Reveal from '@/components/ui/Reveal';

const STEPS = [
  {
    n: '01',
    title: 'Cargá el proyecto',
    copy: 'Datos, plantas, unidades con precio y superficie, amenidades y fotos. El wizard te guía la primera vez.',
  },
  {
    n: '02',
    title: 'Conectá los recorridos 360°',
    copy: 'Subís las panorámicas de cada ambiente, las unís con hotspots y calibrás la orientación solar.',
  },
  {
    n: '03',
    title: 'Compartí el link',
    copy: 'Cada proyecto tiene su propio sitio, listo para mandar a un cliente, a un concurso o a tu portfolio.',
  },
];

export default function LandingHowItWorks() {
  return (
    <section id="como-funciona" className="py-14 md:py-16 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto grid md:grid-cols-[.85fr_1.15fr] gap-12">
        <Reveal className="flex flex-col gap-3.5">
          <span className="text-[11.5px] font-medium uppercase tracking-[0.16em] text-brand-300">Cómo funciona</span>
          <h2 className="font-display text-3xl md:text-[40px] font-bold tracking-tight text-white leading-[1.08]">
            Así se arma tu sitio.
          </h2>
          <p className="text-[15.5px] leading-relaxed text-white/55">
            Tres pasos desde el panel de administración. No hay que tocar código ni contratar hosting.
          </p>
        </Reveal>

        <div className="flex flex-col">
          {STEPS.map((step, i) => (
            <Reveal
              key={step.n}
              delay={i * 0.06}
              className={`grid grid-cols-[52px_1fr] gap-5 py-5.5 border-t border-white/10 ${
                i === STEPS.length - 1 ? 'border-b' : ''
              }`}
            >
              <span className="font-display text-[15px] font-bold text-brand-400">{step.n}</span>
              <div className="flex flex-col gap-1.5">
                <h3 className="font-display text-xl font-bold text-white">{step.title}</h3>
                <p className="text-[14.5px] leading-relaxed text-white/55 max-w-lg">{step.copy}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
